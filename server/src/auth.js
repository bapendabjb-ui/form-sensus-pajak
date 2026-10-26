"use strict";

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const config = require("./config");
const prisma = require("./prisma");
const { ApiError, unauthorized, forbidden } = require("./http");

const BCRYPT_ROUNDS = 10;

const PASSWORD_MIN = 8;
const PASSWORD_MAKS = 72; // bcrypt hanya membaca 72 byte pertama

/**
 * Password yang tidak boleh dipakai di produksi. Bukan daftar lengkap - hanya
 * penjaga terhadap nilai bawaan yang tersalin dari .env.example dan tidak
 * pernah diganti.
 */
const PASSWORD_LEMAH = new Set(["admin123", "admin", "password", "12345678", "sensuspajak", "rahasia"]);

const passwordLemah = (p) =>
  !p || p.length < PASSWORD_MIN || PASSWORD_LEMAH.has(String(p).toLowerCase());

const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

/**
 * Token admin membawa `ver` = Admin.tokenVersi saat token dibuat. Mengganti
 * password menaikkan angka itu, sehingga token lama yang masih dalam masa
 * berlaku (12 jam) langsung ditolak - inti dari "ganti password mencabut sesi".
 * Sesi admin sengaja tidak diperpanjang: admin tetap login ulang tiap 12 jam.
 */
function signAdminToken(admin) {
  return jwt.sign(
    { sub: admin.id, username: admin.username, role: "admin", ver: admin.tokenVersi ?? 0 },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/**
 * Token petugas: HP diingat selama JWT_PETUGAS_EXPIRES_IN (bawaan 30 hari) dan
 * diperpanjang selama dipakai (lihat perluPerpanjang). `ver` = Petugas.tokenVersi,
 * jadi ganti password, hapus akun, atau "keluarkan dari semua HP" mencabutnya.
 */
function signPetugasToken(petugas) {
  return jwt.sign(
    { sub: petugas.id, role: "petugas", ver: petugas.tokenVersi ?? 0 },
    config.jwtSecret,
    { expiresIn: config.jwtPetugasExpiresIn }
  );
}

/** Token petugas diperbarui paling sering sekali sehari. */
const PERPANJANG_SETELAH_MS = 24 * 60 * 60 * 1000;

/**
 * Apakah token ini perlu diganti dengan yang baru? Hanya token petugas: masa
 * 30 harinya dihitung dari pemakaian terakhir, jadi petugas yang membuka
 * aplikasi minimal sebulan sekali tidak perlu login lagi. Sesi admin tetap
 * berakhir sesuai jadwalnya walau terus dipakai.
 */
const perluPerpanjang = (payload, sekarangMs = Date.now()) =>
  payload?.role === "petugas" && sekarangMs - Number(payload.iat) * 1000 >= PERPANJANG_SETELAH_MS;

/*
 * Cookie khusus foto. <img src> tidak bisa membawa header Authorization, jadi
 * saat login diwajibkan foto dibuka lewat cookie berisi token yang sama.
 * Path-nya /api/foto: browser tidak mengirimnya ke endpoint lain, sehingga
 * cookie ini tidak bisa dipakai untuk memicu aksi tulis dari situs lain (CSRF).
 */
const COOKIE_FOTO = "sp_foto";
const PATH_FOTO = "/api/foto";

const opsiCookieFoto = (req) => ({ httpOnly: true, sameSite: "lax", secure: Boolean(req.secure), path: PATH_FOTO });

function pasangCookieFoto(req, res, token) {
  const { exp } = jwt.decode(token) || {};
  res.cookie(COOKIE_FOTO, token, { ...opsiCookieFoto(req), ...(exp ? { expires: new Date(exp * 1000) } : {}) });
}

const hapusCookieFoto = (req, res) => res.clearCookie(COOKIE_FOTO, opsiCookieFoto(req));

/** Nilai satu cookie dari header Cookie, tanpa pustaka tambahan. */
function bacaCookie(header, nama) {
  for (const bagian of String(header || "").split(";")) {
    const i = bagian.indexOf("=");
    if (i > 0 && bagian.slice(0, i).trim() === nama) {
      try {
        return decodeURIComponent(bagian.slice(i + 1).trim());
      } catch {
        return "";
      }
    }
  }
  return "";
}

/** Token dari header Authorization; cookie foto hanya untuk permintaan baca. */
function readToken(req) {
  const header = req.headers.authorization || "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  if (req.method === "GET" || req.method === "HEAD") return bacaCookie(req.headers.cookie, COOKIE_FOTO);
  return "";
}

/**
 * Pemakai yang sedang masuk, atau null bila tidak ada token, tokennya tidak
 * sah / kedaluwarsa, atau sudah dicabut (versinya berbeda dari database).
 *   admin   : { role: "admin", id, username, nama: username, payload }
 *   petugas : { role: "petugas", id, username, nama, payload }
 *
 * Hasilnya disimpan di req: gerbang login, requireAdmin, dan rute yang mencatat
 * pelaku berbagi satu pencarian primary key per permintaan. Pencarian itu
 * disengaja - tanpanya token yang dicabut tetap hidup sampai kedaluwarsa.
 */
function bacaPengguna(req) {
  if (!req._pengguna) req._pengguna = muatPengguna(readToken(req));
  return req._pengguna;
}

async function muatPengguna(token) {
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id <= 0) return null;

  if (payload.role === "admin") {
    const a = await prisma.admin.findUnique({
      where: { id },
      select: { id: true, username: true, tokenVersi: true },
    });
    if (!a || (payload.ver ?? 0) !== a.tokenVersi) return null;
    return { role: "admin", id: a.id, username: a.username, nama: a.username, payload };
  }

  if (payload.role === "petugas") {
    const p = await prisma.petugas.findUnique({
      where: { id },
      select: { id: true, nama: true, username: true, passwordHash: true, tokenVersi: true },
    });
    if (!p || !p.passwordHash || (payload.ver ?? 0) !== p.tokenVersi) return null;
    return { role: "petugas", id: p.id, username: p.username, nama: p.nama, payload };
  }

  return null;
}

/**
 * Middleware: hanya lolos untuk admin yang masuk dengan token sah. Petugas yang
 * sudah masuk dijawab 403, bukan 401, supaya klien tidak mengira sesinya habis
 * lalu mengeluarkannya.
 */
async function requireAdmin(req, _res, next) {
  try {
    if (!readToken(req)) return next(unauthorized("Login admin diperlukan."));
    const pengguna = await bacaPengguna(req);
    if (!pengguna) return next(unauthorized("Sesi sudah berakhir. Silakan login kembali."));
    if (pengguna.role !== "admin") return next(forbidden("Hanya admin yang boleh melakukan ini."));
    req.admin = { ...pengguna.payload, id: pengguna.id, username: pengguna.username };
    return next();
  } catch (e) {
    return next(e);
  }
}

/**
 * Admin yang sedang login, atau null - untuk aksi yang terbuka bagi semua tetapi
 * mencatat pelakunya. Token yang tidak sah dianggap tidak ada, bukan ditolak.
 * @returns {Promise<{ id: number, username: string } | null>}
 */
async function bacaAdmin(req) {
  const p = await bacaPengguna(req);
  return p && p.role === "admin" ? { id: p.id, username: p.username } : null;
}

/** Nama yang dicatat sebagai pelaku: nama petugas, username admin, atau "" tanpa login. */
async function namaPelaku(req) {
  const p = await bacaPengguna(req);
  return p ? p.nama : "";
}

/**
 * Jalur yang tetap terbuka walau login diwajibkan: login itu sendiri, konfigurasi
 * awal aplikasi, dan angka ringkasan Dashboard - supaya pimpinan bisa memantau
 * tanpa akun. Ringkasan itu hanya hitungan dan nama petugas, tanpa data wajib pajak.
 */
const bebasGerbang = (path) =>
  path === "/konfigurasi" || path === "/health" || path === "/dashboard/stats" || path.startsWith("/auth/");

/**
 * Gerbang login untuk seluruh /api.
 *
 * - Token petugas yang umurnya lewat sehari diganti lewat header X-Token-Baru
 *   (klien menyimpannya otomatis) dan cookie fotonya ikut diperbarui.
 * - Bila `wajib()` true, permintaan tanpa sesi yang sah ditolak 401 dengan
 *   `perluMasuk: true`, kecuali jalur di bebasGerbang. Saat false, aplikasi
 *   terbuka seperti sebelum ada login petugas.
 *
 * @param {() => Promise<boolean>} wajib  pembaca saklar "wajib login" (src/pengaturan.js)
 */
function gerbangMasuk(wajib) {
  return async (req, res, next) => {
    try {
      const pengguna = await bacaPengguna(req);
      if (pengguna && perluPerpanjang(pengguna.payload)) {
        const baru = signPetugasToken({ id: pengguna.id, tokenVersi: pengguna.payload.ver });
        res.setHeader("X-Token-Baru", baru);
        pasangCookieFoto(req, res, baru);
      }
      if (pengguna || bebasGerbang(req.path) || !(await wajib())) return next();
      return next(new ApiError(401, "Silakan masuk dengan akun Anda terlebih dahulu.", { perluMasuk: true }));
    } catch (e) {
      return next(e);
    }
  };
}

/**
 * Seed akun admin dari ADMIN_USERNAME / ADMIN_PASSWORD bila belum ada.
 * Dijalankan setiap start, idempoten.
 *
 * Bila akunnya belum ada dan password yang akan dipakai lemah, proses dihentikan
 * di produksi: membuat akun `admin` / `admin123` yang terbuka ke internet sama
 * saja dengan tidak memasang login. Bila akunnya sudah ada, ADMIN_PASSWORD tidak
 * dipakai sama sekali - cukup diperingatkan supaya nilai lama di .env tidak
 * menyesatkan, dan deploy ulang tidak gagal hanya karena itu.
 */
async function ensureAdminSeed() {
  const username = config.adminUsername;
  const existing = await prisma.admin.findUnique({ where: { username } });

  if (existing) {
    if (config.isProd && passwordLemah(config.adminPassword)) {
      console.warn(
        "[Sensus Pajak] ADMIN_PASSWORD di environment masih bernilai lemah. " +
          "Nilainya tidak dipakai (akun sudah ada), tetapi sebaiknya dikosongkan atau diganti."
      );
    }
    return { created: false, username };
  }

  if (config.isProd && passwordLemah(config.adminPassword)) {
    console.error(
      "[Sensus Pajak] ADMIN_PASSWORD wajib diisi di produksi dengan password yang kuat " +
        `(minimal ${PASSWORD_MIN} karakter, bukan nilai contoh seperti "admin123"). ` +
        `Akun admin "${username}" belum ada dan tidak akan dibuat dengan password lemah. Hentikan proses.`
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(config.adminPassword);
  await prisma.admin.create({ data: { username, passwordHash } });
  return { created: true, username };
}

module.exports = {
  PASSWORD_MIN,
  PASSWORD_MAKS,
  passwordLemah,
  hashPassword,
  verifyPassword,
  signAdminToken,
  signPetugasToken,
  perluPerpanjang,
  pasangCookieFoto,
  hapusCookieFoto,
  bacaCookie,
  readToken,
  bacaPengguna,
  requireAdmin,
  bacaAdmin,
  namaPelaku,
  bebasGerbang,
  gerbangMasuk,
  ensureAdminSeed,
};

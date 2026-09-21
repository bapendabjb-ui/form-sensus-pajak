"use strict";

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const config = require("./config");
const prisma = require("./prisma");
const { unauthorized } = require("./http");

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
 */
function signAdminToken(admin) {
  return jwt.sign(
    { sub: admin.id, username: admin.username, role: "admin", ver: admin.tokenVersi ?? 0 },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function readToken(req) {
  const header = req.headers.authorization || "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return "";
}

/**
 * Middleware: hanya lolos bila membawa JWT admin yang valid DAN versinya masih
 * sama dengan yang tercatat di database.
 *
 * Pemeriksaan versi berarti satu pencarian primary key per permintaan admin.
 * Itu disengaja: aksi admin jarang dibanding pekerjaan lapangan, dan tanpa
 * pemeriksaan ini token yang dicabut tetap hidup sampai kedaluwarsa.
 */
async function requireAdmin(req, _res, next) {
  const token = readToken(req);
  if (!token) return next(unauthorized("Login admin diperlukan."));

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(unauthorized("Sesi admin sudah berakhir. Silakan login kembali."));
  }
  if (payload.role !== "admin") return next(unauthorized("Token bukan token admin."));

  try {
    const admin = await prisma.admin.findUnique({
      where: { id: Number(payload.sub) },
      select: { id: true, username: true, tokenVersi: true },
    });
    if (!admin) return next(unauthorized("Akun admin tidak ditemukan. Silakan login kembali."));
    if ((payload.ver ?? 0) !== admin.tokenVersi) {
      return next(unauthorized("Password sudah diganti. Silakan login kembali."));
    }
    req.admin = { ...payload, id: admin.id, username: admin.username };
    return next();
  } catch (e) {
    return next(e);
  }
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
  requireAdmin,
  ensureAdminSeed,
};

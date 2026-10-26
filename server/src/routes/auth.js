"use strict";

const express = require("express");
const prisma = require("../prisma");
const {
  PASSWORD_MIN,
  PASSWORD_MAKS,
  hashPassword,
  verifyPassword,
  signAdminToken,
  signPetugasToken,
  signPejabatToken,
  pasangCookieFoto,
  hapusCookieFoto,
  bacaCookie,
  readToken,
  bacaPengguna,
} = require("../auth");
const { normalUsername } = require("../akunPetugas");
const { wrap, badRequest, unauthorized } = require("../http");
const { pembatas } = require("../laju");

const router = express.Router();

/**
 * Pembatas percobaan login.
 *
 * Hanya percobaan yang GAGAL yang dihitung, jadi pemakai yang tahu passwordnya
 * tidak pernah terkunci sendiri - hanya penebak yang terkena.
 *
 * Dua lapis: 10 kegagalan per 15 menit untuk satu username dari satu IP (cukup
 * longgar untuk salah ketik, tetapi membuat penebakan tidak ada artinya melawan
 * bcrypt), dan 50 per IP untuk semua username. Lapis kedua sengaja longgar:
 * puluhan petugas yang belajar login bersama di kantor keluar lewat IP yang
 * sama, dan salah ketik mereka tidak boleh saling mengunci.
 */
const PESAN_BATAS = "Terlalu banyak percobaan login yang gagal. Coba lagi dalam beberapa menit.";
const batasiLogin = pembatas({
  jendelaMs: 15 * 60 * 1000,
  maks: 10,
  hanyaGagal: true,
  kunci: (req) => `${req.ip || "anon"}|${normalUsername(req.body?.username)}`,
  pesan: PESAN_BATAS,
});
const batasiLoginIp = pembatas({ jendelaMs: 15 * 60 * 1000, maks: 50, hanyaGagal: true, pesan: PESAN_BATAS });

const SALAH = "Username atau password salah.";

/**
 * Hash pembanding untuk username yang tidak ada. Tanpa ini jawaban untuk
 * username asing jauh lebih cepat (tanpa bcrypt), dan selisih waktunya
 * membocorkan username mana yang terdaftar.
 */
let hashPalsu = null;
const bandingkanPalsu = async (password) => {
  if (!hashPalsu) hashPalsu = hashPassword("bukan-password-siapa-pun");
  await verifyPassword(password, await hashPalsu);
};

/** Identitas pemakai yang dikirim ke klien. */
const profil = (p) => {
  if (p.role === "admin") return { role: "admin", username: p.username, nama: p.username };
  if (p.role === "pejabat") return { role: "pejabat", username: p.username, nama: p.nama };
  return { role: "petugas", username: p.username, nama: p.nama, petugasId: p.id };
};

/** Tabel & pembuat token per peran, untuk ganti password. */
const AKUN = {
  admin: { tabel: () => prisma.admin, token: signAdminToken },
  petugas: { tabel: () => prisma.petugas, token: signPetugasToken },
  pejabat: { tabel: () => prisma.pejabat, token: signPejabatToken },
};

/**
 * POST /api/auth/login  { username, password } -> { token, role, username, nama, petugasId? }
 *
 * Satu pintu untuk admin, petugas, dan pejabat. Dicari berurutan admin ->
 * petugas -> pejabat; username tidak boleh sama di antara ketiganya (dijaga
 * saat akun dibuat, lihat src/username.js), jadi tidak pernah tertukar. Sesi
 * admin 12 jam; sesi petugas & pejabat diingat di HP (30 hari sejak terakhir dipakai).
 */
router.post(
  "/login",
  batasiLoginIp,
  batasiLogin,
  wrap(async (req, res) => {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    if (!username || !password) throw badRequest("Username dan password wajib diisi.");

    const admin = await prisma.admin.findUnique({ where: { username } });
    if (admin) {
      if (!(await verifyPassword(password, admin.passwordHash))) throw unauthorized(SALAH);
      const token = signAdminToken(admin);
      pasangCookieFoto(req, res, token);
      return res.json({ token, ...profil({ role: "admin", ...admin }) });
    }

    const kunci = normalUsername(username);
    const petugas = await prisma.petugas.findUnique({ where: { username: kunci } });
    if (petugas && petugas.passwordHash) {
      if (!(await verifyPassword(password, petugas.passwordHash))) throw unauthorized(SALAH);
      await prisma.petugas.update({ where: { id: petugas.id }, data: { masukTerakhir: new Date() } });
      const token = signPetugasToken(petugas);
      pasangCookieFoto(req, res, token);
      return res.json({ token, ...profil({ role: "petugas", ...petugas }) });
    }

    const pejabat = await prisma.pejabat.findUnique({ where: { username: kunci } });
    if (!pejabat) {
      await bandingkanPalsu(password);
      throw unauthorized(SALAH);
    }
    if (!(await verifyPassword(password, pejabat.passwordHash))) throw unauthorized(SALAH);
    await prisma.pejabat.update({ where: { id: pejabat.id }, data: { masukTerakhir: new Date() } });
    const token = signPejabatToken(pejabat);
    pasangCookieFoto(req, res, token);
    return res.json({ token, ...profil({ role: "pejabat", ...pejabat }) });
  })
);

/**
 * GET /api/auth/me -> profil pemakai yang sedang masuk (dipakai klien saat aplikasi dibuka).
 *
 * Perpanjangan sesi petugas sudah ditangani gerbang login (header X-Token-Baru).
 * Sesi yang dibuat sebelum ada cookie foto diberi cookie-nya di sini, supaya
 * foto tetap tampil setelah login diwajibkan tanpa harus login ulang.
 */
router.get(
  "/me",
  wrap(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const p = await bacaPengguna(req);
    if (!p) throw unauthorized("Sesi sudah berakhir. Silakan login kembali.");
    if (!res.getHeader("X-Token-Baru") && !bacaCookie(req.headers.cookie, "sp_foto")) {
      pasangCookieFoto(req, res, readToken(req));
    }
    res.json(profil(p));
  })
);

/**
 * PUT /api/auth/password  { passwordLama, passwordBaru } -> ganti password sendiri (admin maupun petugas).
 * Password lama yang salah dijawab 400, bukan 401, supaya klien tidak ikut logout.
 *
 * tokenVersi dinaikkan bersamaan dengan hash barunya: seluruh token yang sudah
 * beredar - termasuk di HP lain - langsung tidak berlaku. Klien yang sedang
 * mengganti password diberi token baru supaya tidak ikut terlempar.
 */
router.put(
  "/password",
  wrap(async (req, res) => {
    const p = await bacaPengguna(req);
    if (!p) throw unauthorized("Sesi sudah berakhir. Silakan login kembali.");

    const passwordLama = String(req.body?.passwordLama || "");
    const passwordBaru = String(req.body?.passwordBaru || "");
    if (!passwordLama || !passwordBaru) throw badRequest("Password lama dan password baru wajib diisi.");
    if (passwordBaru.length < PASSWORD_MIN) throw badRequest(`Password baru minimal ${PASSWORD_MIN} karakter.`);
    if (Buffer.byteLength(passwordBaru) > PASSWORD_MAKS) {
      throw badRequest(`Password baru maksimal ${PASSWORD_MAKS} karakter.`);
    }

    const { tabel: ambilTabel, token: buatToken } = AKUN[p.role];
    const tabel = ambilTabel();
    const akun = await tabel.findUnique({ where: { id: p.id } });
    if (!akun || !akun.passwordHash) throw unauthorized("Akun tidak ditemukan. Silakan login kembali.");

    const cocok = await verifyPassword(passwordLama, akun.passwordHash);
    if (!cocok) throw badRequest("Password lama salah.");
    if (passwordLama === passwordBaru) throw badRequest("Password baru harus berbeda dari password lama.");

    const diperbarui = await tabel.update({
      where: { id: akun.id },
      data: { passwordHash: await hashPassword(passwordBaru), tokenVersi: { increment: 1 } },
    });

    const token = buatToken(diperbarui);
    pasangCookieFoto(req, res, token);
    res.json({ ok: true, token });
  })
);

/**
 * POST /api/auth/keluar -> buang cookie foto di browser ini. Token di klien
 * dibuang oleh klien sendiri; sesi di HP lain tidak tersentuh.
 */
router.post("/keluar", (req, res) => {
  hapusCookieFoto(req, res);
  res.status(204).end();
});

module.exports = router;

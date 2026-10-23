"use strict";

const express = require("express");
const prisma = require("../prisma");
const {
  PASSWORD_MIN,
  PASSWORD_MAKS,
  hashPassword,
  verifyPassword,
  signAdminToken,
  perluPerpanjang,
  requireAdmin,
} = require("../auth");
const { wrap, badRequest, unauthorized } = require("../http");
const { pembatas } = require("../laju");

const router = express.Router();

/**
 * Pembatas percobaan login.
 *
 * Hanya percobaan yang GAGAL yang dihitung, jadi admin yang tahu passwordnya
 * tidak pernah terkunci sendiri - hanya penebak yang terkena. 10 kegagalan per
 * 15 menit per IP cukup longgar untuk salah ketik, tetapi membuat penebakan
 * berurutan tidak ada artinya melawan bcrypt.
 */
const batasiLogin = pembatas({
  jendelaMs: 15 * 60 * 1000,
  maks: 10,
  hanyaGagal: true,
  pesan: "Terlalu banyak percobaan login yang gagal. Coba lagi dalam beberapa menit.",
});

/**
 * POST /api/auth/login  { username, password, ingat? } -> { token, username }
 * `ingat: true` = "Ingat saya di perangkat ini": token 30 hari, bukan 12 jam.
 */
router.post(
  "/login",
  batasiLogin,
  wrap(async (req, res) => {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    const ingat = req.body?.ingat === true;
    if (!username || !password) throw badRequest("Username dan password wajib diisi.");

    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin) throw unauthorized("Username atau password salah.");

    const cocok = await verifyPassword(password, admin.passwordHash);
    if (!cocok) throw unauthorized("Username atau password salah.");

    res.json({ token: signAdminToken(admin, { ingat }), username: admin.username });
  })
);

/**
 * GET /api/auth/me -> memastikan token masih berlaku (dipakai klien saat aplikasi dibuka).
 *
 * Token "Ingat saya" yang umurnya sudah lewat sehari dikirim balik dalam versi
 * baru (`token`), jadi masa 30 harinya dihitung dari pemakaian terakhir: admin
 * yang membuka aplikasi minimal sebulan sekali tidak perlu login lagi.
 * requireAdmin sudah memastikan `ver` sama dengan database, jadi token baru
 * tidak bisa menghidupkan sesi yang sudah dicabut.
 */
router.get("/me", requireAdmin, (req, res) => {
  // Jawabannya bisa membawa token: jangan sampai tersimpan di cache browser.
  res.setHeader("Cache-Control", "no-store");
  const hasil = { username: req.admin.username, role: "admin" };
  if (perluPerpanjang(req.admin)) {
    hasil.token = signAdminToken(
      { id: req.admin.id, username: req.admin.username, tokenVersi: req.admin.ver ?? 0 },
      { ingat: true }
    );
  }
  res.json(hasil);
});

/**
 * PUT /api/auth/password  { passwordLama, passwordBaru } -> ganti password admin yang sedang login.
 * Password lama yang salah dijawab 400, bukan 401, supaya klien tidak ikut logout.
 *
 * tokenVersi dinaikkan bersamaan dengan hash barunya: seluruh token yang sudah
 * beredar - termasuk di perangkat lain - langsung tidak berlaku. Klien yang
 * sedang mengganti password diberi token baru supaya tidak ikut terlempar.
 */
router.put(
  "/password",
  requireAdmin,
  wrap(async (req, res) => {
    const passwordLama = String(req.body?.passwordLama || "");
    const passwordBaru = String(req.body?.passwordBaru || "");
    if (!passwordLama || !passwordBaru) throw badRequest("Password lama dan password baru wajib diisi.");
    if (passwordBaru.length < PASSWORD_MIN) throw badRequest(`Password baru minimal ${PASSWORD_MIN} karakter.`);
    if (Buffer.byteLength(passwordBaru) > PASSWORD_MAKS) {
      throw badRequest(`Password baru maksimal ${PASSWORD_MAKS} karakter.`);
    }

    const admin = await prisma.admin.findUnique({ where: { id: Number(req.admin.sub) } });
    if (!admin) throw unauthorized("Akun admin tidak ditemukan. Silakan login kembali.");

    const cocok = await verifyPassword(passwordLama, admin.passwordHash);
    if (!cocok) throw badRequest("Password lama salah.");
    if (passwordLama === passwordBaru) throw badRequest("Password baru harus berbeda dari password lama.");

    const diperbarui = await prisma.admin.update({
      where: { id: admin.id },
      data: { passwordHash: await hashPassword(passwordBaru), tokenVersi: { increment: 1 } },
    });

    res.json({ ok: true, token: signAdminToken(diperbarui, { ingat: Boolean(req.admin.ingat) }) });
  })
);

module.exports = router;

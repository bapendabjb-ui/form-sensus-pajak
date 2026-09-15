"use strict";

const express = require("express");
const prisma = require("../prisma");
const { hashPassword, verifyPassword, signAdminToken, requireAdmin } = require("../auth");
const { wrap, badRequest, unauthorized } = require("../http");

const PASSWORD_MIN = 8;
const PASSWORD_MAKS = 72; // bcrypt hanya membaca 72 byte pertama

const router = express.Router();

/** POST /api/auth/login -> { token, username } */
router.post(
  "/login",
  wrap(async (req, res) => {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    if (!username || !password) throw badRequest("Username dan password wajib diisi.");

    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin) throw unauthorized("Username atau password salah.");

    const cocok = await verifyPassword(password, admin.passwordHash);
    if (!cocok) throw unauthorized("Username atau password salah.");

    res.json({ token: signAdminToken(admin), username: admin.username });
  })
);

/** GET /api/auth/me -> memastikan token masih berlaku (dipakai klien saat reload). */
router.get("/me", requireAdmin, (req, res) => {
  res.json({ username: req.admin.username, role: "admin" });
});

/**
 * PUT /api/auth/password  { passwordLama, passwordBaru } -> ganti password admin yang sedang login.
 * Password lama yang salah dijawab 400, bukan 401, supaya klien tidak ikut logout.
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

    await prisma.admin.update({
      where: { id: admin.id },
      data: { passwordHash: await hashPassword(passwordBaru) },
    });
    res.json({ ok: true });
  })
);

module.exports = router;

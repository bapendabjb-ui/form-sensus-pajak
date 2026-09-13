"use strict";

const express = require("express");
const prisma = require("../prisma");
const { verifyPassword, signAdminToken, requireAdmin } = require("../auth");
const { wrap, badRequest, unauthorized } = require("../http");

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

module.exports = router;

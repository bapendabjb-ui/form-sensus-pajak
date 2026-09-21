"use strict";

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const config = require("./config");
const prisma = require("./prisma");
const { unauthorized } = require("./http");

const BCRYPT_ROUNDS = 10;

const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

function signAdminToken(admin) {
  return jwt.sign(
    { sub: admin.id, username: admin.username, role: "admin" },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function readToken(req) {
  const header = req.headers.authorization || "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return "";
}

/** Middleware: hanya lolos bila membawa JWT admin yang valid. */
function requireAdmin(req, _res, next) {
  const token = readToken(req);
  if (!token) return next(unauthorized("Login admin diperlukan."));
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.role !== "admin") return next(unauthorized("Token bukan token admin."));
    req.admin = payload;
    return next();
  } catch {
    return next(unauthorized("Sesi admin sudah berakhir. Silakan login kembali."));
  }
}

/**
 * Middleware: kenali admin bila tokennya dibawa, tetapi jangan pernah menolak.
 *
 * Dipakai oleh route yang terbuka untuk petugas namun menyimpan bagian yang
 * hanya boleh dilihat admin (mis. koordinat rekaman otomatis pada entri).
 * Token yang tidak sah diperlakukan sama dengan tidak ada token: permintaan
 * tetap lanjut sebagai bukan-admin.
 */
function adminOpsional(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      if (payload.role === "admin") req.admin = payload;
    } catch {
      /* token kedaluwarsa / palsu: lanjut sebagai petugas biasa */
    }
  }
  return next();
}

/** Apakah permintaan ini datang dari admin yang sudah lolos salah satu middleware di atas. */
const isAdmin = (req) => !!req.admin;

/**
 * Seed akun admin dari ADMIN_USERNAME / ADMIN_PASSWORD bila belum ada.
 * Dijalankan setiap start, idempoten.
 */
async function ensureAdminSeed() {
  const username = config.adminUsername;
  const existing = await prisma.admin.findUnique({ where: { username } });
  if (existing) return { created: false, username };
  const passwordHash = await hashPassword(config.adminPassword);
  await prisma.admin.create({ data: { username, passwordHash } });
  return { created: true, username };
}

module.exports = {
  hashPassword,
  verifyPassword,
  signAdminToken,
  requireAdmin,
  adminOpsional,
  isAdmin,
  ensureAdminSeed,
};

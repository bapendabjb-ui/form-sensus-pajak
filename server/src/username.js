"use strict";

/**
 * Satu username hanya untuk satu akun, di antara admin, petugas, dan pejabat.
 * Login mencari ketiganya berurutan (src/routes/auth.js), jadi username kembar
 * membuat salah satu akun tidak pernah bisa masuk.
 */

const prisma = require("./prisma");
const { conflict } = require("./http");

/**
 * Tolak `username` (sudah dinormalkan) yang dipakai akun lain.
 * @param {string} username
 * @param {{ petugasId?: number, pejabatId?: number }} [kecuali]  akun yang sedang diubah
 */
async function pastikanUsernameBebas(username, { petugasId = 0, pejabatId = 0 } = {}) {
  const [admin, petugas, pejabat] = await Promise.all([
    prisma.admin.findUnique({ where: { username }, select: { id: true } }),
    prisma.petugas.findFirst({ where: { username, id: { not: petugasId } }, select: { nama: true } }),
    prisma.pejabat.findFirst({ where: { username, id: { not: pejabatId } }, select: { nama: true } }),
  ]);
  if (admin) throw conflict(`Username ${username} sudah dipakai akun admin.`);
  if (petugas) throw conflict(`Username ${username} sudah dipakai ${petugas.nama}.`);
  if (pejabat) throw conflict(`Username ${username} sudah dipakai akun pejabat ${pejabat.nama}.`);
}

/** Semua username yang sudah dipakai (huruf kecil), untuk membuat banyak akun sekaligus. */
async function usernameTerpakai() {
  const [petugas, admin, pejabat] = await Promise.all([
    prisma.petugas.findMany({ where: { username: { not: null } }, select: { username: true } }),
    prisma.admin.findMany({ select: { username: true } }),
    prisma.pejabat.findMany({ select: { username: true } }),
  ]);
  return new Set([...petugas, ...admin, ...pejabat].map((a) => a.username.toLowerCase()));
}

module.exports = { pastikanUsernameBebas, usernameTerpakai };

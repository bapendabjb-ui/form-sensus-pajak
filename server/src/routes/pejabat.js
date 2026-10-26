"use strict";

/**
 * Akun pejabat (pimpinan) - hanya melihat kertas kerja, data, dan peta.
 * Semua rute di sini khusus admin. Larangan menulis bagi pejabat sendiri
 * dijaga di src/auth.js (tolakTulisPejabat), bukan di sini.
 */

const express = require("express");
const prisma = require("../prisma");
const { requireAdmin, hashPassword } = require("../auth");
const { wrap, badRequest, notFound, parseId } = require("../http");
const { normalUsername, galatUsername, galatPassword } = require("../akunPetugas");
const { pastikanUsernameBebas } = require("../username");

const router = express.Router();

router.use(requireAdmin);

const NAMA_MAKS = 150;

const bentuk = (p) => ({
  id: p.id,
  nama: p.nama,
  username: p.username,
  masukTerakhir: p.masukTerakhir,
  createdAt: p.createdAt,
});

function bacaNama(body) {
  const nama = String(body?.nama || "").trim().replace(/\s+/g, " ");
  if (!nama) throw badRequest("Nama atau jabatan wajib diisi.");
  if (nama.length > NAMA_MAKS) throw badRequest(`Nama maksimal ${NAMA_MAKS} karakter.`);
  return nama;
}

function bacaUsername(body) {
  const username = normalUsername(body?.username);
  const galat = galatUsername(username);
  if (galat) throw badRequest(galat);
  return username;
}

function periksaPassword(password) {
  const galat = galatPassword(password);
  if (galat) throw badRequest(galat);
}

/** GET /api/pejabat -> daftar akun pejabat. */
router.get(
  "/",
  wrap(async (_req, res) => {
    const list = await prisma.pejabat.findMany({ orderBy: { nama: "asc" } });
    res.json(list.map(bentuk));
  })
);

/** POST /api/pejabat  { nama, username, password } -> buat akun pejabat. */
router.post(
  "/",
  wrap(async (req, res) => {
    const nama = bacaNama(req.body);
    const username = bacaUsername(req.body);
    const password = String(req.body?.password || "");
    periksaPassword(password);
    await pastikanUsernameBebas(username);

    const dibuat = await prisma.pejabat.create({
      data: { nama, username, passwordHash: await hashPassword(password) },
    });
    res.status(201).json(bentuk(dibuat));
  })
);

/**
 * PUT /api/pejabat/:id  { nama, username, password? } -> ubah akun.
 * Password boleh kosong bila tidak diganti. Password baru mengeluarkan akun
 * ini dari semua perangkat (tokenVersi naik).
 */
router.put(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const nama = bacaNama(req.body);
    const username = bacaUsername(req.body);
    const password = String(req.body?.password || "");
    if (password) periksaPassword(password);

    const ada = await prisma.pejabat.findUnique({ where: { id }, select: { id: true } });
    if (!ada) throw notFound("Akun pejabat tidak ditemukan.");
    await pastikanUsernameBebas(username, { pejabatId: id });

    const diubah = await prisma.pejabat.update({
      where: { id },
      data: {
        nama,
        username,
        ...(password ? { passwordHash: await hashPassword(password), tokenVersi: { increment: 1 } } : {}),
      },
    });
    res.json(bentuk(diubah));
  })
);

/** POST /api/pejabat/:id/keluarkan -> cabut semua sesinya (mis. HP hilang); akunnya tetap. */
router.post(
  "/:id/keluarkan",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const ada = await prisma.pejabat.findUnique({ where: { id }, select: { id: true } });
    if (!ada) throw notFound("Akun pejabat tidak ditemukan.");
    await prisma.pejabat.update({ where: { id }, data: { tokenVersi: { increment: 1 } } });
    res.json({ ok: true });
  })
);

/** DELETE /api/pejabat/:id -> hapus akun; sesinya langsung tidak berlaku. */
router.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const ada = await prisma.pejabat.findUnique({ where: { id }, select: { id: true } });
    if (!ada) throw notFound("Akun pejabat tidak ditemukan.");
    await prisma.pejabat.delete({ where: { id } });
    res.status(204).end();
  })
);

module.exports = router;

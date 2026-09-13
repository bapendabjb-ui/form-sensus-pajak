"use strict";

const express = require("express");
const prisma = require("../prisma");
const { wrap, badRequest, notFound, conflict, parseId } = require("../http");

const router = express.Router();

const bentuk = (p) => ({ id: p.id, nama: p.nama, nip: p.nip, createdAt: p.createdAt });

/** GET /api/petugas -> daftar petugas (sumber dropdown di wizard kertas kerja). */
router.get(
  "/",
  wrap(async (_req, res) => {
    const list = await prisma.petugas.findMany({ orderBy: { nama: "asc" } });
    res.json(list.map(bentuk));
  })
);

/** POST /api/petugas -> tambah petugas. */
router.post(
  "/",
  wrap(async (req, res) => {
    const nama = String(req.body?.nama || "").trim();
    const nip = String(req.body?.nip || "").trim();
    if (!nama) throw badRequest("Nama petugas wajib diisi.");
    if (nama.length > 150) throw badRequest("Nama petugas maksimal 150 karakter.");
    if (nip.length > 40) throw badRequest("NIP maksimal 40 karakter.");

    const dibuat = await prisma.petugas.create({ data: { nama, nip } });
    res.status(201).json(bentuk(dibuat));
  })
);

/** PUT /api/petugas/:id -> ubah nama / NIP. */
router.put(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const nama = String(req.body?.nama || "").trim();
    const nip = String(req.body?.nip || "").trim();
    if (!nama) throw badRequest("Nama petugas wajib diisi.");

    const ada = await prisma.petugas.findUnique({ where: { id } });
    if (!ada) throw notFound("Petugas tidak ditemukan.");

    const diubah = await prisma.petugas.update({ where: { id }, data: { nama, nip } });
    res.json(bentuk(diubah));
  })
);

/** DELETE /api/petugas/:id -> hapus, ditolak bila masih dipakai kertas kerja. */
router.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const ada = await prisma.petugas.findUnique({ where: { id } });
    if (!ada) throw notFound("Petugas tidak ditemukan.");

    const terpakai = await prisma.kertasKerjaPetugas.count({ where: { petugasId: id } });
    if (terpakai > 0) {
      throw conflict(
        `Petugas masih dipakai oleh ${terpakai} kertas kerja, jadi tidak bisa dihapus.`,
        { terpakai }
      );
    }

    await prisma.petugas.delete({ where: { id } });
    res.status(204).end();
  })
);

module.exports = router;

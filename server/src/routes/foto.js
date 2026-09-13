"use strict";

const express = require("express");
const multer = require("multer");
const prisma = require("../prisma");
const config = require("../config");
const { wrap, badRequest, notFound, parseId } = require("../http");
const { simpanFoto, pathBerkas, bentukFoto } = require("../foto");

const router = express.Router();

const unggah = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxMb * 1024 * 1024, files: 1 },
});

/** Terjemahkan galat multer ke pesan yang bisa dibaca petugas. */
function terimaBerkas(req, res, next) {
  unggah.single("berkas")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return next(badRequest(`Ukuran foto melebihi ${config.uploadMaxMb} MB.`));
    }
    return next(badRequest("Unggahan foto gagal dibaca. Coba pilih ulang fotonya."));
  });
}

/**
 * POST /api/foto  (multipart, field "berkas") -> { id, nama, url, ukuran }
 * Foto belum tertaut ke data mana pun sampai datanya disimpan.
 */
router.post(
  "/",
  terimaBerkas,
  wrap(async (req, res) => {
    if (!req.file) throw badRequest("Pilih foto yang akan diunggah.");
    const { foto, galat } = await simpanFoto(req.file.buffer, req.file.originalname);
    if (galat) throw badRequest(galat);
    res.status(201).json(bentukFoto(foto));
  })
);

/** GET /api/foto/:id -> berkas gambar. */
router.get(
  "/:id",
  wrap(async (req, res) => {
    const foto = await prisma.foto.findUnique({ where: { id: parseId(req.params.id) } });
    if (!foto) throw notFound("Foto tidak ditemukan.");

    res.setHeader("Content-Type", foto.mime);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(pathBerkas(foto.berkas), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: "Berkas foto tidak ditemukan." });
    });
  })
);

module.exports = router;

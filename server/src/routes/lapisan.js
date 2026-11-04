"use strict";

/**
 * Lapisan peta dari GIS (QGIS / ArcGIS) di atas Peta Sensus, mis. batas blok PBB
 * atau persil. Admin mengunggah dan mengaturnya; siapa pun yang boleh membuka
 * Peta Sensus boleh melihatnya. Aturan berkasnya di src/lapisanPeta.js.
 */

const zlib = require("zlib");
const { promisify } = require("util");
const express = require("express");
const multer = require("multer");
const prisma = require("../prisma");
const { requireAdmin } = require("../auth");
const { wrap, badRequest, notFound, parseId } = require("../http");
const { pembatas } = require("../laju");
const { UNGGAH_MAKS_MB, bacaGeojson, bacaNama, bacaWarna, namaDariBerkas } = require("../lapisanPeta");

const gzip = promisify(zlib.gzip);

const router = express.Router();

/*
 * Sekali Peta Sensus dibuka: satu daftar + satu permintaan per lapisan yang
 * menyala, dan sebagian besar dijawab 304. Batasnya karena itu longgar; yang
 * dicegah hanya pemuatan berulang tanpa henti.
 */
const batasiLaju = pembatas({
  jendelaMs: 10 * 60 * 1000,
  maks: 600,
  pesan: "Lapisan peta terlalu sering dimuat. Tunggu beberapa menit.",
});

const unggah = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UNGGAH_MAKS_MB * 1024 * 1024, files: 1, fields: 10 },
});

/** Terjemahkan galat multer ke pesan yang bisa dibaca admin. */
function terimaBerkas(req, res, next) {
  unggah.single("berkas")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return next(
        badRequest(
          `Ukuran berkas melebihi ${UNGGAH_MAKS_MB} MB. Sederhanakan garisnya di QGIS ` +
            "(Vector → Geometry Tools → Simplify) atau pecah per kecamatan / kelurahan."
        )
      );
    }
    return next(badRequest("Unggahan berkas gagal dibaca. Coba pilih ulang berkasnya."));
  });
}

/** Kolom yang dikirim di daftar - semuanya kecuali isi. */
const PILIH = {
  id: true,
  nama: true,
  warna: true,
  tampil: true,
  jumlahFitur: true,
  ukuran: true,
  dibuatOleh: true,
  createdAt: true,
};

/** `versi` berganti hanya bila isinya berganti (hapus lalu unggah ulang) - kunci cache klien. */
const bentukLapisan = (l) => ({
  id: l.id,
  nama: l.nama,
  warna: l.warna,
  tampil: l.tampil,
  jumlahFitur: l.jumlahFitur,
  ukuran: l.ukuran,
  dibuatOleh: l.dibuatOleh,
  createdAt: l.createdAt,
  versi: `${l.id}-${l.createdAt.getTime()}`,
});

/*
 * Isi lapisan yang sudah dimampatkan, per id. Isinya tidak pernah berubah
 * (lihat schema.prisma), jadi cukup dibuang saat lapisannya dihapus. Satu
 * lapisan paling besar 12 MB, hasil gzip-nya biasanya seperlima.
 */
const simpanan = new Map(); // id -> { versi, janji: Promise<Buffer gzip | null> }

function isiMampat(l) {
  const versi = bentukLapisan(l).versi;
  const ada = simpanan.get(l.id);
  if (ada && ada.versi === versi) return ada.janji;
  const janji = prisma.lapisanPeta
    .findUnique({ where: { id: l.id }, select: { isi: true } })
    .then((r) => (r ? gzip(Buffer.from(r.isi)) : null));
  simpanan.set(l.id, { versi, janji });
  // Gagal = jangan disimpan, supaya permintaan berikutnya mencoba lagi.
  janji.catch(() => simpanan.get(l.id)?.janji === janji && simpanan.delete(l.id));
  return janji;
}

/** GET /api/lapisan -> [{ id, nama, warna, tampil, jumlahFitur, ukuran, versi, ... }] tanpa isinya. */
router.get(
  "/",
  batasiLaju,
  wrap(async (_req, res) => {
    const daftar = await prisma.lapisanPeta.findMany({ select: PILIH, orderBy: { id: "asc" } });
    res.setHeader("Cache-Control", "no-cache");
    res.json(daftar.map(bentukLapisan));
  })
);

/**
 * GET /api/lapisan/:id -> GeoJSON FeatureCollection lapisan itu.
 * Browser selalu menanyakan ulang (no-cache) dan dijawab 304 selama isinya sama.
 */
router.get(
  "/:id",
  batasiLaju,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const l = await prisma.lapisanPeta.findUnique({ where: { id }, select: { id: true, createdAt: true } });
    if (!l) throw notFound("Lapisan tidak ditemukan.");

    res.setHeader("ETag", `"lapisan-${bentukLapisan(l).versi}"`);
    res.setHeader("Cache-Control", "private, no-cache");
    res.vary("Accept-Encoding");
    if (req.fresh) return res.status(304).end();

    res.type("application/geo+json");
    if (req.acceptsEncodings("gzip")) {
      const mampat = await isiMampat(l);
      if (!mampat) throw notFound("Lapisan tidak ditemukan.");
      // Middleware compression melewati respons yang sudah ber-Content-Encoding.
      res.setHeader("Content-Encoding", "gzip");
      return res.send(mampat);
    }
    const r = await prisma.lapisanPeta.findUnique({ where: { id }, select: { isi: true } });
    if (!r) throw notFound("Lapisan tidak ditemukan.");
    return res.send(r.isi);
  })
);

/**
 * POST /api/lapisan (multipart: berkas, nama?, warna?, tampil?) -> lapisan baru
 * + `dilewati` (fitur tanpa geometri). Khusus admin. Nama kosong = nama layer
 * di berkasnya, atau nama berkasnya.
 */
router.post(
  "/",
  requireAdmin,
  terimaBerkas,
  wrap(async (req, res) => {
    if (!req.file) throw badRequest("Pilih berkas GeoJSON yang akan diunggah.");
    const hasil = bacaGeojson(req.file.buffer);
    const nama = bacaNama(req.body.nama || hasil.nama || namaDariBerkas(req.file.originalname));
    const l = await prisma.lapisanPeta.create({
      data: {
        nama,
        warna: bacaWarna(req.body.warna),
        tampil: req.body.tampil !== "false",
        isi: hasil.isi,
        jumlahFitur: hasil.jumlahFitur,
        ukuran: Buffer.byteLength(hasil.isi),
        dibuatOleh: req.admin.username,
      },
      select: PILIH,
    });
    res.status(201).json({ ...bentukLapisan(l), dilewati: hasil.dilewati });
  })
);

/** PUT /api/lapisan/:id { nama?, warna?, tampil? } -> lapisan. Khusus admin. Isinya tidak bisa diubah. */
router.put(
  "/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const body = req.body || {};
    const data = {};
    if (body.nama !== undefined) data.nama = bacaNama(body.nama);
    if (body.warna !== undefined) {
      data.warna = bacaWarna(body.warna, null);
      if (!data.warna) throw badRequest("Warna harus berbentuk #RRGGBB.");
    }
    if (body.tampil !== undefined) data.tampil = Boolean(body.tampil);
    if (Object.keys(data).length === 0) throw badRequest("Tidak ada yang diubah.");
    // Tidak ada = P2025, dijawab 404 oleh penangan galat di index.js.
    const l = await prisma.lapisanPeta.update({ where: { id }, data, select: PILIH });
    res.json(bentukLapisan(l));
  })
);

/** DELETE /api/lapisan/:id -> 204. Khusus admin. */
router.delete(
  "/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    await prisma.lapisanPeta.delete({ where: { id } });
    simpanan.delete(id);
    res.status(204).end();
  })
);

module.exports = router;

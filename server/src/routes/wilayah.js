"use strict";

const express = require("express");
const { wrap } = require("../http");
const { KECAMATAN } = require("../wilayah");
const { cariWilayah } = require("../wilayahIndonesia");
const { pembatas } = require("../laju");

const router = express.Router();

/** GET /api/wilayah -> kecamatan & kelurahan Kota Banjarbaru untuk pertanyaan bertipe "wilayah". */
router.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json(KECAMATAN);
});

/*
 * Formulir diisi petugas tanpa login, jadi pencarian ini terbuka. Datanya publik, tetapi
 * tiap pencarian memindai seluruh kelurahan/desa: batasi per IP supaya tidak bisa dipakai
 * membebani server. Ketikan petugas yang wajar hanya beberapa permintaan per alamat.
 */
const batasiLaju = pembatas({
  jendelaMs: 10 * 60 * 1000,
  maks: 1000,
  pesan: "Terlalu banyak pencarian wilayah. Tunggu beberapa menit.",
});

/** GET /api/wilayah/cari?q=sukamaju bogor -> { hasil: [{ kode, kelurahan, kecamatan, kabupaten, provinsi }], total } */
router.get(
  "/cari",
  batasiLaju,
  wrap(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(cariWilayah(q));
  })
);

module.exports = router;

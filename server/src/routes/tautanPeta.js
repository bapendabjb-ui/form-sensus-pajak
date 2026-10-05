"use strict";

const express = require("express");
const { wrap } = require("../http");
const { pembatas } = require("../laju");
const { bacaKoordinatTempel } = require("../tautanPeta");

const router = express.Router();

/*
 * Terbuka seperti pengisian data lainnya. Tautan pendek membuat server membuka
 * alamat Google, jadi jumlahnya dibatasi per IP.
 */
const batasiLaju = pembatas({
  jendelaMs: 10 * 60 * 1000,
  maks: 60,
  pesan: "Terlalu banyak tautan dibaca. Tunggu beberapa menit.",
});

/** POST /api/tautan-peta  { teks } -> { lat, lon } dari koordinat / tautan Google Maps. */
router.post(
  "/",
  batasiLaju,
  wrap(async (req, res) => {
    res.json(await bacaKoordinatTempel(String(req.body?.teks || "").slice(0, 2000)));
  })
);

module.exports = router;

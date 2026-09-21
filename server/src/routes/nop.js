"use strict";

const express = require("express");
const { wrap, badRequest } = require("../http");
const { cekNop } = require("../epbb");
const { PANJANG_NOP } = require("../answers");
const { pembatas } = require("../laju");

const router = express.Router();

/*
 * Formulir diisi petugas tanpa login, jadi endpoint ini terbuka. Batasi jumlah
 * pengecekan per IP supaya data WP tidak bisa ditarik massal lewat sini.
 */
const batasiLaju = pembatas({
  jendelaMs: 10 * 60 * 1000,
  maks: 60,
  pesan: "Terlalu banyak pengecekan NOP. Tunggu beberapa menit.",
});

/** GET /api/nop/:nop -> data objek pajak dari EPBB (NOP, WP, letak, luas, tahun belum bayar). */
router.get(
  "/:nop",
  batasiLaju,
  wrap(async (req, res) => {
    const nop = String(req.params.nop || "").replace(/\D/g, "");
    if (nop.length !== PANJANG_NOP) throw badRequest(`NOP harus ${PANJANG_NOP} digit.`);
    res.setHeader("Cache-Control", "no-store");
    res.json(await cekNop(nop));
  })
);

module.exports = router;

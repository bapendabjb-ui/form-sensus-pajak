"use strict";

const express = require("express");
const { wrap, badRequest, ApiError } = require("../http");
const { cekNop } = require("../epbb");
const { PANJANG_NOP } = require("../answers");

const router = express.Router();

/*
 * Formulir diisi petugas tanpa login, jadi endpoint ini terbuka. Batasi jumlah
 * pengecekan per IP supaya data WP tidak bisa ditarik massal lewat sini.
 */
const JENDELA_MS = 10 * 60 * 1000;
const MAKS_PER_JENDELA = 60;
const hitungan = new Map();

function batasiLaju(req, _res, next) {
  const kini = Date.now();
  const kunci = req.ip || "anon";
  const catatan = hitungan.get(kunci);
  if (!catatan || kini - catatan.mulai > JENDELA_MS) {
    hitungan.set(kunci, { mulai: kini, jumlah: 1 });
    return next();
  }
  catatan.jumlah += 1;
  if (catatan.jumlah > MAKS_PER_JENDELA) {
    return next(new ApiError(429, "Terlalu banyak pengecekan NOP. Tunggu beberapa menit."));
  }
  return next();
}

setInterval(() => {
  const batas = Date.now() - JENDELA_MS;
  for (const [kunci, c] of hitungan) if (c.mulai < batas) hitungan.delete(kunci);
}, JENDELA_MS).unref();

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

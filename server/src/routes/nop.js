"use strict";

const express = require("express");
const { wrap, badRequest } = require("../http");
const { cekNop, cariNop, kunciCariNop } = require("../epbb");
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

/*
 * Pencarian lebih ketat lagi: dengan nama saja orang bisa mendapat NOP dan alamat
 * wajib pajak lain. Pencarian hanya dikirim saat tombol Cari atau "Lihat lebih banyak"
 * ditekan, jadi 30 per 10 menit masih jauh di atas kebutuhan petugas.
 */
const batasiCari = pembatas({
  jendelaMs: 10 * 60 * 1000,
  maks: 30,
  pesan: "Terlalu banyak pencarian NOP. Tunggu beberapa menit.",
});

/**
 * GET /api/nop/cari?nama=&nik=&letak=&mulai= -> satu halaman (maks. 50) objek pajak dari EPBB:
 * { hasil: [{ nop, namaWp, jalanOp, rt, rw, kelurahan, kecamatan, luasTanah, luasBangunan }], lebih, dibatasi }
 */
router.get(
  "/cari",
  batasiCari,
  wrap(async (req, res) => {
    const kunci = kunciCariNop(req.query);
    res.setHeader("Cache-Control", "no-store");
    res.json(await cariNop(kunci));
  })
);

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

"use strict";

/**
 * Integrasi NIB BPN dengan NOP PBB (aturannya di src/integrasi.js).
 *
 * Laporan dan status bidang terbuka bagi siapa pun yang boleh membuka Peta
 * Sensus (bila wajib login: admin, petugas, pejabat) - isinya sama dengan yang
 * sudah tampil di daftar kertas kerja dan peta. Unduhan Excel khusus admin,
 * seperti ekspor lainnya.
 */

const express = require("express");
const { requireAdmin } = require("../auth");
const { wrap, parseId } = require("../http");
const { pembatas } = require("../laju");
const { simpanSementara } = require("../simpanSementara");
const { kirimXlsx, baseUrlEkspor } = require("../ekspor");
const integrasi = require("../integrasi");

const router = express.Router();

const batasi = pembatas({
  jendelaMs: 10 * 60 * 1000,
  maks: 1200,
  pesan: "Terlalu banyak permintaan integrasi NIB. Tunggu beberapa menit.",
});

/** Laporan dan status peta disusun dari seluruh data: dipakai bersama sampai ada data yang berubah. */
const bacaLaporan = simpanSementara({ umurMs: 60 * 1000, susun: integrasi.susunLaporan });
const bacaStatusPeta = simpanSementara({ umurMs: 60 * 1000, susun: integrasi.statusBidangPeta });

/** Data per halaman di layar Integrasi NIB. */
const PER_HALAMAN = 50;

/**
 * GET /api/integrasi?pola=&cari=&mulai= ->
 *   { pola: { kunci: label }, ringkas, cakupan, data: { baris, total, mulai, lebih } }
 */
router.get(
  "/",
  batasi,
  wrap(async (req, res) => {
    const laporan = await bacaLaporan();
    const pola = integrasi.POLA[req.query.pola] ? req.query.pola : "";
    const cocok = integrasi.saringBaris(laporan.baris, { pola, cari: req.query.cari });
    const mulai = Math.max(0, Math.min(Number.parseInt(req.query.mulai, 10) || 0, cocok.length));
    res.setHeader("Cache-Control", "no-cache");
    res.json({
      pola: integrasi.POLA,
      ringkas: laporan.ringkas,
      cakupan: laporan.cakupan,
      data: {
        baris: cocok.slice(mulai, mulai + PER_HALAMAN),
        total: cocok.length,
        mulai,
        lebih: mulai + PER_HALAMAN < cocok.length,
      },
    });
  })
);

/**
 * GET /api/integrasi/bidang -> { cocok: [id], tinjau: [id], tanpa_nop: [id] }: status
 * bidang persil untuk mode warna "Status sensus" di Peta Sensus. Id ditulis
 * sebagai selisih berurutan (integrasi.selisihUrut).
 */
router.get(
  "/bidang",
  batasi,
  wrap(async (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.json(await bacaStatusPeta());
  })
);

/**
 * GET /api/integrasi/cek?kunci=<kode|nib>,...&kecuali=<id data> ->
 *   { [kunci]: [{ entriId, kkId, nomor, nop, judul }] }
 * Data lain yang sudah mencatat bidang yang sama - peringatan di layar isi data.
 */
router.get(
  "/cek",
  batasi,
  wrap(async (req, res) => {
    const kunci = String(req.query.kunci || "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 40);
    const kecuali = req.query.kecuali ? parseId(req.query.kecuali) : null;
    res.json(await integrasi.sensusBidang(kunci, { kecuali }));
  })
);

/** GET /api/integrasi/unduh?pola=&cari= -> daftar kerja integrasi (.xlsx). Khusus admin. */
router.get(
  "/unduh",
  requireAdmin,
  wrap(async (req, res) => {
    const laporan = await bacaLaporan();
    const pola = integrasi.POLA[req.query.pola] ? req.query.pola : "";
    const baris = integrasi.saringBaris(laporan.baris, { pola, cari: req.query.cari });
    const tanggal = new Date().toISOString().slice(0, 10);
    await kirimXlsx(res, {
      nama: `integrasi-nib-nop${pola ? `-${pola.replace(/_/g, "-")}` : ""}-${tanggal}`,
      sheet: "Integrasi NIB-NOP",
      tabel: integrasi.tabelLaporan(baris, { baseUrl: baseUrlEkspor(req) }),
    });
  })
);

module.exports = router;

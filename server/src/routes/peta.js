"use strict";

const express = require("express");
const prisma = require("../prisma");
const { wrap } = require("../http");
const { bentukTim } = require("../bentuk");
const { adaTitik } = require("../cekLokasi");

const router = express.Router();

/**
 * Judul singkat sebuah titik: jawaban teks pertama pada entri, mis. nama wajib
 * pajak. Dipakai di balon peta supaya titik bisa dikenali tanpa membuka datanya.
 * Kosong bila entri belum punya jawaban teks - balon lalu jatuh ke nama formulir.
 */
const TIPE_JUDUL = new Set(["text", "dropdown", "radio", "paragraph"]);

function judulEntri(jawaban = []) {
  for (const j of jawaban) {
    if (!TIPE_JUDUL.has(j.pertanyaan.tipe)) continue;
    const teks = typeof j.nilai === "string" ? j.nilai.trim() : "";
    if (teks) return teks;
  }
  return "";
}

/** Koordinat sah? Jawaban lokasi yang kosong disimpan sebagai { lat: null, lon: null }. */
const punyaTitik = adaTitik;

/** Kolom entri yang dibutuhkan satu titik peta. */
const pilihEntri = {
  id: true,
  berkasLengkap: true,
  catatanBerkas: true,
  updatedAt: true,
  formulir: { select: { judul: true } },
  jawaban: {
    select: { nilai: true, pertanyaan: { select: { tipe: true, urutan: true } } },
    orderBy: { pertanyaan: { urutan: "asc" } },
  },
  kertasKerja: {
    select: { id: true, nomor: true, status: true, petugas: { include: { petugas: true } } },
  },
};

/**
 * GET /api/peta -> semua titik hasil sensus, satu titik per data (entri).
 *
 * Satu titik per data, yaitu titik objeknya (lihat src/cekLokasi.js): koreksi
 * lewat peta, lalu jawaban pertanyaan Lokasi, lalu GPS asli yang terekam
 * otomatis saat data disimpan.
 *
 * Jawaban lokasi kosong tetap tersimpan sebagai { lat: null, lon: null }, jadi
 * penyaringannya dilakukan di aplikasi, tidak bisa diserahkan ke database
 * melalui kolom JSON.
 */
router.get(
  "/",
  wrap(async (_req, res) => {
    const [rows, berkoordinat] = await Promise.all([
      prisma.jawaban.findMany({
        where: { pertanyaan: { tipe: "lokasi" } },
        select: { nilai: true, entri: { select: pilihEntri } },
      }),
      prisma.entri.findMany({
        where: { OR: [{ koreksiLat: { not: null } }, { rekamLat: { not: null } }] },
        select: { ...pilihEntri, koreksiLat: true, koreksiLon: true, rekamLat: true, rekamLon: true },
      }),
    ]);

    const bentukTitik = (e, lat, lon, sumber) => ({
      entriId: e.id,
      lat,
      lon,
      // "koreksi" = ditunjuk di peta saat pemeriksaan; "formulir" = jawaban
      // pertanyaan Lokasi; "rekam" = GPS terekam otomatis saat data disimpan
      sumber,
      judul: judulEntri(e.jawaban),
      formulir: e.formulir.judul,
      berkasLengkap: e.berkasLengkap,
      catatanBerkas: e.catatanBerkas || "",
      updatedAt: e.updatedAt,
      kertasKerjaId: e.kertasKerja.id,
      nomor: e.kertasKerja.nomor,
      status: e.kertasKerja.status,
      petugas: bentukTim(e.kertasKerja.petugas),
    });

    const titik = [];
    const sudahAda = new Set();

    // Koreksi didahulukan: itulah letak objek menurut pemeriksaan terakhir.
    for (const e of berkoordinat) {
      if (e.koreksiLat === null || e.koreksiLon === null) continue;
      titik.push(bentukTitik(e, e.koreksiLat, e.koreksiLon, "koreksi"));
      sudahAda.add(e.id);
    }

    for (const r of rows) {
      if (!punyaTitik(r.nilai) || !r.entri || sudahAda.has(r.entri.id)) continue;
      titik.push(bentukTitik(r.entri, r.nilai.lat, r.nilai.lon, "formulir"));
      sudahAda.add(r.entri.id);
    }

    // GPS asli: cadangan bagi data tanpa koreksi dan tanpa jawaban Lokasi
    // (mis. formulir PBB-P2 yang tidak punya pertanyaan Lokasi).
    for (const e of berkoordinat) {
      if (sudahAda.has(e.id) || e.rekamLat === null || e.rekamLon === null) continue;
      titik.push(bentukTitik(e, e.rekamLat, e.rekamLon, "rekam"));
    }

    // Titik terbaru di akhir supaya tergambar paling atas saat bertumpuk.
    titik.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
    res.json(titik);
  })
);

module.exports = router;
// Diekspor untuk diuji terpisah: keduanya murni dan menentukan titik mana yang
// muncul di peta serta namanya, sementara query di atas perlu database.
module.exports.punyaTitik = punyaTitik;
module.exports.judulEntri = judulEntri;

"use strict";

const express = require("express");
const prisma = require("../prisma");
const { wrap } = require("../http");
const { bentukTim } = require("../bentuk");
const { adaTitik, titikKk } = require("../cekLokasi");

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

/**
 * Titik-titik peta dari daftar kertas kerja beserta datanya. Klien
 * menampilkan kedua jenisnya terpisah, jadi tidak ada yang disaring di sini.
 *
 *   - jenis "kk"  : satu titik per kertas kerja - lokasi sensusnya (lihat
 *                   src/cekLokasi.js: ditetapkan di peta, rekam di lokasi, atau
 *                   GPS terbaik datanya). `entriId` null.
 *   - jenis "data": satu titik per data yang mengisi pertanyaan Lokasi, mis.
 *                   Koordinat Objek Pajak pada PBB-P2 (`sumber` "formulir").
 */
function susunTitikPeta(kks) {
  const titik = [];
  for (const kk of kks) {
    const entri = kk.entri || [];
    const dasar = { kertasKerjaId: kk.id, nomor: kk.nomor, status: kk.status, petugas: bentukTim(kk.petugas) };

    const t = titikKk(kk, entri);
    if (t) {
      const kurang = entri.filter((e) => !e.berkasLengkap).length;
      titik.push({
        ...dasar,
        jenis: "kk",
        entriId: null,
        lat: t.lat,
        lon: t.lon,
        // "koreksi" = ditunjuk di peta; "rekam" = direkam di lokasi; "gps" = GPS
        // terekam otomatis saat data disimpan
        sumber: t.sumber,
        judul: entri.map((e) => judulEntri(e.jawaban)).find(Boolean) || "",
        formulir: `${entri.length} data`,
        jumlahData: entri.length,
        berkasLengkap: kurang === 0,
        catatanBerkas: kurang ? `${kurang} data` : "",
        updatedAt: entri.reduce((a, e) => (e.updatedAt > a ? e.updatedAt : a), new Date(0)),
      });
    }

    for (const e of entri) {
      const lokasi = (e.jawaban || []).find((j) => j.pertanyaan.tipe === "lokasi" && adaTitik(j.nilai));
      if (!lokasi) continue;
      titik.push({
        ...dasar,
        jenis: "data",
        entriId: e.id,
        lat: lokasi.nilai.lat,
        lon: lokasi.nilai.lon,
        sumber: "formulir",
        judul: judulEntri(e.jawaban),
        formulir: e.formulir.judul,
        jumlahData: 1,
        berkasLengkap: e.berkasLengkap,
        catatanBerkas: e.catatanBerkas || "",
        updatedAt: e.updatedAt,
      });
    }
  }

  // Titik terbaru di akhir supaya tergambar paling atas saat bertumpuk.
  titik.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
  return titik;
}

/**
 * GET /api/peta -> titik hasil sensus: satu per kertas kerja (lokasi sensus,
 * jenis "kk") dan satu per data berkoordinat (pertanyaan Lokasi, jenis "data").
 *
 * Jawaban lokasi kosong tetap tersimpan sebagai { lat: null, lon: null }, jadi
 * penyaringannya dilakukan di aplikasi, tidak bisa diserahkan ke database
 * melalui kolom JSON.
 */
router.get(
  "/",
  wrap(async (_req, res) => {
    const kks = await prisma.kertasKerja.findMany({
      where: { entri: { some: {} } },
      select: {
        id: true,
        nomor: true,
        status: true,
        titikLat: true,
        titikLon: true,
        titikAkurasi: true,
        titikSumber: true,
        petugas: { include: { petugas: true } },
        entri: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            rekamLat: true,
            rekamLon: true,
            rekamAkurasi: true,
            berkasLengkap: true,
            catatanBerkas: true,
            updatedAt: true,
            formulir: { select: { judul: true } },
            jawaban: {
              select: { nilai: true, pertanyaan: { select: { tipe: true, urutan: true } } },
              orderBy: { pertanyaan: { urutan: "asc" } },
            },
          },
        },
      },
    });
    res.json(susunTitikPeta(kks));
  })
);

module.exports = router;
// Diekspor untuk diuji terpisah: murni dan menentukan titik mana yang muncul di
// peta serta namanya, sementara query di atas perlu database.
module.exports.punyaTitik = punyaTitik;
module.exports.judulEntri = judulEntri;
module.exports.susunTitikPeta = susunTitikPeta;

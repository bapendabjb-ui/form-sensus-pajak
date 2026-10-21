"use strict";

const zlib = require("zlib");
const { promisify } = require("util");
const express = require("express");
const prisma = require("../prisma");
const { wrap } = require("../http");
const { bentukTim } = require("../bentuk");
const { adaTitik, titikKk } = require("../cekLokasi");
const { pembatas } = require("../laju");
const { simpanSementara } = require("../simpanSementara");

const gzip = promisify(zlib.gzip);

const router = express.Router();

/*
 * Endpoint ini terbuka tanpa login dan memuat seluruh kertas kerja sekaligus,
 * jadi permintaan per IP dibatasi. Batasnya longgar karena satu kantor bisa
 * keluar lewat satu IP, dan permintaan yang terlayani dari simpanan murah.
 */
const batasiLaju = pembatas({
  jendelaMs: 10 * 60 * 1000,
  maks: 120,
  pesan: "Peta terlalu sering dimuat. Tunggu beberapa menit.",
});

/**
 * Judul singkat sebuah titik: jawaban teks pertama pada entri, mis. nama wajib
 * pajak. Dipakai di balon peta supaya titik bisa dikenali tanpa membuka datanya.
 * Kosong bila entri belum punya jawaban teks - balon lalu jatuh ke nama formulir.
 */
const TIPE_JUDUL = new Set(["text", "dropdown", "radio", "paragraph"]);

/** Hanya jawaban bertipe ini yang dibaca susunTitikPeta; sisanya tidak perlu dimuat. */
const TIPE_DIBACA = [...TIPE_JUDUL, "lokasi"];

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
        dicek: Boolean(kk.lokasiDicekAt),
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
        dicek: Boolean(e.koordinatDicekAt),
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
 * Jawaban GET /api/peta yang siap kirim: JSON beserta versi gzip-nya, supaya
 * pemampatan isi sebesar ini cukup sekali per perubahan data, tidak per pembuka.
 *
 * Jawaban lokasi kosong tetap tersimpan sebagai { lat: null, lon: null }, jadi
 * penyaringannya dilakukan di aplikasi, tidak bisa diserahkan ke database
 * melalui kolom JSON.
 */
async function susunJawabanPeta() {
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
      lokasiDicekAt: true,
      petugas: { include: { petugas: true } },
      entri: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          rekamLat: true,
          rekamLon: true,
          rekamAkurasi: true,
          koordinatDicekAt: true,
          berkasLengkap: true,
          catatanBerkas: true,
          updatedAt: true,
          formulir: { select: { judul: true } },
          jawaban: {
            where: { pertanyaan: { tipe: { in: TIPE_DIBACA } } },
            select: { nilai: true, pertanyaan: { select: { tipe: true, urutan: true } } },
            orderBy: { pertanyaan: { urutan: "asc" } },
          },
        },
      },
    },
  });
  const json = Buffer.from(JSON.stringify(susunTitikPeta(kks)));
  return { json, gzip: await gzip(json) };
}

// Dipakai bersama semua pembuka peta sampai ada data yang berubah (lihat src/simpanSementara.js).
const bacaJawabanPeta = simpanSementara({ umurMs: 60 * 1000, susun: susunJawabanPeta });

/**
 * GET /api/peta -> titik hasil sensus: satu per kertas kerja (lokasi sensus,
 * jenis "kk") dan satu per data berkoordinat (pertanyaan Lokasi, jenis "data").
 */
router.get(
  "/",
  batasiLaju,
  wrap(async (req, res) => {
    const jawaban = await bacaJawabanPeta();
    res.setHeader("Cache-Control", "no-cache");
    res.vary("Accept-Encoding");
    res.type("json");
    if (req.acceptsEncodings("gzip")) {
      // Middleware compression melewati respons yang sudah ber-Content-Encoding.
      res.setHeader("Content-Encoding", "gzip");
      return res.send(jawaban.gzip);
    }
    return res.send(jawaban.json);
  })
);

module.exports = router;
// Diekspor untuk diuji terpisah: murni dan menentukan titik mana yang muncul di
// peta serta namanya, sementara query di atas perlu database.
module.exports.punyaTitik = punyaTitik;
module.exports.judulEntri = judulEntri;
module.exports.susunTitikPeta = susunTitikPeta;

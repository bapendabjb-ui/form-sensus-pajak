"use strict";

const express = require("express");
const prisma = require("../prisma");
const { wrap } = require("../http");
const { bentukTim } = require("../bentuk");

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
const punyaTitik = (n) =>
  !!n &&
  typeof n === "object" &&
  typeof n.lat === "number" &&
  typeof n.lon === "number" &&
  n.lat >= -90 &&
  n.lat <= 90 &&
  n.lon >= -180 &&
  n.lon <= 180;

/**
 * GET /api/peta -> semua titik hasil sensus, satu titik per data (entri).
 *
 * Koordinat menempel pada entri lewat jawaban bertipe "lokasi", bukan pada
 * kertas kerja: satu kertas kerja bisa menyumbang banyak titik, dan entri dari
 * formulir yang tidak punya pertanyaan lokasi tidak muncul sama sekali.
 *
 * Satu query saja - jawaban lokasi beserta entri, kertas kerja, dan timnya -
 * lalu titik tak sah disaring di aplikasi. Jawaban lokasi kosong tetap tersimpan
 * sebagai { lat: null, lon: null }, jadi penyaringan tidak bisa diserahkan ke
 * database melalui kolom JSON.
 */
router.get(
  "/",
  wrap(async (_req, res) => {
    const rows = await prisma.jawaban.findMany({
      where: { pertanyaan: { tipe: "lokasi" } },
      select: {
        nilai: true,
        entri: {
          select: {
            id: true,
            berkasLengkap: true,
            catatanBerkas: true,
            updatedAt: true,
            formulir: { select: { id: true, judul: true } },
            jawaban: {
              select: { nilai: true, pertanyaan: { select: { tipe: true, urutan: true } } },
              orderBy: { pertanyaan: { urutan: "asc" } },
            },
            kertasKerja: {
              select: {
                id: true,
                nomor: true,
                status: true,
                petugas: { include: { petugas: true } },
              },
            },
          },
        },
      },
    });

    const titik = [];
    for (const r of rows) {
      if (!punyaTitik(r.nilai) || !r.entri) continue;
      const e = r.entri;
      titik.push({
        entriId: e.id,
        lat: r.nilai.lat,
        lon: r.nilai.lon,
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

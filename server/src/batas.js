"use strict";

/**
 * Batas-batas aplikasi.
 *
 * Server adalah satu-satunya sumber angka ini; klien membacanya lewat
 * GET /api/konfigurasi supaya tidak pernah ada dua angka yang berbeda.
 */

/** Jumlah petugas maksimal dalam satu tim kertas kerja. */
const PETUGAS_MAKS = 8;

/** Foto maksimal untuk satu pertanyaan bertipe "foto". */
const FOTO_MAKS_PER_PERTANYAAN = 10;

/**
 * Kantor BPPRD Kota Banjarbaru (titik Google Maps). Koordinat GPS yang terekam
 * dalam radius ini dianggap diisi di kantor, bukan di lokasi objek pajak.
 */
const KANTOR = { nama: "kantor BPPRD", lat: -3.439325, lon: 114.829525, radiusM: 150 };

/**
 * Akurasi GPS yang lebih buruk dari ini dianggap kasar. Angka ratusan meter
 * biasanya berarti posisi ditebak dari jaringan / Wi-Fi, bukan dari satelit -
 * khas laptop kantor atau HP yang GPS-nya mati.
 */
const AKURASI_KASAR_M = 100;

/** Rekam ulang lokasi hanya diterima bila GPS setidaknya seteliti ini. */
const AKURASI_REKAM_ULANG_M = 50;

/** Titik objek yang berjarak lebih dari ini dari GPS asli ditandai untuk admin. */
const JARAK_JAUH_M = 500;

module.exports = {
  PETUGAS_MAKS,
  FOTO_MAKS_PER_PERTANYAAN,
  KANTOR,
  AKURASI_KASAR_M,
  AKURASI_REKAM_ULANG_M,
  JARAK_JAUH_M,
};

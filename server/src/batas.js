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
 *
 * Radiusnya sekitar gedung dan halamannya saja (semula 150 m, diperkecil
 * 2026-10-27 karena ada objek sensus di dekat kantor).
 */
const KANTOR = { nama: "kantor BPPRD", lat: -3.439325, lon: 114.829525, radiusM: 50 };

/**
 * Akurasi GPS yang lebih buruk dari ini dianggap kasar. Angka ratusan meter
 * biasanya berarti posisi ditebak dari jaringan / Wi-Fi, bukan dari satelit -
 * khas laptop kantor atau HP yang GPS-nya mati.
 */
const AKURASI_KASAR_M = 100;

/**
 * Wilayah kerja: pusat Kota Banjarbaru dan radius yang mencakup seluruh kota
 * dengan longgar (ujung kota ±20 km dari pusat). Persil BPN di luar radius ini
 * ditolak saat impor: koordinat yang dibaca dengan sistem koordinat yang salah
 * jatuh ratusan sampai ribuan km jauhnya, bukan sedikit meleset.
 */
const WILAYAH = { lat: -3.4572, lon: 114.8105, radiusKm: 40 };

module.exports = {
  PETUGAS_MAKS,
  FOTO_MAKS_PER_PERTANYAAN,
  KANTOR,
  AKURASI_KASAR_M,
  WILAYAH,
};

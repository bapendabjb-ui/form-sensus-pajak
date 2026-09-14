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

module.exports = { PETUGAS_MAKS, FOTO_MAKS_PER_PERTANYAAN };

"use strict";

const prisma = require("./prisma");

const LEBAR_NOMOR = 5;

const padNomor = (n) => String(n).padStart(LEBAR_NOMOR, "0");

/**
 * Ambil nomor berikutnya di dalam transaksi.
 *
 *   UPDATE nomor_counter SET last_nomor = last_nomor + 1 WHERE id = 1;
 *   SELECT last_nomor FROM nomor_counter WHERE id = 1;
 *
 * UPDATE mengunci baris counter sampai transaksi selesai, sehingga dua petugas
 * yang membuat kertas kerja bersamaan tetap mendapat nomor berbeda.
 * Kolom kertas_kerja.nomor UNIQUE menjadi pengaman terakhir.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
async function ambilNomorBerikutnya(tx) {
  const terpengaruh = await tx.$executeRaw`UPDATE nomor_counter SET last_nomor = last_nomor + 1 WHERE id = 1`;

  // Baris counter belum ada (mis. database dibuat manual): buat dari nomor tertinggi.
  if (terpengaruh === 0) {
    const tertinggi = await tx.$queryRaw`SELECT COALESCE(MAX(CAST(nomor AS UNSIGNED)), 0) AS maks FROM kertas_kerja`;
    const awal = Number(tertinggi?.[0]?.maks || 0) + 1;
    await tx.$executeRaw`INSERT INTO nomor_counter (id, last_nomor) VALUES (1, ${awal})`;
    return padNomor(awal);
  }

  const rows = await tx.$queryRaw`SELECT last_nomor FROM nomor_counter WHERE id = 1`;
  return padNomor(Number(rows[0].last_nomor));
}

/**
 * Pastikan baris counter ada dan tidak tertinggal di belakang nomor yang sudah
 * terpakai (mis. setelah impor data). Dipanggil sekali saat server start.
 */
async function ensureCounter() {
  await prisma.$executeRaw`INSERT INTO nomor_counter (id, last_nomor) VALUES (1, 0) ON DUPLICATE KEY UPDATE id = id`;
  await prisma.$executeRaw`
    UPDATE nomor_counter
    SET last_nomor = GREATEST(last_nomor, (SELECT COALESCE(MAX(CAST(nomor AS UNSIGNED)), 0) FROM kertas_kerja))
    WHERE id = 1`;
}

/** Perkiraan nomor berikutnya untuk ditampilkan di wizard (tanpa mengonsumsi nomor). */
async function previewNomorBerikutnya() {
  const rows = await prisma.$queryRaw`SELECT last_nomor FROM nomor_counter WHERE id = 1`;
  const last = Number(rows?.[0]?.last_nomor || 0);
  return padNomor(last + 1);
}

module.exports = { LEBAR_NOMOR, padNomor, ambilNomorBerikutnya, ensureCounter, previewNomorBerikutnya };

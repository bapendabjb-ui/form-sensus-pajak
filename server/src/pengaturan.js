"use strict";

/**
 * Pengaturan aplikasi yang diubah admin dari layar (tabel `pengaturan`, id = 1).
 *
 * Gerbang login membaca "wajib login" pada setiap permintaan API, jadi nilainya
 * disimpan sebentar di memori. Perubahan dari layar admin langsung berlaku di
 * proses ini; perubahan langsung di database berlaku paling lambat UMUR_MS.
 * Seperti src/laju.js, ini tepat selama aplikasi berjalan pada satu instance.
 */

const prisma = require("./prisma");

const UMUR_MS = 15 * 1000;
let simpanan = null; // { nilai, sampai }

/** Apakah petugas wajib login? Baris yang belum ada = tidak wajib. */
async function wajibLoginPetugas() {
  const kini = Date.now();
  if (simpanan && simpanan.sampai > kini) return simpanan.nilai;
  const baris = await prisma.pengaturan.findUnique({ where: { id: 1 } });
  const nilai = Boolean(baris?.wajibLoginPetugas);
  simpanan = { nilai, sampai: kini + UMUR_MS };
  return nilai;
}

async function aturWajibLoginPetugas(wajib) {
  const baris = await prisma.pengaturan.upsert({
    where: { id: 1 },
    update: { wajibLoginPetugas: wajib },
    create: { id: 1, wajibLoginPetugas: wajib },
  });
  simpanan = { nilai: baris.wajibLoginPetugas, sampai: Date.now() + UMUR_MS };
  return baris.wajibLoginPetugas;
}

module.exports = { wajibLoginPetugas, aturWajibLoginPetugas };

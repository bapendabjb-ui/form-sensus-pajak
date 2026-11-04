"use strict";

/**
 * Pemuatan data untuk ekspor besar (per formulir, wilayah, petugas, seluruh
 * data). Diambil bertahap dan hanya kolom yang dipakai: satu query untuk
 * ribuan entri beserta jawaban dan timnya membuat memori proses melonjak
 * ratusan MB sesaat, mendekati batas restart PM2 (deploy/ecosystem.config.js).
 */

const prisma = require("./prisma");

const PER_TAHAP = 1000;

/**
 * Entri yang cocok dengan `where`, masing-masing dengan `jawaban`
 * ({ pertanyaanId, nilai }) dan `kertasKerja` (+ tim petugas). Kertas kerja
 * yang sama dipakai bersama oleh semua entrinya.
 */
async function muatEntriEkspor(where = {}) {
  const entri = [];
  let setelah = 0;
  for (;;) {
    const tahap = await prisma.entri.findMany({
      where: { AND: [where, { id: { gt: setelah } }] },
      orderBy: { id: "asc" },
      take: PER_TAHAP,
      include: { jawaban: { select: { pertanyaanId: true, nilai: true } } },
    });
    for (const e of tahap) entri.push(e);
    if (tahap.length < PER_TAHAP) break;
    setelah = tahap[tahap.length - 1].id;
  }

  const kkIds = [...new Set(entri.map((e) => e.kertasKerjaId))];
  const kertasKerja = kkIds.length
    ? await prisma.kertasKerja.findMany({
        where: { id: { in: kkIds } },
        include: { petugas: { include: { petugas: { select: { id: true, nama: true, nip: true } } } } },
      })
    : [];
  const perId = new Map(kertasKerja.map((k) => [k.id, k]));
  for (const e of entri) e.kertasKerja = perId.get(e.kertasKerjaId);
  return entri;
}

module.exports = { muatEntriEkspor };

"use strict";

const prisma = require("./prisma");

/**
 * Rekap hasil kerja per petugas.
 *
 * Petugas tidak terhubung langsung ke data: ia tercatat sebagai anggota tim
 * sebuah kertas kerja, dan data (entri) menempel pada kertas kerja itu. Jadi
 * "data yang dikerjakan" seorang petugas = jumlah entri di seluruh kertas kerja
 * yang ia ikuti. Satu kertas kerja dikerjakan bersama tim, sehingga entri yang
 * sama dihitung untuk setiap anggotanya - ini rekap keterlibatan, bukan
 * pembagian hasil, dan penjumlahan semua petugas wajar melebihi total data.
 *
 * Dua query saja (tim + hitung entri per kertas kerja), bukan satu query per
 * petugas, supaya daftar petugas yang panjang tidak melambat.
 *
 * @returns {Promise<Map<number, { jumlahKertasKerja: number, jumlahData: number }>>}
 *   Berkunci petugasId. Petugas yang belum masuk tim mana pun tidak muncul.
 */
async function rekapPetugas() {
  const [tim, entriPerKk] = await Promise.all([
    prisma.kertasKerjaPetugas.findMany({ select: { petugasId: true, kertasKerjaId: true } }),
    prisma.entri.groupBy({ by: ["kertasKerjaId"], _count: { _all: true } }),
  ]);

  const dataPerKk = new Map(entriPerKk.map((r) => [r.kertasKerjaId, r._count._all]));

  const rekap = new Map();
  for (const t of tim) {
    const baris = rekap.get(t.petugasId) || { jumlahKertasKerja: 0, jumlahData: 0 };
    baris.jumlahKertasKerja += 1;
    baris.jumlahData += dataPerKk.get(t.kertasKerjaId) || 0;
    rekap.set(t.petugasId, baris);
  }
  return rekap;
}

/** Nol untuk petugas yang belum masuk tim mana pun, supaya pemanggil tidak perlu berjaga. */
const rekapKosong = () => ({ jumlahKertasKerja: 0, jumlahData: 0 });

/**
 * Petugas paling produktif, urut dari data terbanyak. Petugas tanpa data
 * dilewati supaya panel dashboard tidak terisi baris nol.
 *
 * @param {number} batas Jumlah maksimal baris.
 */
async function peringkatPetugas(batas = 5) {
  const [rekap, petugas] = await Promise.all([
    rekapPetugas(),
    prisma.petugas.findMany({ select: { id: true, nama: true, nip: true } }),
  ]);

  return petugas
    .map((p) => ({ ...p, ...(rekap.get(p.id) || rekapKosong()) }))
    .filter((p) => p.jumlahData > 0)
    .sort((a, b) => b.jumlahData - a.jumlahData || b.jumlahKertasKerja - a.jumlahKertasKerja || a.nama.localeCompare(b.nama, "id"))
    .slice(0, batas);
}

module.exports = { rekapPetugas, rekapKosong, peringkatPetugas };

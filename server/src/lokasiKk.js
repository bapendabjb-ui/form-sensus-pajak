"use strict";

/**
 * Status lokasi kertas kerja yang disimpan (kertas_kerja.lokasi_status).
 *
 * Status ini bergantung pada titik kertas kerja dan GPS semua datanya, dan
 * dihitung di aplikasi (jarak ke kantor). Supaya daftar kertas kerja bisa
 * disaring "Lokasi perlu dicek" di database, hasilnya disimpan dan dihitung
 * ulang setiap kali salah satu bahannya berubah: data dibuat atau dihapus,
 * titik ditetapkan atau dihapus.
 */

const prisma = require("./prisma");
const { ringkasLokasiKk } = require("./cekLokasi");

const PILIH = {
  id: true,
  titikLat: true,
  titikLon: true,
  titikAkurasi: true,
  titikSumber: true,
  lokasiStatus: true,
  entri: { select: { id: true, rekamLat: true, rekamLon: true, rekamAkurasi: true } },
};

/** Hitung ulang status lokasi satu atau beberapa kertas kerja. */
async function perbaruiLokasiKk(ids) {
  for (const id of [...new Set([].concat(ids))]) {
    const kk = await prisma.kertasKerja.findUnique({ where: { id }, select: PILIH });
    if (!kk) continue;
    const { status } = ringkasLokasiKk(kk, kk.entri);
    if (kk.lokasiStatus !== status) {
      await prisma.kertasKerja.update({ where: { id }, data: { lokasiStatus: status } });
    }
  }
}

/** Isi status yang belum pernah dihitung (kertas kerja lama setelah migrasi). */
async function isiLokasiKkKosong() {
  const belum = await prisma.kertasKerja.findMany({ where: { lokasiStatus: null }, select: { id: true } });
  await perbaruiLokasiKk(belum.map((k) => k.id));
  return belum.length;
}

module.exports = { perbaruiLokasiKk, isiLokasiKkKosong };

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
  lokasiDicekAt: true,
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

/** Kertas kerja per putaran saat menyelaraskan, supaya memori tetap kecil. */
const SELARAS_PER = 1000;

/**
 * Samakan status tersimpan dengan aturan yang berlaku sekarang. Dijalankan
 * saat server menyala: mengisi status yang belum pernah dihitung (kertas kerja
 * lama setelah migrasi), dan membetulkan status yang berubah karena aturannya
 * berubah, mis. radius kantor di src/batas.js diperkecil.
 *
 * Semua dihitung di memori per putaran; hanya yang berbeda dibaca ulang lalu
 * ditulis lewat perbaruiLokasiKk, supaya perubahan yang terjadi di sela-selanya
 * tidak tertimpa nilai lama.
 *
 * @returns {Promise<number>} banyak kertas kerja yang statusnya diperbarui
 */
async function selaraskanLokasiKk() {
  let beda = 0;
  let setelah = 0;
  for (;;) {
    const daftar = await prisma.kertasKerja.findMany({
      where: { id: { gt: setelah } },
      orderBy: { id: "asc" },
      take: SELARAS_PER,
      select: PILIH,
    });
    if (daftar.length === 0) return beda;
    const ids = daftar.filter((kk) => kk.lokasiStatus !== ringkasLokasiKk(kk, kk.entri).status).map((kk) => kk.id);
    await perbaruiLokasiKk(ids);
    beda += ids.length;
    setelah = daftar[daftar.length - 1].id;
  }
}

module.exports = { perbaruiLokasiKk, selaraskanLokasiKk };

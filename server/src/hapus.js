"use strict";

/**
 * Penghapusan kertas kerja & data. Dipakai tombol hapus admin maupun
 * persetujuan pengajuan hapus, supaya keduanya tidak pernah berbeda: berkas
 * foto ikut dibuang, dan pengajuan hapus yang masih menunggu untuk sasaran itu
 * ditutup sebagai "disetujui" - permintaannya toh sudah terpenuhi. Tanpa itu
 * pengajuannya tertinggal menunggu selamanya dengan sasaran yang sudah NULL.
 */

const prisma = require("./prisma");
const { notFound } = require("./http");
const { hapusBerkas } = require("./foto");

/**
 * Tutup pengajuan menunggu yang cocok dengan `where`. Mengembalikan promise
 * Prisma yang belum dijalankan, untuk dimasukkan ke $transaction pemanggil.
 */
const tutupPengajuan = (where, admin) =>
  prisma.pengajuanHapus.updateMany({
    where: { ...where, status: "menunggu" },
    data: { status: "disetujui", diputuskanAt: new Date(), diputuskanOleh: admin?.username || "" },
  });

/** Hapus kertas kerja beserta seluruh entri & fotonya. */
async function hapusKertasKerja(id, admin) {
  const ada = await prisma.kertasKerja.findUnique({ where: { id }, select: { id: true } });
  if (!ada) throw notFound("Kertas kerja tidak ditemukan.");

  const berkas = await prisma.foto.findMany({
    where: { entri: { kertasKerjaId: id } },
    select: { berkas: true },
  });
  await prisma.$transaction([
    // Pengajuan hapus data di dalamnya ikut tertutup: datanya ikut terhapus.
    tutupPengajuan({ kertasKerjaId: id }, admin),
    prisma.kertasKerja.delete({ where: { id } }),
  ]);
  await hapusBerkas(berkas.map((f) => f.berkas));
}

/** Hapus satu entri beserta fotonya. */
async function hapusEntri(id, admin) {
  const ada = await prisma.entri.findUnique({ where: { id }, select: { id: true } });
  if (!ada) throw notFound("Data tidak ditemukan.");

  const berkas = await prisma.foto.findMany({ where: { entriId: id }, select: { berkas: true } });
  await prisma.$transaction([
    tutupPengajuan({ entriId: id }, admin),
    prisma.entri.delete({ where: { id } }),
  ]);
  await hapusBerkas(berkas.map((f) => f.berkas));
}

module.exports = { tutupPengajuan, hapusKertasKerja, hapusEntri };

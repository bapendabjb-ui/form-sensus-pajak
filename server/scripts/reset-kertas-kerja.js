"use strict";

/**
 * Kosongkan seluruh kertas kerja beserta datanya, lalu mulai penomoran dari 00001.
 *
 *   node server/scripts/reset-kertas-kerja.js           (hanya menghitung, tidak menghapus)
 *   node server/scripts/reset-kertas-kerja.js --yakin   (benar-benar menghapus)
 *
 * Yang dihapus: kertas kerja, tim petugasnya, entri, jawaban, rincian tarif,
 * semua foto (baris database dan berkasnya di UPLOAD_DIR), dan counter nomor
 * dikembalikan ke 0. Periode data dinaikkan sehingga draf isian di browser
 * petugas ikut dibuang saat aplikasi dibuka berikutnya.
 * Yang tetap: admin, petugas, bank formulir & pertanyaannya.
 *
 * AUTO_INCREMENT id sengaja tidak di-reset: draf isian di browser petugas
 * disimpan per id kertas kerja / entri, jadi id lama tidak boleh dipakai ulang.
 * Buat cadangan database dan folder foto sebelum menjalankan dengan --yakin.
 */

const fsp = require("fs").promises;
const path = require("path");
const config = require("../src/config");
const prisma = require("../src/prisma");

async function main() {
  const yakin = process.argv.includes("--yakin");

  const [kertasKerja, entri, jawaban, foto] = await Promise.all([
    prisma.kertasKerja.count(),
    prisma.entri.count(),
    prisma.jawaban.count(),
    prisma.foto.count(),
  ]);
  console.log(`Database : ${String(process.env.DATABASE_URL || "").replace(/\/\/[^@]*@/, "//***@")}`);
  console.log(`Foto     : ${config.uploadDir}`);
  console.log(`Akan dihapus: ${kertasKerja} kertas kerja, ${entri} entri, ${jawaban} jawaban, ${foto} foto.`);

  if (!yakin) {
    console.log("Mode uji - tidak ada yang dihapus. Tambahkan --yakin untuk menjalankan.");
    return;
  }

  await prisma.$transaction([
    // Semua foto, termasuk unggahan yang belum ditautkan ke entri.
    prisma.foto.deleteMany({}),
    // Cascade: kertas_kerja_petugas, entri, jawaban, rincian_tarif.
    prisma.kertasKerja.deleteMany({}),
    // Periode naik: browser petugas membuang draf lamanya saat aplikasi dibuka.
    prisma.$executeRaw`UPDATE nomor_counter SET last_nomor = 0, periode = periode + 1 WHERE id = 1`,
  ]);
  console.log("Data kertas kerja dihapus, counter nomor kembali ke 0, draf di perangkat petugas akan dibuang.");

  // Isi UPLOAD_DIR hanya berisi foto; kosongkan isinya tanpa menghapus foldernya
  // (di Railway folder ini adalah mount point volume).
  const isi = await fsp.readdir(config.uploadDir).catch(() => []);
  await Promise.all(isi.map((nama) => fsp.rm(path.join(config.uploadDir, nama), { recursive: true, force: true })));
  console.log(`Folder foto dikosongkan (${isi.length} item teratas).`);
}

main()
  .catch((e) => {
    console.error("Reset gagal:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

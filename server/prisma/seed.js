"use strict";

/**
 * Data contoh Sensus Pajak (bank formulir + petugas).
 *
 * Dijalankan otomatis saat server start bila SEED_DEMO=true DAN database masih
 * kosong, atau manual dengan `npm run db:seed`. Idempoten: tidak menimpa data
 * yang sudah ada.
 */

const prisma = require("../src/prisma");
const { ensureCounter } = require("../src/nomor");

// Data kecamatan & kelurahan Kota Banjarbaru ada di src/wilayah.js
// dan dipakai lewat pertanyaan bertipe "wilayah".

const FORMULIR_CONTOH = [
  {
    judul: "Identitas Wajib Pajak",
    deskripsi: "Data dasar wajib pajak dan lokasi objek.",
    pertanyaan: [
      { tipe: "text", label: "Nama wajib pajak", wajib: true },
      { tipe: "nik", label: "NIK penanggung jawab", wajib: true },
      { tipe: "npwp", label: "NPWP" },
      { tipe: "paragraph", label: "Alamat objek pajak" },
      { tipe: "wilayah", label: "Kecamatan & kelurahan" },
      { tipe: "rtrw", label: "RT & RW", wajib: true },
      { tipe: "text", label: "Nomor telepon / narahubung" },
    ],
  },
  {
    judul: "Objek & Tarif",
    deskripsi: "Rincian objek jasa hiburan beserta tarif layanannya.",
    pertanyaan: [
      { tipe: "text", label: "Nama tempat / objek", wajib: true },
      {
        tipe: "dropdown",
        label: "Jenis jasa hiburan",
        opsi: [
          "Karaoke", "Spa & Refleksi", "Diskotik / Kelab malam", "Bioskop",
          "Permainan ketangkasan", "Kolam renang", "Pertandingan olahraga",
        ],
      },
      {
        tipe: "checkbox",
        label: "Fasilitas pendukung",
        opsi: ["Ruang VIP", "Parkir berbayar", "Restoran / kafe", "Panggung hiburan"],
      },
      {
        tipe: "linetariff",
        label: "Rincian tarif layanan",
        opsi: ["Satuan", "Paket", "Per jam"],
        rangeHarga: true,
      },
      { tipe: "range", label: "Kisaran harga tiket masuk" },
      { tipe: "number", label: "Jumlah kapasitas tempat (orang)" },
      { tipe: "foto", label: "Foto objek (tampak depan & papan tarif)" },
    ],
  },
  {
    judul: "Perhitungan Pajak",
    deskripsi: "Dasar pengenaan, tarif, dan catatan petugas.",
    pertanyaan: [
      { tipe: "date", label: "Masa pajak", wajib: true },
      { tipe: "number", label: "Dasar pengenaan pajak (Rp)", wajib: true },
      { tipe: "number", label: "Tarif pajak (%)" },
      {
        tipe: "radio",
        label: "Metode pembukuan",
        opsi: ["Pembukuan lengkap", "Pencatatan sederhana", "Tidak ada pembukuan"],
      },
      { tipe: "date", label: "Tanggal pemeriksaan" },
      { tipe: "paragraph", label: "Catatan petugas" },
    ],
  },
];

const PETUGAS_CONTOH = [
  { nama: "Andi Saputra", nip: "198503122010011005" },
  { nama: "Rina Wati", nip: "199005212014032008" },
  { nama: "Bayu Pratama", nip: "199211072018011003" },
];

/**
 * @returns {Promise<{diisi: boolean, alasan?: string}>}
 */
async function seedDemo() {
  const [jumlahFormulir, jumlahPetugas] = await Promise.all([
    prisma.formulir.count(),
    prisma.petugas.count(),
  ]);

  if (jumlahFormulir > 0 || jumlahPetugas > 0) {
    return { diisi: false, alasan: "Database sudah berisi data, seed dilewati." };
  }

  for (const [urutForm, f] of FORMULIR_CONTOH.entries()) {
    await prisma.formulir.create({
      data: {
        judul: f.judul,
        deskripsi: f.deskripsi,
        urutan: urutForm + 1,
        pertanyaan: {
          create: f.pertanyaan.map((q, i) => ({
            tipe: q.tipe,
            label: q.label,
            wajib: Boolean(q.wajib),
            rangeHarga: Boolean(q.rangeHarga),
            urutan: i,
            opsi: { create: (q.opsi || []).map((nilai, j) => ({ nilai, urutan: j })) },
          })),
        },
      },
    });
  }

  await prisma.petugas.createMany({ data: PETUGAS_CONTOH });
  await ensureCounter();

  return { diisi: true };
}

module.exports = seedDemo;

// Dijalankan langsung: `node server/prisma/seed.js`
if (require.main === module) {
  seedDemo()
    .then((hasil) => {
      console.log(hasil.diisi ? "Data contoh berhasil diisi." : hasil.alasan);
    })
    .catch((e) => {
      console.error("Gagal mengisi data contoh:", e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

"use strict";

/**
 * Pengajuan hapus: petugas meminta admin menghapus kertas kerja atau satu data.
 * Berkas ini memuat bagian yang murni (validasi kiriman, judul, bentuk JSON)
 * supaya bisa diuji tanpa database; query-nya ada di routes/pengajuan.js.
 */

const { badRequest, parseId } = require("./http");

const JENIS = new Set(["kertas_kerja", "entri"]);

const ALASAN_MAKS = 500;
const JUDUL_MAKS = 300;

/**
 * Baca & periksa kiriman POST /api/pengajuan-hapus.
 * @returns {{ jenis: string, sasaranId: number, petugasId: number, alasan: string }}
 */
function bacaPengajuan(body) {
  const b = body && typeof body === "object" ? body : {};

  const jenis = String(b.jenis || "");
  if (!JENIS.has(jenis)) throw badRequest('Jenis pengajuan harus "kertas_kerja" atau "entri".');

  const sasaranId = parseId(b.sasaranId, "sasaranId");

  const petugasId = Number(b.petugasId);
  if (!Number.isInteger(petugasId) || petugasId <= 0) throw badRequest("Pilih nama Anda dari tim petugas.");

  const alasan = String(b.alasan ?? "").trim();
  if (!alasan) throw badRequest("Tuliskan alasan penghapusan.");
  if (alasan.length > ALASAN_MAKS) throw badRequest(`Alasan paling panjang ${ALASAN_MAKS} karakter.`);

  return { jenis, sasaranId, petugasId, alasan };
}

/**
 * Judul sebuah data: jawaban teks pertama, dengan pertanyaan wajib didahulukan.
 * Aturannya sama dengan judulEntri di client/src/lib/ringkas.js supaya judul
 * yang tersalin ke riwayat pengajuan sama dengan yang dilihat petugas di daftar.
 *
 * @param {object[]} pertanyaan  urut sesuai formulir
 * @param {object} jawaban       { [pertanyaanId]: nilai }
 */
const TIPE_JUDUL = new Set(["text", "dropdown", "radio", "paragraph"]);

function judulData(pertanyaan = [], jawaban = {}) {
  const terisi = (q) =>
    TIPE_JUDUL.has(q.tipe) && typeof jawaban[q.id] === "string" && jawaban[q.id].trim() !== "";
  const q = pertanyaan.find((x) => x.wajib && terisi(x)) || pertanyaan.find(terisi);
  return q ? jawaban[q.id].trim() : "";
}

/** "Toko Budi · PBJT Restoran", atau nama formulirnya saja bila data belum berjudul. */
const judulPengajuanData = (judul, formulir) => [judul, formulir].filter(Boolean).join(" · ").slice(0, JUDUL_MAKS);

const bentukPengajuan = (p) => ({
  id: p.id,
  jenis: p.jenis,
  kertasKerjaId: p.kertasKerjaId,
  entriId: p.entriId,
  nomorKk: p.nomorKk,
  judul: p.judul,
  alasan: p.alasan,
  pengaju: p.pengaju,
  status: p.status,
  createdAt: p.createdAt,
  diputuskanAt: p.diputuskanAt,
  diputuskanOleh: p.diputuskanOleh,
});

/**
 * Include Prisma untuk pengajuan terakhir sebuah sasaran yang masih perlu
 * terlihat di layarnya: yang menunggu, atau yang terakhir ditolak - supaya
 * petugas tahu permintaannya ditolak, bukan hilang begitu saja. Yang disetujui
 * tidak perlu: sasarannya sudah terhapus.
 */
const includePengajuanTerakhir = (jenis) => ({
  where: { jenis, status: { in: ["menunggu", "ditolak"] } },
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  take: 1,
});

const bentukPengajuanTerakhir = (rows = []) => (rows[0] ? bentukPengajuan(rows[0]) : null);

module.exports = {
  ALASAN_MAKS,
  bacaPengajuan,
  judulData,
  judulPengajuanData,
  bentukPengajuan,
  includePengajuanTerakhir,
  bentukPengajuanTerakhir,
};

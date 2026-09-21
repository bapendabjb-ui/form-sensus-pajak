"use strict";

/**
 * Logika bersama untuk menyimpan satu entri (satu isian formulir di dalam
 * kertas kerja): normalisasi nilai, validasi kolom wajib, penautan foto, dan
 * penulisan ke tabel jawaban / rincian_tarif / foto.
 */

const prisma = require("./prisma");
const { normalizeNilai, nilaiTerisi, pesanFormat, barisRincianTarif } = require("./answers");
const { FOTO_MAKS_PER_PERTANYAAN } = require("./batas");
const { includePertanyaan, bentukFormulir, petaJawaban } = require("./bentuk");
const { notFound } = require("./http");
const { SUMBER_EPBB } = require("./epbb");

/** Tipe pertanyaan yang bisa diisi dari EPBB - hanya ini yang boleh bertanda "dari EPBB". */
const TIPE_EPBB = new Set(Object.values(SUMBER_EPBB).flat());

/**
 * Siapkan jawaban dari kiriman klien.
 *
 * Dua lapis pemeriksaan: kolom wajib harus terisi, dan kolom identitas
 * (NIK / NPWP / NOP / RT & RW) harus benar panjang digitnya bila diisi.
 *
 * @param {object} formulir  formulir Prisma lengkap dengan pertanyaan
 * @param {object} masuk     { [pertanyaanId]: nilai }
 * @param {number|null} entriId  entri yang sedang diubah, null untuk entri baru
 * @param {number[]} [dariEpbb]  id pertanyaan yang isinya masih asli dari EPBB
 * @returns {Promise<{baris: object[], tarif: object[], foto: object[], errors: object}>}
 */
async function siapkanJawaban(formulir, masuk, entriId, dariEpbb = []) {
  const kiriman = masuk && typeof masuk === "object" ? masuk : {};
  const idEpbb = new Set((Array.isArray(dariEpbb) ? dariEpbb : []).map(Number));
  const siap = { baris: [], tarif: [], foto: [], errors: {} };

  const normal = formulir.pertanyaan.map((q) => ({
    q,
    nilai: normalizeNilai(q.tipe, kiriman[String(q.id)]),
  }));

  // Foto hanya sah bila baru diunggah (belum tertaut ke entri mana pun)
  // atau memang sudah milik entri yang sedang diubah.
  const idFoto = normal.filter((n) => n.q.tipe === "foto").flatMap((n) => n.nilai.map((f) => f.id));
  const fotoSah = new Map();
  if (idFoto.length) {
    const rows = await prisma.foto.findMany({ where: { id: { in: idFoto } } });
    for (const f of rows) {
      if (f.entriId === null || f.entriId === entriId) fotoSah.set(f.id, f);
    }
  }
  const sudahDipakai = new Set();

  for (const { q, nilai: nilaiAwal } of normal) {
    let nilai = nilaiAwal;

    if (q.tipe === "foto") {
      nilai = nilai
        .filter((f) => fotoSah.has(f.id) && !sudahDipakai.has(f.id))
        .slice(0, FOTO_MAKS_PER_PERTANYAAN)
        .map((f) => {
          sudahDipakai.add(f.id);
          return { id: f.id, nama: fotoSah.get(f.id).namaAsli };
        });
      siap.foto.push({ pertanyaanId: q.id, ids: nilai.map((f) => f.id) });
    }

    if (q.wajib && !nilaiTerisi(q.tipe, nilai)) {
      siap.errors[q.id] = pesanWajib(q.tipe);
    } else {
      const galat = pesanFormat(q.tipe, nilai);
      if (galat) siap.errors[q.id] = galat;
    }

    siap.baris.push({
      pertanyaanId: q.id,
      nilai,
      dariEpbb: idEpbb.has(q.id) && TIPE_EPBB.has(q.tipe) && nilaiTerisi(q.tipe, nilai),
    });

    if (q.tipe === "linetariff") {
      for (const b of barisRincianTarif(nilai)) siap.tarif.push({ pertanyaanId: q.id, ...b });
    }
  }

  return siap;
}

const CATATAN_BERKAS_MAKS = 500;

/**
 * Baca penanda kelengkapan berkas dari kiriman klien.
 * Tanpa `berkasLengkap` (klien lama) hasilnya {} sehingga nilai tersimpan tidak berubah.
 * Catatan dikosongkan bila berkas lengkap.
 */
function bacaBerkas(body) {
  if (typeof body?.berkasLengkap !== "boolean") return {};
  const berkasLengkap = body.berkasLengkap;
  const catatanBerkas = berkasLengkap
    ? ""
    : String(body.catatanBerkas || "").trim().slice(0, CATATAN_BERKAS_MAKS);
  return { berkasLengkap, catatanBerkas };
}

/**
 * Baca koordinat rekaman otomatis dari body.
 *
 * Dikirim diam-diam oleh layar isi data, bukan berasal dari pertanyaan formulir.
 * Apa pun yang tidak masuk akal (izin ditolak, GPS gagal, angka di luar
 * jangkauan, nilai berbentuk teks) menghasilkan {} - artinya kolom rekaman
 * tidak disentuh sama sekali dan penyimpanan data tetap berjalan. Pendataan
 * tidak boleh terhalang urusan GPS.
 */
function bacaRekamKoordinat(body) {
  const r = body?.rekamKoordinat;
  if (!r || typeof r !== "object") return {};

  const lat = typeof r.lat === "number" ? r.lat : null;
  const lon = typeof r.lon === "number" ? r.lon : null;
  if (lat === null || lon === null) return {};
  if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) return {};

  const akurasi = typeof r.akurasi === "number" && r.akurasi >= 0 ? r.akurasi : null;
  return { rekamLat: lat, rekamLon: lon, rekamAkurasi: akurasi, rekamWaktu: new Date() };
}

/** Pesan untuk kolom wajib yang masih kosong - sama dengan client/src/lib/answers.js. */
function pesanWajib(tipe) {
  if (tipe === "foto") return "Tambahkan minimal satu foto.";
  if (tipe === "niknpwp") return "Isi NIK atau NPWP, minimal salah satu.";
  return "Kolom ini wajib diisi.";
}

/**
 * Tulis jawaban yang sudah disiapkan ke sebuah entri (di dalam transaksi).
 * @returns {Promise<string[]>} berkas foto yang dilepas — hapus dari disk setelah commit.
 */
async function tulisJawaban(tx, entriId, siap) {
  await tx.jawaban.deleteMany({ where: { entriId } });
  if (siap.baris.length) {
    await tx.jawaban.createMany({ data: siap.baris.map((b) => ({ entriId, ...b })) });
  }

  await tx.rincianTarif.deleteMany({ where: { entriId } });
  if (siap.tarif.length) {
    await tx.rincianTarif.createMany({ data: siap.tarif.map((t) => ({ entriId, ...t })) });
  }

  const dipakai = [];
  for (const { pertanyaanId, ids } of siap.foto) {
    if (ids.length) {
      await tx.foto.updateMany({ where: { id: { in: ids } }, data: { entriId, pertanyaanId } });
    }
    dipakai.push(...ids);
  }

  // Foto lama entri ini yang tidak dikirim ulang berarti dihapus pengguna.
  const dilepas = await tx.foto.findMany({
    where: dipakai.length ? { entriId, id: { notIn: dipakai } } : { entriId },
    select: { id: true, berkas: true },
  });
  if (dilepas.length) {
    await tx.foto.deleteMany({ where: { id: { in: dilepas.map((f) => f.id) } } });
  }
  return dilepas.map((f) => f.berkas);
}

/** Muat satu entri lengkap (formulir + jawaban + info kertas kerja) dalam bentuk JSON. */
/**
 * @param {number} id
 * @param {{ admin?: boolean }} opsi  admin=true menambahkan koordinat rekaman.
 */
async function muatEntri(id, { admin = false } = {}) {
  const e = await prisma.entri.findUnique({
    where: { id },
    include: { jawaban: true, kertasKerja: true, formulir: { include: includePertanyaan } },
  });
  if (!e) throw notFound("Data tidak ditemukan.");
  return {
    id: e.id,
    kertasKerja: {
      id: e.kertasKerja.id,
      nomor: e.kertasKerja.nomor,
      status: e.kertasKerja.status,
    },
    formulir: bentukFormulir(e.formulir),
    jawaban: petaJawaban(e.jawaban),
    dariEpbb: e.jawaban.filter((j) => j.dariEpbb).map((j) => j.pertanyaanId),
    berkasLengkap: e.berkasLengkap,
    catatanBerkas: e.catatanBerkas,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    // Koordinat rekaman hanya untuk admin. Disisipkan di sini, bukan disaring
    // di tampilan: kalau ikut terkirim, petugas bisa membacanya di network tab.
    ...(admin
      ? {
          rekamKoordinat:
            e.rekamLat === null || e.rekamLon === null
              ? null
              : { lat: e.rekamLat, lon: e.rekamLon, akurasi: e.rekamAkurasi, waktu: e.rekamWaktu },
        }
      : {}),
  };
}

/** Jumlah data berkas tidak lengkap per kertas kerja: Map<kertasKerjaId, jumlah>. */
async function hitungTidakLengkap(kkIds) {
  if (!kkIds.length) return new Map();
  const rows = await prisma.entri.groupBy({
    by: ["kertasKerjaId"],
    where: { kertasKerjaId: { in: kkIds }, berkasLengkap: false },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.kertasKerjaId, r._count._all]));
}

module.exports = {
  siapkanJawaban,
  tulisJawaban,
  muatEntri,
  bacaBerkas,
  bacaRekamKoordinat,
  hitungTidakLengkap,
};

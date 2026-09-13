"use strict";

/**
 * Logika bersama untuk menyimpan satu entri (satu isian formulir di dalam
 * kertas kerja): normalisasi nilai, validasi kolom wajib, penautan foto, dan
 * penulisan ke tabel jawaban / rincian_tarif / foto.
 */

const prisma = require("./prisma");
const { normalizeNilai, nilaiTerisi, barisRincianTarif } = require("./answers");
const { FOTO_MAKS_PER_PERTANYAAN } = require("./foto");
const { includePertanyaan, bentukFormulir, petaJawaban } = require("./bentuk");
const { notFound } = require("./http");

/**
 * Siapkan jawaban dari kiriman klien.
 *
 * @param {object} formulir  formulir Prisma lengkap dengan pertanyaan
 * @param {object} masuk     { [pertanyaanId]: nilai }
 * @param {number|null} entriId  entri yang sedang diubah, null untuk entri baru
 * @returns {Promise<{baris: object[], tarif: object[], foto: object[], errors: object}>}
 */
async function siapkanJawaban(formulir, masuk, entriId) {
  const kiriman = masuk && typeof masuk === "object" ? masuk : {};
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
      siap.errors[q.id] = q.tipe === "foto" ? "Tambahkan minimal satu foto." : "Kolom ini wajib diisi.";
    }

    siap.baris.push({ pertanyaanId: q.id, nilai });

    if (q.tipe === "linetariff") {
      for (const b of barisRincianTarif(nilai)) siap.tarif.push({ pertanyaanId: q.id, ...b });
    }
  }

  return siap;
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
async function muatEntri(id) {
  const e = await prisma.entri.findUnique({
    where: { id },
    include: { jawaban: true, kertasKerja: true, formulir: { include: includePertanyaan } },
  });
  if (!e) throw notFound("Data tidak ditemukan.");
  return {
    id: e.id,
    kertasKerja: { id: e.kertasKerja.id, nomor: e.kertasKerja.nomor, status: e.kertasKerja.status },
    formulir: bentukFormulir(e.formulir),
    jawaban: petaJawaban(e.jawaban),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

module.exports = { siapkanJawaban, tulisJawaban, muatEntri };

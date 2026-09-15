"use strict";

/** Bentuk keluaran JSON yang dipakai bersama oleh beberapa route. */

const includePertanyaan = {
  pertanyaan: { orderBy: { urutan: "asc" }, include: { opsi: { orderBy: { urutan: "asc" } } } },
};

const bentukPertanyaan = (q) => ({
  id: q.id,
  tipe: q.tipe,
  label: q.label,
  keterangan: q.keterangan || "",
  wajib: q.wajib,
  rangeHarga: q.rangeHarga,
  urutan: q.urutan,
  opsi: (q.opsi || []).slice().sort((a, b) => a.urutan - b.urutan).map((o) => o.nilai),
});

const bentukFormulir = (f) => ({
  id: f.id,
  judul: f.judul,
  deskripsi: f.deskripsi || "",
  urutan: f.urutan ?? 0,
  createdAt: f.createdAt,
  pertanyaan: (f.pertanyaan || []).map(bentukPertanyaan),
});

const bentukPetugas = (p) => ({ id: p.id, nama: p.nama, nip: p.nip });

/** Tim petugas dari baris kertas_kerja_petugas (dengan relasi petugas), urut. */
const bentukTim = (rows = []) =>
  rows
    .slice()
    .sort((a, b) => a.urutan - b.urutan || a.id - b.id)
    .map((r) => bentukPetugas(r.petugas));

/** Peta jawaban { [pertanyaanId]: nilai }. */
function petaJawaban(jawaban = []) {
  const peta = {};
  for (const j of jawaban) peta[j.pertanyaanId] = j.nilai;
  return peta;
}

module.exports = {
  includePertanyaan,
  bentukPertanyaan,
  bentukFormulir,
  bentukPetugas,
  bentukTim,
  petaJawaban,
};

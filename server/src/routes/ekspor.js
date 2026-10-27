"use strict";

/**
 * Ekspor per kecamatan / kelurahan objek pajak (aturannya di
 * src/eksporWilayah.js) dan per petugas. Susunan kolomnya sama dengan ekspor
 * per kertas kerja dan per formulir (src/ekspor.js). Khusus admin.
 */

const express = require("express");
const prisma = require("../prisma");
const config = require("../config");
const { requireAdmin } = require("../auth");
const { wrap, badRequest, notFound, parseId } = require("../http");
const { includePertanyaan } = require("../bentuk");
const { susunEkspor, baseUrlEkspor, namaBerkas, kirimCsv, kirimXlsx } = require("../ekspor");
const { pertanyaanObjek, bacaPilihanWilayah, saringWilayah } = require("../eksporWilayah");

const router = express.Router();

/** Wilayah terpilih + saringan datanya, dari query string. */
async function muatSaringan(req) {
  const pilihan = bacaPilihanWilayah(req.query);
  if (!pilihan) throw badRequest("Pilih kecamatan (dan kelurahan) Kota Banjarbaru.");

  const pertanyaan = await prisma.pertanyaan.findMany({
    where: { tipe: "wilayah" },
    select: { id: true, tipe: true, label: true, isiEpbb: true },
  });
  const qIds = pertanyaan.filter(pertanyaanObjek).map((q) => q.id);
  const jawaban = qIds.length
    ? await prisma.jawaban.findMany({
        where: { pertanyaanId: { in: qIds } },
        select: { entriId: true, nilai: true, entri: { select: { kertasKerjaId: true } } },
      })
    : [];

  const saring = saringWilayah(
    jawaban.map((j) => ({ entriId: j.entriId, kertasKerjaId: j.entri.kertasKerjaId, nilai: j.nilai })),
    pilihan
  );
  return { pilihan, saring };
}

/**
 * GET /api/ekspor/wilayah/ringkas?kecamatan=&kelurahan=
 *   -> { kertasKerja, data, formulir: [{ id, judul, jumlah }], tanpaWilayah }
 *
 * Untuk layar ekspor sebelum mengunduh: berapa yang akan ikut, formulir apa
 * saja yang berisi data di wilayah itu, dan berapa kertas kerja berisi data
 * yang belum punya wilayah objek sehingga tidak masuk ekspor wilayah mana pun.
 */
router.get(
  "/wilayah/ringkas",
  requireAdmin,
  wrap(async (req, res) => {
    const { saring } = await muatSaringan(req);

    const [entri, kkBerdata] = await Promise.all([
      saring.kkIds.length
        ? prisma.entri.findMany({
            where: { kertasKerjaId: { in: saring.kkIds } },
            select: { id: true, kertasKerjaId: true, formulirId: true },
          })
        : [],
      prisma.entri.findMany({ distinct: ["kertasKerjaId"], select: { kertasKerjaId: true } }),
    ]);

    const ikut = entri.filter(saring.ikut);
    res.json({
      kertasKerja: new Set(ikut.map((e) => e.kertasKerjaId)).size,
      data: ikut.length,
      formulir: await jumlahPerFormulir(ikut),
      tanpaWilayah: kkBerdata.filter((k) => !saring.kkBerwilayah.has(k.kertasKerjaId)).length,
    });
  })
);

/** Entri beserta jawaban & kertas kerjanya (+ tim), bahan susunEkspor. */
const includeEkspor = { jawaban: true, kertasKerja: { include: { petugas: { include: { petugas: true } } } } };

/** `?formulir=<id>`, atau null = semua formulir. */
const bacaFormulir = (req) => (req.query.formulir ? parseId(req.query.formulir, "formulir") : null);

/**
 * Susun berkas ekspor dari sekumpulan entri (includeEkspor). Dengan `formId`
 * hanya formulir itu; tanpa itu semua formulir yang berisi data, kolomnya
 * dikelompokkan per formulir seperti ekspor per kertas kerja.
 * Urut nomor kertas kerja, lalu urutan formulir di bank, lalu waktu input.
 *
 * @param {string[]} namaBagian  potongan nama berkas, mis. ["wilayah", "cempaka"]
 * @param {string}   judul       nama sheet sebelum judul formulir
 */
async function susunBerkas(req, entri, formId, { namaBagian, judul }) {
  const formulir = await prisma.formulir.findMany({
    where: { id: { in: formId ? [formId] : [...new Set(entri.map((e) => e.formulirId))] } },
    orderBy: [{ urutan: "asc" }, { id: "asc" }],
    include: includePertanyaan,
  });
  if (formId && formulir.length === 0) throw notFound("Formulir tidak ditemukan.");

  const urutForm = new Map(formulir.map((f, i) => [f.id, i]));
  const data = entri
    .map((e) => ({ kk: e.kertasKerja, e }))
    .sort(
      (a, b) =>
        a.kk.nomor.localeCompare(b.kk.nomor) ||
        urutForm.get(a.e.formulirId) - urutForm.get(b.e.formulirId) ||
        a.e.createdAt - b.e.createdAt ||
        a.e.id - b.e.id
    );

  const satu = formId ? formulir[0] : null;
  return {
    nama: [...namaBagian, satu && namaBerkas(satu.judul, "formulir")].filter(Boolean).join("-"),
    sheet: satu ? `${judul} ${satu.judul}` : judul,
    tabel: susunEkspor(data, formulir, { baseUrl: baseUrlEkspor(req), timezone: config.timezone }),
  };
}

/** Jumlah data per formulir, urut bank formulir: [{ id, judul, jumlah }]. */
async function jumlahPerFormulir(entri) {
  const perForm = new Map();
  for (const e of entri) perForm.set(e.formulirId, (perForm.get(e.formulirId) || 0) + 1);
  if (perForm.size === 0) return [];
  const formulir = await prisma.formulir.findMany({
    where: { id: { in: [...perForm.keys()] } },
    orderBy: [{ urutan: "asc" }, { id: "asc" }],
    select: { id: true, judul: true },
  });
  return formulir.map((f) => ({ id: f.id, judul: f.judul, jumlah: perForm.get(f.id) }));
}

/** Satu wilayah; `?formulir=<id>` membatasi ke satu formulir. */
async function dataEksporWilayah(req) {
  const { pilihan, saring } = await muatSaringan(req);
  const formId = bacaFormulir(req);

  const entri = saring.kkIds.length
    ? await prisma.entri.findMany({
        where: { kertasKerjaId: { in: saring.kkIds }, ...(formId ? { formulirId: formId } : {}) },
        include: includeEkspor,
      })
    : [];

  const { kecamatan, kelurahan } = pilihan;
  return susunBerkas(req, entri.filter(saring.ikut), formId, {
    namaBagian: ["wilayah", namaBerkas(kecamatan.nama), kelurahan && namaBerkas(kelurahan.nama)],
    judul: kelurahan ? kelurahan.nama : `Kec. ${kecamatan.nama}`,
  });
}

/** GET /api/ekspor/wilayah?kecamatan=&kelurahan=&formulir= -> CSV (BOM UTF-8). */
router.get(
  "/wilayah",
  requireAdmin,
  wrap(async (req, res) => kirimCsv(res, await dataEksporWilayah(req)))
);

/** GET /api/ekspor/wilayah/xlsx?kecamatan=&kelurahan=&formulir= -> Excel, isi sama dengan CSV. */
router.get(
  "/wilayah/xlsx",
  requireAdmin,
  wrap(async (req, res) => kirimXlsx(res, await dataEksporWilayah(req)))
);

/* ---------- per petugas ---------- */

/*
 * Patokannya keanggotaan tim, sama dengan rekap di menu Petugas (src/rekap.js):
 * semua data di kertas kerja yang timnya memuat petugas itu. Kolom "Diisi
 * oleh" tidak dipakai karena baru tercatat sejak ada login petugas.
 */

/** `?petugas=<id>` -> { id, nama }. */
async function muatPetugas(req) {
  const id = parseId(req.query.petugas, "petugas");
  const p = await prisma.petugas.findUnique({ where: { id }, select: { id: true, nama: true } });
  if (!p) throw notFound("Petugas tidak ditemukan.");
  return p;
}

const syaratTim = (petugasId) => ({ kertasKerja: { petugas: { some: { petugasId } } } });

/**
 * GET /api/ekspor/petugas/ringkas?petugas=
 *   -> { kertasKerja, kertasKerjaBerdata, data, formulir: [{ id, judul, jumlah }] }
 * `kertasKerja` termasuk yang belum berisi data (sama dengan menu Petugas);
 * yang belum berisi data tidak punya baris di berkas ekspor.
 */
router.get(
  "/petugas/ringkas",
  requireAdmin,
  wrap(async (req, res) => {
    const p = await muatPetugas(req);
    const [entri, kertasKerja] = await Promise.all([
      prisma.entri.findMany({ where: syaratTim(p.id), select: { formulirId: true, kertasKerjaId: true } }),
      prisma.kertasKerjaPetugas.count({ where: { petugasId: p.id } }),
    ]);
    res.json({
      kertasKerja,
      kertasKerjaBerdata: new Set(entri.map((e) => e.kertasKerjaId)).size,
      data: entri.length,
      formulir: await jumlahPerFormulir(entri),
    });
  })
);

/** Satu petugas; `?formulir=<id>` membatasi ke satu formulir. */
async function dataEksporPetugas(req) {
  const p = await muatPetugas(req);
  const formId = bacaFormulir(req);
  const entri = await prisma.entri.findMany({
    where: { ...syaratTim(p.id), ...(formId ? { formulirId: formId } : {}) },
    include: includeEkspor,
  });
  return susunBerkas(req, entri, formId, {
    namaBagian: ["petugas", namaBerkas(p.nama, "petugas")],
    judul: p.nama,
  });
}

/** GET /api/ekspor/petugas?petugas=&formulir= -> CSV (BOM UTF-8). */
router.get(
  "/petugas",
  requireAdmin,
  wrap(async (req, res) => kirimCsv(res, await dataEksporPetugas(req)))
);

/** GET /api/ekspor/petugas/xlsx?petugas=&formulir= -> Excel, isi sama dengan CSV. */
router.get(
  "/petugas/xlsx",
  requireAdmin,
  wrap(async (req, res) => kirimXlsx(res, await dataEksporPetugas(req)))
);

module.exports = router;

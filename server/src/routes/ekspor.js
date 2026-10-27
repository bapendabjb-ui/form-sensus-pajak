"use strict";

/**
 * Ekspor per kecamatan / kelurahan objek pajak. Aturan pemilihan datanya di
 * src/eksporWilayah.js; susunan kolomnya sama dengan ekspor per kertas kerja
 * dan per formulir (src/ekspor.js). Khusus admin.
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
    const perForm = new Map();
    for (const e of ikut) perForm.set(e.formulirId, (perForm.get(e.formulirId) || 0) + 1);
    const formulir = perForm.size
      ? await prisma.formulir.findMany({
          where: { id: { in: [...perForm.keys()] } },
          orderBy: [{ urutan: "asc" }, { id: "asc" }],
          select: { id: true, judul: true },
        })
      : [];

    res.json({
      kertasKerja: new Set(ikut.map((e) => e.kertasKerjaId)).size,
      data: ikut.length,
      formulir: formulir.map((f) => ({ id: f.id, judul: f.judul, jumlah: perForm.get(f.id) })),
      tanpaWilayah: kkBerdata.filter((k) => !saring.kkBerwilayah.has(k.kertasKerjaId)).length,
    });
  })
);

/**
 * Susun tabel ekspor satu wilayah. `?formulir=<id>` membatasi ke satu
 * formulir; tanpa itu semua formulir yang berisi data di wilayah itu, kolomnya
 * dikelompokkan per formulir seperti ekspor per kertas kerja.
 * Urut nomor kertas kerja, lalu urutan formulir di bank, lalu waktu input.
 */
async function dataEksporWilayah(req) {
  const { pilihan, saring } = await muatSaringan(req);
  const formId = req.query.formulir ? parseId(req.query.formulir) : null;

  const entri = saring.kkIds.length
    ? await prisma.entri.findMany({
        where: { kertasKerjaId: { in: saring.kkIds }, ...(formId ? { formulirId: formId } : {}) },
        include: { jawaban: true, kertasKerja: { include: { petugas: { include: { petugas: true } } } } },
      })
    : [];
  const ikut = entri.filter(saring.ikut);

  const formulir = await prisma.formulir.findMany({
    where: { id: { in: formId ? [formId] : [...new Set(ikut.map((e) => e.formulirId))] } },
    orderBy: [{ urutan: "asc" }, { id: "asc" }],
    include: includePertanyaan,
  });
  if (formId && formulir.length === 0) throw notFound("Formulir tidak ditemukan.");

  const urutForm = new Map(formulir.map((f, i) => [f.id, i]));
  const data = ikut
    .map((e) => ({ kk: e.kertasKerja, e }))
    .sort(
      (a, b) =>
        a.kk.nomor.localeCompare(b.kk.nomor) ||
        urutForm.get(a.e.formulirId) - urutForm.get(b.e.formulirId) ||
        a.e.createdAt - b.e.createdAt ||
        a.e.id - b.e.id
    );

  const { kecamatan, kelurahan } = pilihan;
  const satu = formId ? formulir[0] : null;
  const nama = [
    "wilayah",
    namaBerkas(kecamatan.nama),
    kelurahan && namaBerkas(kelurahan.nama),
    satu && namaBerkas(satu.judul, "formulir"),
  ]
    .filter(Boolean)
    .join("-");
  const tempat = kelurahan ? kelurahan.nama : `Kec. ${kecamatan.nama}`;

  return {
    nama,
    sheet: satu ? `${tempat} ${satu.judul}` : tempat,
    tabel: susunEkspor(data, formulir, { baseUrl: baseUrlEkspor(req), timezone: config.timezone }),
  };
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

module.exports = router;

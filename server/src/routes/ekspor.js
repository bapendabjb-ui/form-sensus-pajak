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
const { susunEkspor, susunEksporPerKk, baseUrlEkspor, namaBerkas, kirimCsv, kirimXlsx } = require("../ekspor");
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
 * hanya formulir itu, satu baris per data; tanpa itu semua formulir yang
 * berisi data, satu baris per kertas kerja (lihat susunEksporPerKk).
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
  const susun = satu ? susunEkspor : susunEksporPerKk;
  return {
    nama: [...namaBagian, satu && namaBerkas(satu.judul, "formulir")].filter(Boolean).join("-"),
    sheet: satu ? `${judul} ${satu.judul}` : judul,
    tabel: susun(data, formulir, { baseUrl: baseUrlEkspor(req), timezone: config.timezone }),
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
 *
 * Beberapa petugas sekaligus = kertas kerja yang timnya memuat SALAH SATU dari
 * mereka. Kertas kerja yang sama hanya muncul sekali, jadi memilih anggota
 * satu tim tidak membuat datanya dobel.
 */

/** Petugas paling banyak dalam satu ekspor. */
const PETUGAS_EKSPOR_MAKS = 50;

/** `?petugas=3,1,7` -> [3, 1, 7]: unik, urut pilihan admin. */
function bacaIdPetugas(query = {}) {
  const ids = [
    ...new Set(
      String(query.petugas || "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
    ),
  ];
  if (ids.length === 0) throw badRequest("Pilih minimal satu petugas.");
  if (ids.length > PETUGAS_EKSPOR_MAKS) throw badRequest(`Paling banyak ${PETUGAS_EKSPOR_MAKS} petugas sekaligus.`);
  return ids;
}

/** Petugas terpilih [{ id, nama }], urut pilihan admin. */
async function muatPetugas(req) {
  const ids = bacaIdPetugas(req.query);
  const daftar = await prisma.petugas.findMany({ where: { id: { in: ids } }, select: { id: true, nama: true } });
  if (daftar.length !== ids.length) throw notFound("Ada petugas yang tidak ditemukan.");
  const perId = new Map(daftar.map((p) => [p.id, p]));
  return ids.map((id) => perId.get(id));
}

const syaratTim = (ids) => ({ kertasKerja: { petugas: { some: { petugasId: { in: ids } } } } });

/**
 * Nama berkas & sheet: satu petugas -> namanya; beberapa -> nama pertama
 * ditambah jumlah sisanya ("petugas-surya-dan-2-lainnya", "Surya +2").
 */
function namaPetugas(daftar) {
  const [pertama] = daftar;
  const lain = daftar.length - 1;
  return {
    namaBagian: ["petugas", namaBerkas(pertama.nama, "petugas"), lain > 0 && `dan-${lain}-lainnya`],
    judul: lain > 0 ? `${pertama.nama} +${lain}` : pertama.nama,
  };
}

/**
 * GET /api/ekspor/petugas/ringkas?petugas=3,1
 *   -> { kertasKerja, kertasKerjaBerdata, data, formulir: [{ id, judul, jumlah }] }
 * `kertasKerja` termasuk yang belum berisi data (sama dengan menu Petugas);
 * yang belum berisi data tidak punya baris di berkas ekspor.
 */
router.get(
  "/petugas/ringkas",
  requireAdmin,
  wrap(async (req, res) => {
    const ids = (await muatPetugas(req)).map((p) => p.id);
    const [entri, tim] = await Promise.all([
      prisma.entri.findMany({ where: syaratTim(ids), select: { formulirId: true, kertasKerjaId: true } }),
      prisma.kertasKerjaPetugas.findMany({
        where: { petugasId: { in: ids } },
        distinct: ["kertasKerjaId"],
        select: { kertasKerjaId: true },
      }),
    ]);
    res.json({
      kertasKerja: tim.length,
      kertasKerjaBerdata: new Set(entri.map((e) => e.kertasKerjaId)).size,
      data: entri.length,
      formulir: await jumlahPerFormulir(entri),
    });
  })
);

/** Satu atau beberapa petugas; `?formulir=<id>` membatasi ke satu formulir. */
async function dataEksporPetugas(req) {
  const daftar = await muatPetugas(req);
  const formId = bacaFormulir(req);
  const entri = await prisma.entri.findMany({
    where: { ...syaratTim(daftar.map((p) => p.id)), ...(formId ? { formulirId: formId } : {}) },
    include: includeEkspor,
  });
  return susunBerkas(req, entri, formId, namaPetugas(daftar));
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

// Diekspor untuk diuji terpisah: murni, tanpa database.
module.exports.bacaIdPetugas = bacaIdPetugas;
module.exports.namaPetugas = namaPetugas;

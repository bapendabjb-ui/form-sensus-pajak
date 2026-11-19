"use strict";

/**
 * Ekspor per kecamatan / kelurahan objek pajak (aturannya di
 * src/eksporWilayah.js), per petugas, dan seluruh data. Susunan kolomnya sama
 * dengan ekspor per kertas kerja dan per formulir (src/ekspor.js). Khusus admin.
 *
 * Setiap ekspor tersedia sebagai CSV (jalur dasarnya), /xlsx, /geojson, dan
 * /kml - dipasang sekaligus oleh rutekanEkspor.
 *
 * Laporan SPJ (src/eksporSpj.js) punya susunan sendiri - satu baris per
 * kertas kerja, tanpa isian formulir - dan hanya CSV & Excel.
 */

const express = require("express");
const prisma = require("../prisma");
const config = require("../config");
const { requireAdmin } = require("../auth");
const { wrap, badRequest, notFound, parseId } = require("../http");
const { includePertanyaan } = require("../bentuk");
const { susunTabel, baseUrlEkspor, namaBerkas, rutekanEkspor } = require("../ekspor");
const { muatEntriEkspor } = require("../muatEkspor");
const { pencariPersilEkspor, pencariWilayahPersil } = require("../persil");
const { pertanyaanObjek, bacaPilihanWilayah, saringWilayah } = require("../eksporWilayah");
const {
  bacaPilihanSpj,
  susunBarisSpj,
  titikPeta,
  lengkapiDariPeta,
  perkiraRtRw,
  saringSpj,
  urutSpj,
  tabelSpj,
  gabungIsianFormulir,
  ringkasSpj,
} = require("../eksporSpj");

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

/** `?formulir=<id>`, atau null = semua formulir. */
const bacaFormulir = (req) => (req.query.formulir ? parseId(req.query.formulir, "formulir") : null);

/**
 * Susun berkas ekspor dari sekumpulan entri (muatEntriEkspor). Dengan `formId`
 * hanya formulir itu, satu baris per data; tanpa itu semua formulir yang
 * berisi data, satu baris per kertas kerja (lihat susunTabel).
 *
 * @param {string[]} namaBagian  potongan nama berkas, mis. ["wilayah", "cempaka"]
 * @param {string}   judul       nama sheet sebelum judul formulir
 * @param {Function} [ikut]      saringan data; `entri` tetap berisi seluruh data
 *                               kertas kerjanya supaya "No. data" tidak bergeser
 */
async function susunBerkas(req, entri, formId, { namaBagian, judul, ikut }) {
  const berisi = ikut ? entri.filter(ikut) : entri;
  const formulir = await prisma.formulir.findMany({
    where: { id: { in: formId ? [formId] : [...new Set(berisi.map((e) => e.formulirId))] } },
    orderBy: [{ urutan: "asc" }, { id: "asc" }],
    include: includePertanyaan,
  });
  if (formId && formulir.length === 0) throw notFound("Formulir tidak ditemukan.");

  const satu = formId ? formulir[0] : null;
  const persilDi = await pencariPersilEkspor(berisi);
  return {
    nama: [...namaBagian, satu && namaBerkas(satu.judul, "formulir")].filter(Boolean).join("-"),
    sheet: satu ? `${judul} ${satu.judul}` : judul,
    tabel: susunTabel(
      entri.map((e) => ({ kk: e.kertasKerja, e })),
      formulir,
      { perData: Boolean(satu), ikut, baseUrl: baseUrlEkspor(req), timezone: config.timezone, persilDi }
    ),
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
    ? await muatEntriEkspor({ kertasKerjaId: { in: saring.kkIds }, ...(formId ? { formulirId: formId } : {}) })
    : [];

  const { kecamatan, kelurahan } = pilihan;
  return susunBerkas(req, entri, formId, {
    namaBagian: ["wilayah", namaBerkas(kecamatan.nama), kelurahan && namaBerkas(kelurahan.nama)],
    judul: kelurahan ? kelurahan.nama : `Kec. ${kecamatan.nama}`,
    ikut: saring.ikut,
  });
}

/** GET /api/ekspor/wilayah[/xlsx|/geojson|/kml]?kecamatan=&kelurahan=&formulir= */
rutekanEkspor(router, "/wilayah", requireAdmin, dataEksporWilayah);

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
  const entri = await muatEntriEkspor({
    ...syaratTim(daftar.map((p) => p.id)),
    ...(formId ? { formulirId: formId } : {}),
  });
  return susunBerkas(req, entri, formId, namaPetugas(daftar));
}

/** GET /api/ekspor/petugas[/xlsx|/geojson|/kml]?petugas=&formulir= */
rutekanEkspor(router, "/petugas", requireAdmin, dataEksporPetugas);

/* ---------- seluruh data ---------- */

/**
 * Seluruh data semua formulir dari semua kertas kerja, satu baris per kertas
 * kerja - sama dengan menggabungkan ekspor "Semua formulir" tiap kertas kerja.
 * Kertas kerja yang belum berisi data tidak punya baris.
 */
async function dataEksporSemua(req) {
  const entri = await muatEntriEkspor();
  return susunBerkas(req, entri, null, { namaBagian: ["semua-data"], judul: "Semua data" });
}

/** GET /api/ekspor/semua[/xlsx|/geojson|/kml] */
rutekanEkspor(router, "/semua", requireAdmin, dataEksporSemua);

/* ---------- laporan SPJ ---------- */

/*
 * Satu baris per kertas kerja berisi data: tanggal sensus, nomor, status, nama
 * petugas (satu kolom per orang), kecamatan, kelurahan, RW, RT objek pajak.
 * Aturan susunannya di src/eksporSpj.js. Hanya CSV & Excel: tanpa koordinat.
 */

const JENIS_SPJ = ["", "/xlsx"];

/**
 * Baris laporan SPJ dengan wilayah dari peta BPN sudah dilengkapi, belum
 * tersaring dan belum terurut, beserta titik koordinat per kertas kerja.
 * `titikSemua` = muat titik semua kertas kerja (untuk perkiraan RT/RW), bukan
 * hanya yang tanpa isian wilayah.
 *
 * @returns {Promise<{ baris: object[], titik: Map<number, { lat, lon, sumber }> }>}
 */
async function muatSpj({ titikSemua = false } = {}) {
  const [awal, pertanyaan] = await Promise.all([
    prisma.entri.groupBy({ by: ["kertasKerjaId"], _min: { createdAt: true } }),
    prisma.pertanyaan.findMany({
      where: { tipe: { in: ["wilayah", "rtrw", "lokasi"] } },
      select: { id: true, tipe: true, label: true, isiEpbb: true, urutan: true },
    }),
  ]);
  const letak = new Map(pertanyaan.filter(pertanyaanObjek).map((q) => [q.id, q]));
  const lokasiIds = pertanyaan.filter((q) => q.tipe === "lokasi").map((q) => q.id);
  const kkIds = awal.map((a) => a.kertasKerjaId);

  const [kertasKerja, jawaban] = await Promise.all([
    kkIds.length
      ? prisma.kertasKerja.findMany({
          where: { id: { in: kkIds } },
          select: {
            id: true,
            nomor: true,
            status: true,
            petugas: { include: { petugas: { select: { id: true, nama: true, nip: true } } } },
          },
        })
      : [],
    letak.size
      ? prisma.jawaban.findMany({
          where: { pertanyaanId: { in: [...letak.keys()] } },
          select: {
            entriId: true,
            pertanyaanId: true,
            nilai: true,
            entri: { select: { kertasKerjaId: true, createdAt: true } },
          },
        })
      : [],
  ]);

  const baris = susunBarisSpj({
    kertasKerja,
    mulai: new Map(awal.map((a) => [a.kertasKerjaId, a._min.createdAt])),
    jawaban: jawaban.map((j) => ({
      kertasKerjaId: j.entri.kertasKerjaId,
      entriId: j.entriId,
      tipe: letak.get(j.pertanyaanId).tipe,
      nilai: j.nilai,
      waktu: j.entri.createdAt,
      urutan: letak.get(j.pertanyaanId).urutan,
    })),
  });

  // Tanpa isian wilayah objek: kecamatan & kelurahan dari peta BPN di titik koordinatnya.
  const tanpaWilayah = baris.filter((b) => !b.sumberWilayah).map((b) => b.kk.id);
  const perluTitik = titikSemua ? kkIds : tanpaWilayah;
  if (perluTitik.length === 0) return { baris, titik: new Map() };
  const entri = await prisma.entri.findMany({
    where: { kertasKerjaId: { in: perluTitik } },
    select: {
      id: true,
      kertasKerjaId: true,
      createdAt: true,
      rekamLat: true,
      rekamLon: true,
      rekamAkurasi: true,
      koordinatDicekAt: true,
      ...(lokasiIds.length && {
        jawaban: {
          where: { pertanyaanId: { in: lokasiIds } },
          select: { nilai: true },
          orderBy: { pertanyaan: { urutan: "asc" } },
        },
      }),
    },
  });
  const titik = titikPeta(entri);
  const tanpa = new Set(tanpaWilayah);
  const titikTanpaWilayah = [...titik].filter(([id]) => tanpa.has(id)).map(([, t]) => [t.lat, t.lon]);
  const cari = titikTanpaWilayah.length ? await pencariWilayahPersil(titikTanpaWilayah) : null;
  if (cari) lengkapiDariPeta(baris, titik, cari);
  return { baris, titik };
}

/**
 * Semua baris laporan SPJ, belum tersaring dan belum terurut. RT/RW yang
 * kosong diperkirakan dari kertas kerja sehari bila SPJ_PERKIRAAN_RTRW=1.
 */
async function muatBarisSpj() {
  const perkiraan = config.spjPerkiraanRtRw;
  const { baris, titik } = await muatSpj({ titikSemua: perkiraan });
  return perkiraan ? perkiraRtRw(baris, titik, { timezone: config.timezone }) : baris;
}

/** Pilihan wilayah laporan SPJ dari query string (semuanya boleh kosong). */
function pilihanSpj(req) {
  const pilihan = bacaPilihanSpj(req.query);
  if (!pilihan) throw badRequest("Pilihan wilayah tidak dikenal. Pilih berurutan: kecamatan, kelurahan, RW, lalu RT.");
  return pilihan;
}

/** Mentah: semua kertas kerja berisi data, urut nomor. */
async function dataEksporSpj() {
  return {
    nama: "spj-kertas-kerja",
    sheet: "SPJ",
    tabel: tabelSpj(urutSpj(await muatBarisSpj(), false), { timezone: config.timezone }),
  };
}

/**
 * Dengan seluruh isian formulir: kolom SPJ mentah, lalu kolom semua formulir
 * (sama dengan ekspor "Seluruh data"). Urut nomor, tanpa saringan wilayah.
 */
async function dataEksporSpjFormulir(req) {
  const [barisSpj, entri] = await Promise.all([muatBarisSpj(), muatEntriEkspor()]);
  const formulir = await prisma.formulir.findMany({
    where: { id: { in: [...new Set(entri.map((e) => e.formulirId))] } },
    orderBy: [{ urutan: "asc" }, { id: "asc" }],
    include: includePertanyaan,
  });
  const isian = susunTabel(
    entri.map((e) => ({ kk: e.kertasKerja, e })),
    formulir,
    {
      perData: false,
      baseUrl: baseUrlEkspor(req),
      timezone: config.timezone,
      persilDi: await pencariPersilEkspor(entri),
    }
  );
  return {
    nama: "spj-isian-formulir",
    sheet: "SPJ + isian formulir",
    tabel: gabungIsianFormulir(tabelSpj(urutSpj(barisSpj, false), { timezone: config.timezone }), isian),
  };
}

/** Per wilayah: urut kecamatan > kelurahan > RW > RT, bisa dipersempit. */
async function dataEksporSpjWilayah(req) {
  const pilihan = pilihanSpj(req);
  const baris = urutSpj(saringSpj(await muatBarisSpj(), pilihan), true);
  const { kecamatan, kelurahan, rw, rt } = pilihan;
  const bagian = [kecamatan?.nama, kelurahan?.nama, rw && `RW ${rw}`, rt && `RT ${rt}`].filter(Boolean);
  return {
    nama: ["spj-per-wilayah", ...bagian.map((s) => namaBerkas(s))].join("-"),
    sheet: bagian.length ? `SPJ ${bagian.slice(-3).join(" ")}` : "SPJ per wilayah",
    tabel: tabelSpj(baris, { timezone: config.timezone }),
  };
}

/**
 * GET /api/ekspor/spj/ringkas?kecamatan=&kelurahan=&rw=&rt=
 *   -> { kertasKerja, tanpaWilayah, dariPeta, tanpaData, rw: [{ nilai, jumlah }], rt: [...], tanpaRtRw }
 * Untuk layar ekspor: berapa baris yang ikut, pilihan RW / RT yang ada datanya,
 * dan berapa kertas kerja yang tidak masuk laporan karena belum berisi data.
 */
router.get(
  "/spj/ringkas",
  requireAdmin,
  wrap(async (req, res) => {
    const pilihan = pilihanSpj(req);
    const [baris, semuaKk] = await Promise.all([muatBarisSpj(), prisma.kertasKerja.count()]);
    res.json({ ...ringkasSpj(baris, pilihan), tanpaData: semuaKk - baris.length });
  })
);

/** GET /api/ekspor/spj[/xlsx] */
rutekanEkspor(router, "/spj", requireAdmin, dataEksporSpj, JENIS_SPJ);

/** GET /api/ekspor/spj/formulir[/xlsx] */
rutekanEkspor(router, "/spj/formulir", requireAdmin, dataEksporSpjFormulir, JENIS_SPJ);

/** GET /api/ekspor/spj/wilayah[/xlsx]?kecamatan=&kelurahan=&rw=&rt= */
rutekanEkspor(router, "/spj/wilayah", requireAdmin, dataEksporSpjWilayah, JENIS_SPJ);

module.exports = router;

// Diekspor untuk diuji terpisah: murni, tanpa database.
module.exports.bacaIdPetugas = bacaIdPetugas;
module.exports.namaPetugas = namaPetugas;
// Untuk scripts/uji-perkiraan-rtrw.js.
module.exports.muatSpj = muatSpj;

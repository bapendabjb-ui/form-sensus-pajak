"use strict";

const express = require("express");
const prisma = require("../prisma");
const config = require("../config");
const { wrap, badRequest, notFound, parseId, ApiError } = require("../http");
const { ambilNomorBerikutnya, previewNomorBerikutnya } = require("../nomor");
const { siapkanJawaban, tulisJawaban, muatEntri } = require("../entri");
const { hapusBerkas } = require("../foto");
const { includePertanyaan, bentukFormulir, bentukTim, petaJawaban } = require("../bentuk");
const { csvNilai, buildCsv, formatWaktuID } = require("../format");

const router = express.Router();

const PETUGAS_MAKS = 8;

const includeTim = { petugas: { include: { petugas: true } } };

/* ---------- validasi ---------- */

/** Baca & periksa daftar petugasIds (1..8, unik, semuanya terdaftar). */
async function bacaTim(body) {
  const mentah = Array.isArray(body?.petugasIds) ? body.petugasIds : [];
  const ids = [...new Set(mentah.map(Number).filter((n) => Number.isInteger(n) && n > 0))];

  if (ids.length === 0) throw badRequest("Pilih minimal satu petugas.");
  if (ids.length > PETUGAS_MAKS) {
    throw badRequest(`Maksimal ${PETUGAS_MAKS} petugas dalam satu kertas kerja.`);
  }

  const terdaftar = await prisma.petugas.count({ where: { id: { in: ids } } });
  if (terdaftar !== ids.length) throw badRequest("Ada petugas yang tidak ditemukan.");
  return ids;
}

/* ---------- pemuatan ---------- */

/** Kertas kerja + tim + seluruh entri beserta definisi formulir yang dipakai. */
async function muatDetail(id) {
  const kk = await prisma.kertasKerja.findUnique({
    where: { id },
    include: {
      ...includeTim,
      entri: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { jawaban: true } },
    },
  });
  if (!kk) throw notFound("Kertas kerja tidak ditemukan.");

  const formIds = [...new Set(kk.entri.map((e) => e.formulirId))];
  const formulir = formIds.length
    ? await prisma.formulir.findMany({
        where: { id: { in: formIds } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: includePertanyaan,
      })
    : [];

  return { kk, formulir };
}

function bentukDetail({ kk, formulir }) {
  return {
    id: kk.id,
    nomor: kk.nomor,
    status: kk.status,
    createdAt: kk.createdAt,
    petugas: bentukTim(kk.petugas),
    formulir: formulir.map(bentukFormulir),
    entri: kk.entri.map((e) => ({
      id: e.id,
      formulirId: e.formulirId,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      jawaban: petaJawaban(e.jawaban),
    })),
  };
}

const bentukRingkas = (k) => ({
  id: k.id,
  nomor: k.nomor,
  status: k.status,
  createdAt: k.createdAt,
  petugas: bentukTim(k.petugas),
  jumlahData: k._count.entri,
});

/* ---------- daftar & penomoran ---------- */

/** GET /api/kertas-kerja -> daftar kertas kerja. */
router.get(
  "/",
  wrap(async (_req, res) => {
    const list = await prisma.kertasKerja.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { ...includeTim, _count: { select: { entri: true } } },
    });
    res.json(list.map(bentukRingkas));
  })
);

/**
 * GET /api/kertas-kerja/nomor-berikutnya
 * Pratinjau saja. Nomor final digenerate saat POST di dalam transaksi.
 */
router.get(
  "/nomor-berikutnya",
  wrap(async (_req, res) => {
    res.json({ nomor: await previewNomorBerikutnya(), petugasMaks: PETUGAS_MAKS });
  })
);

/** POST /api/kertas-kerja  { petugasIds: [] } -> buat kertas kerja bernomor otomatis. */
router.post(
  "/",
  wrap(async (req, res) => {
    const ids = await bacaTim(req.body);

    const dibuat = await prisma.$transaction(async (tx) => {
      const nomor = await ambilNomorBerikutnya(tx);
      return tx.kertasKerja.create({
        data: {
          nomor,
          status: "draft",
          petugas: { create: ids.map((petugasId, urutan) => ({ petugasId, urutan })) },
        },
      });
    });

    res.status(201).json(bentukDetail(await muatDetail(dibuat.id)));
  })
);

/* ---------- detail & pengelolaan ---------- */

/** GET /api/kertas-kerja/:id -> tim petugas + seluruh entri + definisi formulirnya. */
router.get(
  "/:id",
  wrap(async (req, res) => {
    res.json(bentukDetail(await muatDetail(parseId(req.params.id))));
  })
);

/** PUT /api/kertas-kerja/:id/petugas  { petugasIds: [] } -> ganti tim petugas. */
router.put(
  "/:id/petugas",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const ada = await prisma.kertasKerja.findUnique({ where: { id } });
    if (!ada) throw notFound("Kertas kerja tidak ditemukan.");

    const ids = await bacaTim(req.body);
    await prisma.$transaction(async (tx) => {
      await tx.kertasKerjaPetugas.deleteMany({ where: { kertasKerjaId: id } });
      await tx.kertasKerjaPetugas.createMany({
        data: ids.map((petugasId, urutan) => ({ kertasKerjaId: id, petugasId, urutan })),
      });
    });

    res.json(bentukDetail(await muatDetail(id)));
  })
);

/** PUT /api/kertas-kerja/:id/status  { status: "draft" | "selesai" } */
router.put(
  "/:id/status",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const status = String(req.body?.status || "");
    if (status !== "draft" && status !== "selesai") {
      throw badRequest('Status harus "draft" atau "selesai".');
    }

    const ada = await prisma.kertasKerja.findUnique({
      where: { id },
      include: { _count: { select: { entri: true } } },
    });
    if (!ada) throw notFound("Kertas kerja tidak ditemukan.");
    if (status === "selesai" && ada._count.entri === 0) {
      throw new ApiError(422, "Tambahkan minimal satu data sebelum menandai selesai.");
    }

    await prisma.kertasKerja.update({ where: { id }, data: { status } });
    res.json(bentukDetail(await muatDetail(id)));
  })
);

/**
 * POST /api/kertas-kerja/:id/entri  { formulirId, jawaban: { [pertanyaanId]: nilai } }
 * Tambah satu data lewat formulir. Kolom wajib divalidasi -> 422 { errors }.
 */
router.post(
  "/:id/entri",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const kk = await prisma.kertasKerja.findUnique({ where: { id } });
    if (!kk) throw notFound("Kertas kerja tidak ditemukan.");

    const formulirId = Number(req.body?.formulirId);
    if (!Number.isInteger(formulirId) || formulirId <= 0) throw badRequest("Formulir wajib dipilih.");

    const formulir = await prisma.formulir.findUnique({
      where: { id: formulirId },
      include: includePertanyaan,
    });
    if (!formulir) throw badRequest("Formulir tidak ditemukan.");
    if (formulir.pertanyaan.length === 0) throw badRequest("Formulir ini belum punya pertanyaan.");

    const siap = await siapkanJawaban(formulir, req.body?.jawaban, null);
    if (Object.keys(siap.errors).length) {
      throw new ApiError(422, "Periksa kembali isian yang ditandai merah.", { errors: siap.errors });
    }

    let dilepas = [];
    const entri = await prisma.$transaction(async (tx) => {
      const e = await tx.entri.create({ data: { kertasKerjaId: id, formulirId } });
      dilepas = await tulisJawaban(tx, e.id, siap);
      return e;
    });
    await hapusBerkas(dilepas);

    res.status(201).json(await muatEntri(entri.id));
  })
);

/** DELETE /api/kertas-kerja/:id -> hapus beserta seluruh entri & fotonya. */
router.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const ada = await prisma.kertasKerja.findUnique({ where: { id } });
    if (!ada) throw notFound("Kertas kerja tidak ditemukan.");

    const berkas = await prisma.foto.findMany({
      where: { entri: { kertasKerjaId: id } },
      select: { berkas: true },
    });
    await prisma.kertasKerja.delete({ where: { id } });
    await hapusBerkas(berkas.map((f) => f.berkas));

    res.status(204).end();
  })
);

/* ---------- ekspor ---------- */

/**
 * GET /api/kertas-kerja/:id/export -> CSV (BOM UTF-8).
 * Satu baris per data. Kolom pertanyaan dikelompokkan per formulir; sel milik
 * formulir lain dibiarkan kosong.
 */
router.get(
  "/:id/export",
  wrap(async (req, res) => {
    const { kk, formulir } = await muatDetail(parseId(req.params.id));
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const tim = bentukTim(kk.petugas);
    const namaTim = tim.map((p) => p.nama).join("; ");
    const nipTim = tim.map((p) => p.nip || "-").join("; ");
    const status = kk.status === "selesai" ? "Selesai" : "Draft";

    const kolom = formulir.flatMap((f) => f.pertanyaan.map((q) => ({ f, q })));
    const header = [
      "Nomor",
      "Status",
      "Petugas",
      "NIP",
      "Formulir",
      "No. data",
      "Waktu input",
      ...kolom.map(({ f, q }) => `${f.judul} - ${q.label || "(tanpa judul)"}`),
    ];

    const urutForm = new Map(formulir.map((f, i) => [f.id, i]));
    const entri = kk.entri
      .slice()
      .sort(
        (a, b) =>
          urutForm.get(a.formulirId) - urutForm.get(b.formulirId) ||
          a.createdAt - b.createdAt ||
          a.id - b.id
      );

    const nomorPerForm = new Map();
    const baris = entri.map((e) => {
      const ke = (nomorPerForm.get(e.formulirId) || 0) + 1;
      nomorPerForm.set(e.formulirId, ke);
      const jawaban = petaJawaban(e.jawaban);
      const f = formulir[urutForm.get(e.formulirId)];
      return [
        kk.nomor,
        status,
        namaTim,
        nipTim,
        f.judul,
        ke,
        formatWaktuID(e.createdAt, config.timezone),
        ...kolom.map(({ f: kf, q }) =>
          kf.id === e.formulirId ? csvNilai(q.tipe, jawaban[q.id], { baseUrl }) : ""
        ),
      ];
    });

    if (baris.length === 0) baris.push([kk.nomor, status, namaTim, nipTim, "", "", ""]);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="kertas-kerja-${kk.nomor}.csv"`);
    res.send(buildCsv([header, ...baris]));
  })
);

module.exports = router;
module.exports.PETUGAS_MAKS = PETUGAS_MAKS;

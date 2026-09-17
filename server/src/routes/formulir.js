"use strict";

const express = require("express");
const prisma = require("../prisma");
const config = require("../config");
const { requireAdmin } = require("../auth");
const { wrap, badRequest, notFound, conflict, parseId } = require("../http");
const { TIPE, BERTIPE_OPSI } = require("../answers");
const { sumberEpbbSah } = require("../epbb");
const { includePertanyaan, bentukFormulir } = require("../bentuk");
const { hapusBerkas, sapuFotoYatim } = require("../foto");
const { susunEkspor, namaBerkas, kirimCsv, kirimXlsx } = require("../ekspor");

const router = express.Router();

/**
 * Urutan tampil bank formulir: kolom `urutan` yang disusun admin, lalu id
 * sebagai pemutus supaya formulir yang urutannya kembar tetap stabil.
 */
const URUT_FORMULIR = [{ urutan: "asc" }, { id: "asc" }];

/** Nomor urut untuk formulir baru: selalu di ujung daftar. */
async function urutanBerikutnya(db) {
  const terakhir = await db.formulir.aggregate({ _max: { urutan: true } });
  return (terakhir._max.urutan ?? 0) + 1;
}

/* ---------- validasi payload ---------- */

/** Posisi pertanyaan di halaman isi data. "" = lebar penuh. */
const KOLOM = ["", "kiri", "kanan"];

/** Validasi & normalisasi body {judul, deskripsi, pertanyaan[]} dari editor admin. */
function bacaPayload(body) {
  const judul = String(body?.judul ?? "").trim();
  if (!judul) throw badRequest("Judul formulir wajib diisi.");
  if (judul.length > 200) throw badRequest("Judul formulir maksimal 200 karakter.");

  const deskripsi = String(body?.deskripsi ?? "").trim();

  // Nama ikon dipilih dari daftar di klien; server hanya memastikan bentuknya aman.
  const ikonMasuk = String(body?.ikon ?? "").trim();
  const ikon = /^[a-z0-9-]{1,40}$/.test(ikonMasuk) ? ikonMasuk : "";

  const judulKolom = (v) => String(v ?? "").trim().slice(0, 100);
  const judulKolomKiri = judulKolom(body?.judulKolomKiri);
  const judulKolomKanan = judulKolom(body?.judulKolomKanan);

  const masuk = Array.isArray(body?.pertanyaan) ? body.pertanyaan : [];
  const pertanyaan = masuk.map((q, i) => {
    const tipe = String(q?.tipe || "");
    if (!TIPE.includes(tipe)) throw badRequest(`Tipe pertanyaan "${tipe}" tidak dikenal.`);

    const label = String(q?.label ?? "").trim();
    if (label.length > 300) throw badRequest("Label pertanyaan maksimal 300 karakter.");

    const keterangan = String(q?.keterangan ?? "").trim();
    if (keterangan.length > 500) throw badRequest("Keterangan pertanyaan maksimal 500 karakter.");

    let opsi = [];
    if (BERTIPE_OPSI.includes(tipe)) {
      opsi = (Array.isArray(q?.opsi) ? q.opsi : [])
        .map((o) => String(o ?? "").trim())
        .filter((o) => o !== "")
        .slice(0, 100);
      if (opsi.length === 0) {
        throw badRequest(
          `Pertanyaan "${label || "(tanpa judul)"}" bertipe ${tipe} harus punya minimal satu opsi.`
        );
      }
    }

    const id = Number(q?.id);

    return {
      id: Number.isInteger(id) && id > 0 ? id : null,
      tipe,
      label,
      keterangan,
      wajib: Boolean(q?.wajib),
      rangeHarga: tipe === "linetariff" ? Boolean(q?.rangeHarga) : false,
      isiEpbb: sumberEpbbSah(tipe, q?.isiEpbb) ? String(q.isiEpbb) : "",
      kolom: KOLOM.includes(q?.kolom) ? q.kolom : "",
      urutan: i,
      opsi,
    };
  });

  return { judul, deskripsi, ikon, judulKolomKiri, judulKolomKanan, pertanyaan };
}

/**
 * Tulis daftar pertanyaan ke sebuah formulir.
 * Pertanyaan lama yang id-nya dikirim ulang akan DI-UPDATE (bukan dihapus lalu
 * dibuat baru) supaya jawaban yang sudah tersimpan tidak hilang.
 * @returns {Promise<number>} jumlah pertanyaan yang dihapus
 */
async function tulisPertanyaan(tx, formulirId, pertanyaan) {
  const lama = await tx.pertanyaan.findMany({ where: { formulirId }, select: { id: true } });
  const idLama = new Set(lama.map((q) => q.id));
  const idDipakai = new Set();

  for (const q of pertanyaan) {
    const pakaiId = q.id && idLama.has(q.id) ? q.id : null;

    if (pakaiId) {
      await tx.pertanyaan.update({
        where: { id: pakaiId },
        data: {
          tipe: q.tipe,
          label: q.label,
          keterangan: q.keterangan,
          wajib: q.wajib,
          rangeHarga: q.rangeHarga,
          isiEpbb: q.isiEpbb,
          kolom: q.kolom,
          urutan: q.urutan,
        },
      });
      await tx.pertanyaanOpsi.deleteMany({ where: { pertanyaanId: pakaiId } });
      if (q.opsi.length) {
        await tx.pertanyaanOpsi.createMany({
          data: q.opsi.map((nilai, i) => ({ pertanyaanId: pakaiId, nilai, urutan: i })),
        });
      }
      idDipakai.add(pakaiId);
    } else {
      const baru = await tx.pertanyaan.create({
        data: {
          formulirId,
          tipe: q.tipe,
          label: q.label,
          keterangan: q.keterangan,
          wajib: q.wajib,
          rangeHarga: q.rangeHarga,
          isiEpbb: q.isiEpbb,
          kolom: q.kolom,
          urutan: q.urutan,
          opsi: { create: q.opsi.map((nilai, i) => ({ nilai, urutan: i })) },
        },
      });
      idDipakai.add(baru.id);
    }
  }

  // Pertanyaan yang tidak ada lagi di payload: hapus (opsi, jawaban & foto ikut cascade).
  const dihapus = [...idLama].filter((id) => !idDipakai.has(id));
  if (dihapus.length) {
    await tx.pertanyaan.deleteMany({ where: { id: { in: dihapus } } });
  }
  return dihapus.length;
}

/* ---------- route publik (dibaca semua pengguna) ---------- */

/** GET /api/formulir -> daftar ringkas bank formulir. */
router.get(
  "/",
  wrap(async (_req, res) => {
    const list = await prisma.formulir.findMany({
      orderBy: URUT_FORMULIR,
      include: { _count: { select: { pertanyaan: true, entri: true } } },
    });
    res.json(
      list.map((f) => ({
        id: f.id,
        judul: f.judul,
        deskripsi: f.deskripsi || "",
        ikon: f.ikon || "",
        urutan: f.urutan,
        createdAt: f.createdAt,
        jumlahPertanyaan: f._count.pertanyaan,
        jumlahData: f._count.entri,
      }))
    );
  })
);

/** GET /api/formulir/:id -> formulir lengkap dengan pertanyaan & opsi. */
router.get(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const f = await prisma.formulir.findUnique({ where: { id }, include: includePertanyaan });
    if (!f) throw notFound("Formulir tidak ditemukan.");
    res.json(bentukFormulir(f));
  })
);

/**
 * Seluruh data satu formulir dari semua kertas kerja, urut nomor kertas kerja
 * lalu waktu input. Kolom nomor, status, dan tim mengikuti kertas kerja tiap baris.
 */
async function dataEksporFormulir(req) {
  const id = parseId(req.params.id);
  const f = await prisma.formulir.findUnique({ where: { id }, include: includePertanyaan });
  if (!f) throw notFound("Formulir tidak ditemukan.");

  const entri = await prisma.entri.findMany({
    where: { formulirId: id },
    include: { jawaban: true, kertasKerja: { include: { petugas: { include: { petugas: true } } } } },
  });
  const data = entri
    .map((e) => ({ kk: e.kertasKerja, e }))
    .sort((a, b) => a.kk.nomor.localeCompare(b.kk.nomor) || a.e.createdAt - b.e.createdAt || a.e.id - b.e.id);

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return {
    nama: `formulir-${namaBerkas(f.judul, "formulir")}`,
    sheet: f.judul,
    tabel: susunEkspor(data, [f], { baseUrl, timezone: config.timezone }),
  };
}

/** GET /api/formulir/:id/export -> CSV seluruh data formulir ini dari semua kertas kerja. */
router.get(
  "/:id/export",
  wrap(async (req, res) => kirimCsv(res, await dataEksporFormulir(req)))
);

/** GET /api/formulir/:id/export/xlsx -> Excel, isi sama dengan CSV. */
router.get(
  "/:id/export/xlsx",
  wrap(async (req, res) => kirimXlsx(res, await dataEksporFormulir(req)))
);

/* ---------- route admin (penyusunan formulir) ---------- */

/** POST /api/formulir -> buat formulir beserta pertanyaan & opsinya sekaligus. */
router.post(
  "/",
  requireAdmin,
  wrap(async (req, res) => {
    const { judul, deskripsi, ikon, judulKolomKiri, judulKolomKanan, pertanyaan } = bacaPayload(req.body);

    const hasil = await prisma.$transaction(async (tx) => {
      const f = await tx.formulir.create({
        data: { judul, deskripsi, ikon, judulKolomKiri, judulKolomKanan, urutan: await urutanBerikutnya(tx) },
      });
      await tulisPertanyaan(tx, f.id, pertanyaan);
      return tx.formulir.findUnique({ where: { id: f.id }, include: includePertanyaan });
    });

    res.status(201).json(bentukFormulir(hasil));
  })
);

/**
 * PUT /api/formulir/urutan  { ids: [3, 1, 2] }
 * Susun ulang bank formulir. Id yang tidak disebut tetap ada, ditaruh di
 * belakang mengikuti urutan lamanya.
 *
 * Didaftarkan sebelum PUT /:id agar "urutan" tidak terbaca sebagai id.
 */
router.put(
  "/urutan",
  requireAdmin,
  wrap(async (req, res) => {
    const masuk = Array.isArray(req.body?.ids) ? req.body.ids : null;
    if (!masuk) throw badRequest("Daftar urutan formulir wajib dikirim.");

    const diminta = [];
    const dilihat = new Set();
    for (const raw of masuk) {
      const id = Number(raw);
      if (!Number.isInteger(id) || id <= 0) throw badRequest("Id formulir tidak sah.");
      if (dilihat.has(id)) throw badRequest("Ada id formulir yang dikirim dua kali.");
      dilihat.add(id);
      diminta.push(id);
    }

    const semua = await prisma.formulir.findMany({ orderBy: URUT_FORMULIR, select: { id: true } });
    const adaId = new Set(semua.map((f) => f.id));
    const hilang = diminta.find((id) => !adaId.has(id));
    if (hilang) throw badRequest(`Formulir ${hilang} tidak ditemukan.`);

    // Formulir yang tidak ikut dikirim (mis. baru dibuat di sesi lain) menyusul di belakang.
    const susunan = [...diminta, ...semua.map((f) => f.id).filter((id) => !dilihat.has(id))];

    await prisma.$transaction(
      susunan.map((id, i) => prisma.formulir.update({ where: { id }, data: { urutan: i + 1 } }))
    );

    res.json({ ids: susunan });
  })
);

/** PUT /api/formulir/:id -> simpan formulir beserta pertanyaan & opsinya sekaligus. */
router.put(
  "/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const { judul, deskripsi, ikon, judulKolomKiri, judulKolomKanan, pertanyaan } = bacaPayload(req.body);

    const ada = await prisma.formulir.findUnique({ where: { id } });
    if (!ada) throw notFound("Formulir tidak ditemukan.");

    let dihapus = 0;
    const hasil = await prisma.$transaction(async (tx) => {
      await tx.formulir.update({ where: { id }, data: { judul, deskripsi, ikon, judulKolomKiri, judulKolomKanan } });
      dihapus = await tulisPertanyaan(tx, id, pertanyaan);
      return tx.formulir.findUnique({ where: { id }, include: includePertanyaan });
    });

    // Pertanyaan foto yang terhapus meninggalkan berkas di disk; sapu di latar.
    if (dihapus) sapuFotoYatim().catch(() => {});

    res.json(bentukFormulir(hasil));
  })
);

/**
 * DELETE /api/formulir/:id
 * Ditolak (409) bila formulir sudah diisi di kertas kerja, kecuali ?force=true.
 */
router.delete(
  "/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const ada = await prisma.formulir.findUnique({ where: { id } });
    if (!ada) throw notFound("Formulir tidak ditemukan.");

    const terpakai = await prisma.entri.count({ where: { formulirId: id } });
    const paksa = String(req.query.force || "").toLowerCase() === "true";
    if (terpakai > 0 && !paksa) {
      throw conflict(
        `Formulir sudah diisi sebanyak ${terpakai} data. Menghapusnya juga menghapus data tersebut.`,
        { terpakai }
      );
    }

    const berkas = await prisma.foto.findMany({
      where: { entri: { formulirId: id } },
      select: { berkas: true },
    });
    await prisma.formulir.delete({ where: { id } });
    await hapusBerkas(berkas.map((f) => f.berkas));

    res.status(204).end();
  })
);

module.exports = router;

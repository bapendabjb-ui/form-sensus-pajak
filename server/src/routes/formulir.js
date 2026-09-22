"use strict";

const express = require("express");
const prisma = require("../prisma");
const config = require("../config");
const { requireAdmin } = require("../auth");
const { wrap, badRequest, notFound, conflict, parseId } = require("../http");
const { includePertanyaan, bentukFormulir } = require("../bentuk");
const { hapusBerkas, sapuFotoYatim } = require("../foto");
const { susunEkspor, baseUrlEkspor, namaBerkas, kirimCsv, kirimXlsx } = require("../ekspor");
const { bacaPayload, susunBerkasBank, bacaBerkasBank } = require("../bankFormulir");

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

/* ---------- impor & ekspor bank formulir (khusus admin) ---------- */

/**
 * GET /api/formulir/ekspor-bank -> berkas JSON seluruh bank formulir (susunan
 * saja, tanpa data isian). Didaftarkan sebelum GET /:id agar "ekspor-bank"
 * tidak terbaca sebagai id.
 */
router.get(
  "/ekspor-bank",
  requireAdmin,
  wrap(async (_req, res) => {
    const list = await prisma.formulir.findMany({ orderBy: URUT_FORMULIR, include: includePertanyaan });
    const berkas = susunBerkasBank(list.map(bentukFormulir));
    const tanggal = berkas.diekspor.slice(0, 10);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="bank-formulir-${tanggal}.json"`);
    res.send(JSON.stringify(berkas, null, 2));
  })
);

/**
 * POST /api/formulir/impor  (body = isi berkas hasil ekspor-bank)
 * Tambahkan formulir dari berkas ke ujung bank formulir. Formulir yang
 * judulnya sudah ada dilewati, yang tidak sah ditolak; sisanya ditambahkan
 * dalam satu transaksi. Formulir yang sudah ada tidak pernah diubah.
 * -> { dibaca, ditambahkan, dilewati[], ditolak[] }
 */
router.post(
  "/impor",
  requireAdmin,
  wrap(async (req, res) => {
    const ada = await prisma.formulir.findMany({ select: { judul: true } });
    const hasil = bacaBerkasBank(req.body, ada.map((f) => f.judul));
    if (hasil.galat) throw badRequest(hasil.galat);

    if (hasil.tambah.length) {
      await prisma.$transaction(async (tx) => {
        let urutan = await urutanBerikutnya(tx);
        for (const f of hasil.tambah) {
          const { pertanyaan, ...data } = f;
          const baru = await tx.formulir.create({ data: { ...data, urutan: urutan++ } });
          await tulisPertanyaan(tx, baru.id, pertanyaan);
        }
        // Satu query per pertanyaan; bank formulir penuh bisa melewati batas bawaan 5 detik.
      }, { timeout: 60000 });
    }

    res.json({
      dibaca: hasil.dibaca,
      ditambahkan: hasil.tambah.length,
      dilewati: hasil.dilewati,
      ditolak: hasil.ditolak,
    });
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

  const baseUrl = baseUrlEkspor(req);
  return {
    nama: `formulir-${namaBerkas(f.judul, "formulir")}`,
    sheet: f.judul,
    tabel: susunEkspor(data, [f], { baseUrl, timezone: config.timezone }),
  };
}

/** GET /api/formulir/:id/export -> CSV seluruh data formulir ini dari semua kertas kerja. Khusus admin. */
router.get(
  "/:id/export",
  requireAdmin,
  wrap(async (req, res) => kirimCsv(res, await dataEksporFormulir(req)))
);

/** GET /api/formulir/:id/export/xlsx -> Excel, isi sama dengan CSV. Khusus admin. */
router.get(
  "/:id/export/xlsx",
  requireAdmin,
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

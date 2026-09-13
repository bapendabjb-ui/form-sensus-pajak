"use strict";

const express = require("express");
const prisma = require("../prisma");
const { requireAdmin } = require("../auth");
const { wrap, badRequest, notFound, conflict, parseId } = require("../http");
const { TIPE, BERTIPE_OPSI } = require("../answers");
const { includePertanyaan, bentukFormulir } = require("../bentuk");
const { hapusBerkas, sapuFotoYatim } = require("../foto");

const router = express.Router();

/* ---------- validasi payload ---------- */

/** Validasi & normalisasi body {judul, deskripsi, pertanyaan[]} dari editor admin. */
function bacaPayload(body) {
  const judul = String(body?.judul ?? "").trim();
  if (!judul) throw badRequest("Judul formulir wajib diisi.");
  if (judul.length > 200) throw badRequest("Judul formulir maksimal 200 karakter.");

  const deskripsi = String(body?.deskripsi ?? "").trim();

  const masuk = Array.isArray(body?.pertanyaan) ? body.pertanyaan : [];
  const pertanyaan = masuk.map((q, i) => {
    const tipe = String(q?.tipe || "");
    if (!TIPE.includes(tipe)) throw badRequest(`Tipe pertanyaan "${tipe}" tidak dikenal.`);

    const label = String(q?.label ?? "").trim();
    if (label.length > 300) throw badRequest("Label pertanyaan maksimal 300 karakter.");

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
      wajib: Boolean(q?.wajib),
      rangeHarga: tipe === "linetariff" ? Boolean(q?.rangeHarga) : false,
      urutan: i,
      opsi,
    };
  });

  return { judul, deskripsi, pertanyaan };
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
          wajib: q.wajib,
          rangeHarga: q.rangeHarga,
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
          wajib: q.wajib,
          rangeHarga: q.rangeHarga,
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
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { _count: { select: { pertanyaan: true, entri: true } } },
    });
    res.json(
      list.map((f) => ({
        id: f.id,
        judul: f.judul,
        deskripsi: f.deskripsi || "",
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

/* ---------- route admin (penyusunan formulir) ---------- */

/** POST /api/formulir -> buat formulir beserta pertanyaan & opsinya sekaligus. */
router.post(
  "/",
  requireAdmin,
  wrap(async (req, res) => {
    const { judul, deskripsi, pertanyaan } = bacaPayload(req.body);

    const hasil = await prisma.$transaction(async (tx) => {
      const f = await tx.formulir.create({ data: { judul, deskripsi } });
      await tulisPertanyaan(tx, f.id, pertanyaan);
      return tx.formulir.findUnique({ where: { id: f.id }, include: includePertanyaan });
    });

    res.status(201).json(bentukFormulir(hasil));
  })
);

/** PUT /api/formulir/:id -> simpan formulir beserta pertanyaan & opsinya sekaligus. */
router.put(
  "/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const { judul, deskripsi, pertanyaan } = bacaPayload(req.body);

    const ada = await prisma.formulir.findUnique({ where: { id } });
    if (!ada) throw notFound("Formulir tidak ditemukan.");

    let dihapus = 0;
    const hasil = await prisma.$transaction(async (tx) => {
      await tx.formulir.update({ where: { id }, data: { judul, deskripsi } });
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

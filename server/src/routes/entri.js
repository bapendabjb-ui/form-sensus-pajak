"use strict";

const express = require("express");
const prisma = require("../prisma");
const { requireAdmin, bacaAdmin } = require("../auth");
const { wrap, notFound, parseId, ApiError } = require("../http");
const { siapkanJawaban, tulisJawaban, muatEntri, bacaBerkas } = require("../entri");
const { hapusBerkas } = require("../foto");
const { hapusEntri } = require("../hapus");
const { includePertanyaan, petaJawaban } = require("../bentuk");
const { adaTitik } = require("../cekLokasi");

/**
 * Koordinat objek yang sudah dicek admin terkunci: kiriman petugas untuk
 * pertanyaan Lokasi diganti nilai yang tersimpan, apa pun isinya. Admin boleh
 * menyesuaikan, dan tanda sudah dicek tetap.
 */
function kunciKoordinat(formulir, masuk, tersimpan) {
  const hasil = { ...(masuk && typeof masuk === "object" ? masuk : {}) };
  for (const q of formulir.pertanyaan) {
    if (q.tipe !== "lokasi") continue;
    if (tersimpan[q.id] === undefined) delete hasil[q.id];
    else hasil[q.id] = tersimpan[q.id];
  }
  return hasil;
}

const router = express.Router();

/** GET /api/entri/:id -> satu data lengkap dengan formulir & jawabannya. */
router.get(
  "/:id",
  wrap(async (req, res) => {
    res.json(await muatEntri(parseId(req.params.id)));
  })
);

/** PUT /api/entri/:id  { jawaban, dariEpbb?, berkasLengkap?, catatanBerkas? } -> ubah isian. Kolom wajib divalidasi -> 422. */
router.put(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const entri = await prisma.entri.findUnique({
      where: { id },
      include: { formulir: { include: includePertanyaan }, jawaban: true },
    });
    if (!entri) throw notFound("Data tidak ditemukan.");

    let jawaban = req.body?.jawaban;
    if (entri.koordinatDicekAt && !(await bacaAdmin(req))) {
      jawaban = kunciKoordinat(entri.formulir, jawaban, petaJawaban(entri.jawaban));
    }

    // Klien lama tanpa berkasLengkap: penanda yang tersimpan yang berlaku.
    const berkas = bacaBerkas(req.body);
    const siap = await siapkanJawaban(entri.formulir, jawaban, id, req.body?.dariEpbb, {
      berkasKurang: (berkas.berkasLengkap ?? entri.berkasLengkap) === false,
    });
    if (Object.keys(siap.errors).length) {
      throw new ApiError(422, "Periksa kembali isian yang ditandai merah.", { errors: siap.errors });
    }

    // Koordinat rekaman (GPS asli) sengaja tidak disentuh di sini, termasuk
    // bila masih kosong. Data yang tersimpan di lapangan sebelum GPS mengunci
    // lalu diperbaiki di kantor dulu terisi diam-diam dengan titik kantor.
    // GPS asli kini hanya terekam saat data dibuat; titik objek ditetapkan di
    // tingkat kertas kerja (PUT /api/kertas-kerja/:id/titik dan /rekam).
    let dilepas = [];
    await prisma.$transaction(async (tx) => {
      await tx.entri.update({
        where: { id },
        data: { updatedAt: new Date(), ...berkas },
      });
      dilepas = await tulisJawaban(tx, id, siap);
    });
    await hapusBerkas(dilepas);

    res.json(await muatEntri(id));
  })
);

/**
 * PUT /api/entri/:id/koordinat-dicek  { dicek: boolean } -> tandai koordinat objek
 * (jawaban pertanyaan Lokasi) sudah dicek. Khusus admin. Sudah dicek = terkunci untuk petugas.
 */
router.put(
  "/:id/koordinat-dicek",
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const entri = await prisma.entri.findUnique({
      where: { id },
      select: { id: true, jawaban: { where: { pertanyaan: { tipe: "lokasi" } }, select: { nilai: true } } },
    });
    if (!entri) throw notFound("Data tidak ditemukan.");

    const dicek = req.body?.dicek === true;
    if (dicek && !entri.jawaban.some((j) => adaTitik(j.nilai))) {
      throw new ApiError(422, "Data ini belum punya koordinat objek untuk dicek.");
    }
    await prisma.entri.update({
      where: { id },
      data: dicek
        ? { koordinatDicekAt: new Date(), koordinatDicekOleh: req.admin.username }
        : { koordinatDicekAt: null, koordinatDicekOleh: "" },
    });
    res.json(await muatEntri(id));
  })
);

/** DELETE /api/entri/:id -> hapus satu data beserta fotonya. Khusus admin. */
router.delete(
  "/:id",
  requireAdmin,
  wrap(async (req, res) => {
    await hapusEntri(parseId(req.params.id), req.admin);
    res.status(204).end();
  })
);

module.exports = router;
// Diekspor untuk diuji terpisah: murni dan menentukan apa yang boleh diubah petugas.
module.exports.kunciKoordinat = kunciKoordinat;

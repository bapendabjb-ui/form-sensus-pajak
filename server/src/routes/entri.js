"use strict";

const express = require("express");
const prisma = require("../prisma");
const { requireAdmin, adminOpsional, isAdmin } = require("../auth");
const { wrap, notFound, parseId, ApiError } = require("../http");
const { siapkanJawaban, tulisJawaban, muatEntri, bacaBerkas, bacaRekamKoordinat } = require("../entri");
const { hapusBerkas } = require("../foto");
const { includePertanyaan } = require("../bentuk");

const router = express.Router();

/** GET /api/entri/:id -> satu data lengkap dengan formulir & jawabannya. */
router.get(
  "/:id",
  adminOpsional,
  wrap(async (req, res) => {
    res.json(await muatEntri(parseId(req.params.id), { admin: isAdmin(req) }));
  })
);

/** PUT /api/entri/:id  { jawaban, dariEpbb?, berkasLengkap?, catatanBerkas? } -> ubah isian. Kolom wajib divalidasi -> 422. */
router.put(
  "/:id",
  adminOpsional,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const entri = await prisma.entri.findUnique({
      where: { id },
      include: { formulir: { include: includePertanyaan } },
    });
    if (!entri) throw notFound("Data tidak ditemukan.");

    const siap = await siapkanJawaban(entri.formulir, req.body?.jawaban, id, req.body?.dariEpbb);
    if (Object.keys(siap.errors).length) {
      throw new ApiError(422, "Periksa kembali isian yang ditandai merah.", { errors: siap.errors });
    }

    // Koordinat rekaman menandai tempat data ini DIDATA, jadi hanya diisi bila
    // masih kosong - menimpanya saat data diperbaiki di kantor akan memindahkan
    // titiknya dari lapangan ke meja kerja.
    const rekam = entri.rekamLat === null ? bacaRekamKoordinat(req.body) : {};

    let dilepas = [];
    await prisma.$transaction(async (tx) => {
      await tx.entri.update({
        where: { id },
        data: { updatedAt: new Date(), ...bacaBerkas(req.body), ...rekam },
      });
      dilepas = await tulisJawaban(tx, id, siap);
    });
    await hapusBerkas(dilepas);

    res.json(await muatEntri(id, { admin: isAdmin(req) }));
  })
);

/** DELETE /api/entri/:id -> hapus satu data beserta fotonya. Khusus admin. */
router.delete(
  "/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const ada = await prisma.entri.findUnique({ where: { id } });
    if (!ada) throw notFound("Data tidak ditemukan.");

    const berkas = await prisma.foto.findMany({ where: { entriId: id }, select: { berkas: true } });
    await prisma.entri.delete({ where: { id } });
    await hapusBerkas(berkas.map((f) => f.berkas));

    res.status(204).end();
  })
);

module.exports = router;

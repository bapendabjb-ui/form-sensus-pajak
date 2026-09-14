"use strict";

const express = require("express");
const prisma = require("../prisma");
const { requireAdmin } = require("../auth");
const { wrap, notFound, parseId, ApiError } = require("../http");
const { siapkanJawaban, tulisJawaban, muatEntri } = require("../entri");
const { hapusBerkas } = require("../foto");
const { includePertanyaan } = require("../bentuk");

const router = express.Router();

/** GET /api/entri/:id -> satu data lengkap dengan formulir & jawabannya. */
router.get(
  "/:id",
  wrap(async (req, res) => {
    res.json(await muatEntri(parseId(req.params.id)));
  })
);

/** PUT /api/entri/:id  { jawaban } -> ubah isian. Kolom wajib divalidasi -> 422. */
router.put(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const entri = await prisma.entri.findUnique({
      where: { id },
      include: { formulir: { include: includePertanyaan } },
    });
    if (!entri) throw notFound("Data tidak ditemukan.");

    const siap = await siapkanJawaban(entri.formulir, req.body?.jawaban, id);
    if (Object.keys(siap.errors).length) {
      throw new ApiError(422, "Periksa kembali isian yang ditandai merah.", { errors: siap.errors });
    }

    let dilepas = [];
    await prisma.$transaction(async (tx) => {
      await tx.entri.update({ where: { id }, data: { updatedAt: new Date() } });
      dilepas = await tulisJawaban(tx, id, siap);
    });
    await hapusBerkas(dilepas);

    res.json(await muatEntri(id));
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

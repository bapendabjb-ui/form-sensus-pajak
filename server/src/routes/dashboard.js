"use strict";

const express = require("express");
const prisma = require("../prisma");
const { wrap } = require("../http");
const { bentukTim } = require("../bentuk");

const router = express.Router();

/** GET /api/dashboard/stats -> angka ringkasan + kertas kerja terbaru. */
router.get(
  "/stats",
  wrap(async (_req, res) => {
    const [totalKertasKerja, selesai, totalFormulir, totalPetugas, totalData, totalFoto, terbaru] =
      await Promise.all([
        prisma.kertasKerja.count(),
        prisma.kertasKerja.count({ where: { status: "selesai" } }),
        prisma.formulir.count(),
        prisma.petugas.count(),
        prisma.entri.count(),
        prisma.foto.count({ where: { entriId: { not: null } } }),
        prisma.kertasKerja.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 5,
          include: {
            petugas: { include: { petugas: true } },
            _count: { select: { entri: true } },
          },
        }),
      ]);

    res.json({
      totalKertasKerja,
      selesai,
      draft: totalKertasKerja - selesai,
      totalFormulir,
      totalPetugas,
      totalData,
      totalFoto,
      terbaru: terbaru.map((k) => ({
        id: k.id,
        nomor: k.nomor,
        status: k.status,
        createdAt: k.createdAt,
        petugas: bentukTim(k.petugas),
        jumlahData: k._count.entri,
      })),
    });
  })
);

module.exports = router;

"use strict";

const express = require("express");
const prisma = require("../prisma");
const { wrap } = require("../http");
const { bentukTim } = require("../bentuk");
const { hitungTidakLengkap } = require("../entri");
const { peringkatPetugas } = require("../rekap");

const router = express.Router();

/** GET /api/dashboard/stats -> angka ringkasan + kertas kerja terbaru. */
router.get(
  "/stats",
  wrap(async (_req, res) => {
    const [totalKertasKerja, selesai, tidakLengkap, rekapPetugas, terbaru] =
      await Promise.all([
        prisma.kertasKerja.count(),
        prisma.kertasKerja.count({ where: { status: "selesai" } }),
        prisma.entri.count({ where: { berkasLengkap: false } }),
        peringkatPetugas(5),
        prisma.kertasKerja.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 5,
          include: {
            petugas: { include: { petugas: true } },
            _count: { select: { entri: true } },
          },
        }),
      ]);
    const tidakLengkapPerKk = await hitungTidakLengkap(terbaru.map((k) => k.id));

    res.json({
      totalKertasKerja,
      selesai,
      draft: totalKertasKerja - selesai,
      tidakLengkap,
      rekapPetugas,
      terbaru: terbaru.map((k) => ({
        id: k.id,
        nomor: k.nomor,
        status: k.status,
        createdAt: k.createdAt,
        petugas: bentukTim(k.petugas),
        jumlahData: k._count.entri,
        jumlahTidakLengkap: tidakLengkapPerKk.get(k.id) || 0,
      })),
    });
  })
);

module.exports = router;

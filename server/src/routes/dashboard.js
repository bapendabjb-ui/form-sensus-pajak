"use strict";

const express = require("express");
const prisma = require("../prisma");
const { wrap } = require("../http");
const { peringkatPetugas } = require("../rekap");

const router = express.Router();

/** GET /api/dashboard/stats -> angka ringkasan + 5 petugas dengan kertas kerja terbanyak. */
router.get(
  "/stats",
  wrap(async (_req, res) => {
    const [totalKertasKerja, selesai, tidakLengkap, rekapPetugas] = await Promise.all([
      prisma.kertasKerja.count(),
      prisma.kertasKerja.count({ where: { status: "selesai" } }),
      prisma.entri.count({ where: { berkasLengkap: false } }),
      peringkatPetugas(5),
    ]);

    res.json({
      totalKertasKerja,
      selesai,
      draft: totalKertasKerja - selesai,
      tidakLengkap,
      rekapPetugas,
    });
  })
);

module.exports = router;

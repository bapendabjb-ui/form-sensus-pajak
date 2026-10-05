"use strict";

const express = require("express");
const prisma = require("../prisma");
const { wrap } = require("../http");
const { peringkatPetugas } = require("../rekap");

const router = express.Router();

/**
 * GET /api/dashboard/stats -> angka ringkasan + 10 petugas dengan kertas kerja terbanyak.
 * `pengajuanHapus` = pengajuan hapus yang menunggu; hanya ditampilkan untuk admin.
 */
router.get(
  "/stats",
  wrap(async (_req, res) => {
    const [totalKertasKerja, selesai, tidakLengkap, pengajuanHapus, rekapPetugas] = await Promise.all([
      prisma.kertasKerja.count(),
      prisma.kertasKerja.count({ where: { status: "selesai" } }),
      prisma.entri.count({ where: { berkasLengkap: false } }),
      prisma.pengajuanHapus.count({ where: { status: "menunggu" } }),
      peringkatPetugas(10),
    ]);

    res.json({
      totalKertasKerja,
      selesai,
      draft: totalKertasKerja - selesai,
      tidakLengkap,
      pengajuanHapus,
      rekapPetugas,
    });
  })
);

module.exports = router;

"use strict";

const express = require("express");
const prisma = require("../prisma");
const { wrap } = require("../http");
const { peringkatPetugas } = require("../rekap");
const { realisasiKertasKerja } = require("../realisasi");

const router = express.Router();

/**
 * GET /api/dashboard/stats -> angka ringkasan, realisasi harian terhadap target,
 * + 10 petugas dengan kertas kerja terbanyak.
 * `pengajuanHapus` = pengajuan hapus yang menunggu; hanya ditampilkan untuk admin.
 * `integrasiNib` = ada formulir berpertanyaan Bidang Tanah BPN atau NOP dari peta: { data, peta } =
 *   data yang sudah mencatat bidang, dan NOP yang dicatat langsung pada bidang di Peta Sensus.
 */
router.get(
  "/stats",
  wrap(async (_req, res) => {
    const [totalKertasKerja, selesai, tidakLengkap, pengajuanHapus, rekapPetugas, realisasi, formNib, dataNib, nopPeta] = await Promise.all([
      prisma.kertasKerja.count(),
      prisma.kertasKerja.count({ where: { status: "selesai" } }),
      prisma.entri.count({ where: { berkasLengkap: false } }),
      prisma.pengajuanHapus.count({ where: { status: "menunggu" } }),
      peringkatPetugas(10),
      realisasiKertasKerja(),
      prisma.pertanyaan.count({ where: { tipe: "nib" } }),
      prisma.$queryRaw`SELECT COUNT(DISTINCT entri_id) AS n FROM entri_nib`.then((r) => Number(r[0]?.n || 0)),
      prisma.bidangNop.count(),
    ]);

    res.json({
      totalKertasKerja,
      selesai,
      draft: totalKertasKerja - selesai,
      tidakLengkap,
      pengajuanHapus,
      rekapPetugas,
      realisasi,
      integrasiNib: formNib > 0 || nopPeta > 0 ? { data: dataNib, peta: nopPeta } : null,
    });
  })
);

module.exports = router;

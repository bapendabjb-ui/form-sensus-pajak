"use strict";

const express = require("express");
const prisma = require("../prisma");
const { requireAdmin } = require("../auth");
const { wrap, badRequest, notFound, conflict, parseId } = require("../http");
const { includePertanyaan, petaJawaban } = require("../bentuk");
const { tutupPengajuan, hapusKertasKerja, hapusEntri } = require("../hapus");
const { bacaPengajuan, judulData, judulPengajuanData, bentukPengajuan } = require("../pengajuan");

const router = express.Router();

const includeTim = { petugas: { include: { petugas: true } } };

/** Riwayat hanya menampilkan keputusan terbaru; yang lebih tua tetap ada di database. */
const RIWAYAT_MAKS = 100;

/** Pengajuan yang masih menunggu keputusan, atau galat yang sesuai. */
async function muatMenunggu(id) {
  const p = await prisma.pengajuanHapus.findUnique({ where: { id } });
  if (!p) throw notFound("Pengajuan tidak ditemukan.");
  if (p.status !== "menunggu") throw conflict(`Pengajuan ini sudah ${p.status}.`);
  return p;
}

/**
 * Sasaran pengajuan beserta tim kertas kerjanya. Nomor dan judul ikut disalin
 * ke baris pengajuan supaya riwayatnya tetap terbaca setelah sasarannya terhapus.
 */
async function muatSasaran(jenis, id) {
  if (jenis === "kertas_kerja") {
    const kk = await prisma.kertasKerja.findUnique({ where: { id }, include: includeTim });
    if (!kk) throw notFound("Kertas kerja tidak ditemukan.");
    return { kertasKerjaId: kk.id, entriId: null, nomorKk: kk.nomor, judul: "", tim: kk.petugas };
  }

  const e = await prisma.entri.findUnique({
    where: { id },
    include: { jawaban: true, formulir: { include: includePertanyaan }, kertasKerja: { include: includeTim } },
  });
  if (!e) throw notFound("Data tidak ditemukan.");
  return {
    kertasKerjaId: e.kertasKerjaId,
    entriId: e.id,
    nomorKk: e.kertasKerja.nomor,
    judul: judulPengajuanData(judulData(e.formulir.pertanyaan, petaJawaban(e.jawaban)), e.formulir.judul),
    tim: e.kertasKerja.petugas,
  };
}

/**
 * GET /api/pengajuan-hapus?status=menunggu|riwayat -> { baris, menunggu }. Khusus admin.
 * Yang menunggu diurutkan dari yang terlama (antrean); riwayat dari keputusan terbaru.
 */
router.get(
  "/",
  requireAdmin,
  wrap(async (req, res) => {
    const riwayat = req.query.status === "riwayat";
    const [baris, menunggu] = await Promise.all([
      prisma.pengajuanHapus.findMany({
        where: riwayat ? { status: { in: ["disetujui", "ditolak"] } } : { status: "menunggu" },
        orderBy: riwayat ? [{ diputuskanAt: "desc" }, { id: "desc" }] : [{ createdAt: "asc" }, { id: "asc" }],
        take: riwayat ? RIWAYAT_MAKS : undefined,
      }),
      prisma.pengajuanHapus.count({ where: { status: "menunggu" } }),
    ]);
    res.json({ baris: baris.map(bentukPengajuan), menunggu });
  })
);

/**
 * POST /api/pengajuan-hapus  { jenis: "kertas_kerja" | "entri", sasaranId, petugasId, alasan }
 *
 * Terbuka seperti pekerjaan lapangan lainnya. Pengaju dipilih dari tim kertas
 * kerjanya - bukan bukti identitas (petugas tidak login), tetapi memberi admin
 * nama yang bisa ditanyai. Satu sasaran hanya boleh punya satu pengajuan menunggu.
 */
router.post(
  "/",
  wrap(async (req, res) => {
    const { jenis, sasaranId, petugasId, alasan } = bacaPengajuan(req.body);
    const sasaran = await muatSasaran(jenis, sasaranId);

    const pengaju = sasaran.tim.find((r) => r.petugasId === petugasId)?.petugas;
    if (!pengaju) throw badRequest("Pilih nama Anda dari tim petugas kertas kerja ini.");

    const tautan = jenis === "kertas_kerja" ? { kertasKerjaId: sasaran.kertasKerjaId } : { entriId: sasaran.entriId };
    const ada = await prisma.pengajuanHapus.findFirst({
      where: { jenis, ...tautan, status: "menunggu" },
      select: { id: true },
    });
    if (ada) throw conflict("Sudah ada pengajuan hapus yang menunggu persetujuan admin.");

    const p = await prisma.pengajuanHapus.create({
      data: {
        jenis,
        kertasKerjaId: sasaran.kertasKerjaId,
        entriId: sasaran.entriId,
        nomorKk: sasaran.nomorKk,
        judul: sasaran.judul,
        alasan,
        pengaju: pengaju.nama,
      },
    });
    res.status(201).json(bentukPengajuan(p));
  })
);

/** DELETE /api/pengajuan-hapus/:id -> batalkan pengajuan yang masih menunggu. Terbuka. */
router.delete(
  "/:id",
  wrap(async (req, res) => {
    const p = await muatMenunggu(parseId(req.params.id));
    await prisma.pengajuanHapus.delete({ where: { id: p.id } });
    res.status(204).end();
  })
);

/** POST /api/pengajuan-hapus/:id/setujui -> hapus sasarannya. Khusus admin. */
router.post(
  "/:id/setujui",
  requireAdmin,
  wrap(async (req, res) => {
    const p = await muatMenunggu(parseId(req.params.id));
    const sasaranId = p.jenis === "kertas_kerja" ? p.kertasKerjaId : p.entriId;

    // Penghapusan menutup pengajuan ini (dan pengajuan lain untuk sasaran yang
    // sama) sebagai "disetujui". Bila sasarannya sudah lenyap lewat jalan lain,
    // tinggal pengajuannya yang perlu ditutup.
    if (sasaranId === null) await tutupPengajuan({ id: p.id }, req.admin);
    else if (p.jenis === "kertas_kerja") await hapusKertasKerja(sasaranId, req.admin);
    else await hapusEntri(sasaranId, req.admin);

    res.json(bentukPengajuan(await prisma.pengajuanHapus.findUnique({ where: { id: p.id } })));
  })
);

/** POST /api/pengajuan-hapus/:id/tolak -> sasarannya tetap ada. Khusus admin. */
router.post(
  "/:id/tolak",
  requireAdmin,
  wrap(async (req, res) => {
    const p = await muatMenunggu(parseId(req.params.id));
    const hasil = await prisma.pengajuanHapus.update({
      where: { id: p.id },
      data: { status: "ditolak", diputuskanAt: new Date(), diputuskanOleh: req.admin.username },
    });
    res.json(bentukPengajuan(hasil));
  })
);

module.exports = router;

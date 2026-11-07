"use strict";

/**
 * Integrasi NIB BPN dengan NOP PBB (aturannya di src/integrasi.js).
 *
 * Laporan dan status bidang terbuka bagi siapa pun yang boleh membuka Peta
 * Sensus (bila wajib login: admin, petugas, pejabat) - isinya sama dengan yang
 * sudah tampil di daftar kertas kerja dan peta. Unduhan (Excel, GeoJSON) khusus
 * admin, seperti ekspor lainnya.
 *
 * NOP per bidang dari Peta Sensus (tab NOP di panel bidang): menambah butuh
 * login petugas atau admin (pejabat ditolak tolakTulisPejabat); menghapus hanya
 * admin atau petugas yang menambahkannya.
 */

const express = require("express");
const { requireAdmin, bacaPengguna } = require("../auth");
const { wrap, parseId, badRequest, unauthorized, forbidden, notFound, conflict } = require("../http");
const prisma = require("../prisma");
const { kunciBidang } = require("../answers");
const { pembatas } = require("../laju");
const { simpanSementara } = require("../simpanSementara");
const { kirimXlsx, baseUrlEkspor } = require("../ekspor");
const integrasi = require("../integrasi");

const router = express.Router();

const batasi = pembatas({
  jendelaMs: 10 * 60 * 1000,
  maks: 1200,
  pesan: "Terlalu banyak permintaan integrasi NIB. Tunggu beberapa menit.",
});

/** Laporan dan status peta disusun dari seluruh data: dipakai bersama sampai ada data yang berubah. */
const bacaLaporan = simpanSementara({ umurMs: 60 * 1000, susun: integrasi.susunLaporan });
const bacaStatusPeta = simpanSementara({ umurMs: 60 * 1000, susun: integrasi.statusBidangPeta });

/** Data per halaman di layar Integrasi NIB. */
const PER_HALAMAN = 50;

/**
 * GET /api/integrasi?pola=&cari=&mulai= ->
 *   { pola: { kunci: label }, ringkas, cakupan, data: { baris, total, mulai, lebih } }
 */
router.get(
  "/",
  batasi,
  wrap(async (req, res) => {
    const laporan = await bacaLaporan();
    const pola = integrasi.POLA[req.query.pola] ? req.query.pola : "";
    const cocok = integrasi.saringBaris(laporan.baris, { pola, cari: req.query.cari });
    const mulai = Math.max(0, Math.min(Number.parseInt(req.query.mulai, 10) || 0, cocok.length));
    res.setHeader("Cache-Control", "no-cache");
    res.json({
      pola: integrasi.POLA,
      ringkas: laporan.ringkas,
      cakupan: laporan.cakupan,
      data: {
        baris: cocok.slice(mulai, mulai + PER_HALAMAN),
        total: cocok.length,
        mulai,
        lebih: mulai + PER_HALAMAN < cocok.length,
      },
    });
  })
);

/**
 * GET /api/integrasi/bidang -> { cocok: [id], tinjau: [id], tanpa_nop: [id] }: status
 * bidang persil untuk mode warna "Status sensus" di Peta Sensus. Id ditulis
 * sebagai selisih berurutan (integrasi.selisihUrut).
 */
router.get(
  "/bidang",
  batasi,
  wrap(async (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.json(await bacaStatusPeta());
  })
);

/** Daftar kunci bidang dari query `kunci=a,b`. */
const bacaDaftarKunci = (q, maks = 40) =>
  String(q || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, maks);

/**
 * GET /api/integrasi/cek?kunci=<kode|nib>,...&kecuali=<id data> ->
 *   { [kunci]: [{ sumber: "sensus", entriId, kkId, nomor, nop, judul } | { sumber: "peta", nop, oleh }] }
 * Data lain dan NOP dari peta yang sudah tercatat di bidang yang sama -
 * peringatan di layar isi data.
 */
router.get(
  "/cek",
  batasi,
  wrap(async (req, res) => {
    const kunci = bacaDaftarKunci(req.query.kunci);
    const kecuali = req.query.kecuali ? parseId(req.query.kecuali) : null;
    const [sensus, peta] = await Promise.all([integrasi.sensusBidang(kunci, { kecuali }), integrasi.petaBidang(kunci)]);
    const hasil = {};
    for (const k of kunci) {
      const daftar = [
        ...(sensus[k] || []).map((d) => ({ sumber: "sensus", ...d })),
        ...(peta[k] || []).map((p) => ({ sumber: "peta", nop: p.nop, oleh: p.olehNama })),
      ];
      if (daftar.length) hasil[k] = daftar;
    }
    res.json(hasil);
  })
);

/* ---------- NOP per bidang dari Peta Sensus ---------- */

/** `kecuali` (query / body): id data yang sedang dibuka di formulir, atau null. */
const bacaKecuali = (v) => (v === undefined || v === null || v === "" ? null : parseId(v));

/**
 * GET /api/integrasi/nop-bidang?kunci=<kode|nib>&kecuali=<id data> -> isi tab NOP
 * (integrasi.nopBidang). Dipakai juga kotak bidang di formulir PBB.
 */
router.get(
  "/nop-bidang",
  batasi,
  wrap(async (req, res) => {
    const kunci = String(req.query.kunci || "");
    if (!integrasi.pisahKunci(kunci)) throw badRequest("Bidang tidak dikenal.");
    const pengguna = await bacaPengguna(req);
    const kecuali = bacaKecuali(req.query.kecuali);
    res.setHeader("Cache-Control", "no-cache");
    res.json((await integrasi.nopBidang([kunci], pengguna, { kecuali }))[kunci]);
  })
);

/**
 * POST /api/integrasi/nop-bidang { kunci, nop, keterangan, kecuali? } -> isi tab NOP terbaru.
 * Bidangnya harus ada di peta BPN yang aktif. Pasangan yang sudah ada: 409.
 */
router.post(
  "/nop-bidang",
  batasi,
  wrap(async (req, res) => {
    const pengguna = await bacaPengguna(req);
    if (!pengguna) throw unauthorized("Masuk sebagai petugas atau admin untuk menambah NOP.");
    if (pengguna.role !== "admin" && pengguna.role !== "petugas") throw forbidden("Hanya petugas dan admin yang boleh menambah NOP.");
    let isi;
    try {
      isi = integrasi.bacaKirimanNop(req.body || {});
    } catch (e) {
      throw badRequest(e.message);
    }
    const ada = await prisma.persil.findFirst({ where: { aktif: true, kodeWilayah: isi.kode, nib: isi.nib }, select: { id: true } });
    if (!ada) throw notFound("Bidang ini tidak ada di peta BPN yang aktif. Muat ulang peta lalu ketuk bidangnya lagi.");
    try {
      await prisma.bidangNop.create({
        data: {
          kodeWilayah: isi.kode,
          nib: isi.nib,
          nop: isi.nop,
          keterangan: isi.keterangan,
          olehPeran: pengguna.role,
          olehId: pengguna.id,
          olehNama: String(pengguna.nama || pengguna.username || "").slice(0, 150),
        },
      });
    } catch (e) {
      if (e && e.code === "P2002") throw conflict("NOP ini sudah tercatat di bidang ini.");
      throw e;
    }
    const kunci = kunciBidang(isi.kode, isi.nib);
    const kecuali = bacaKecuali(req.body?.kecuali);
    res.status(201).json((await integrasi.nopBidang([kunci], pengguna, { kecuali }))[kunci]);
  })
);

/** DELETE /api/integrasi/nop-bidang/:id?kecuali= -> isi tab NOP terbaru. Admin, atau petugas yang menambahkannya. */
router.delete(
  "/nop-bidang/:id",
  batasi,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const pengguna = await bacaPengguna(req);
    if (!pengguna) throw unauthorized("Masuk sebagai petugas atau admin untuk menghapus NOP.");
    const baris = await prisma.bidangNop.findUnique({ where: { id } });
    if (!baris) throw notFound("NOP ini sudah dihapus.");
    if (!integrasi.bolehHapusNop(baris, pengguna)) {
      throw forbidden("NOP ini hanya bisa dihapus admin atau petugas yang menambahkannya.");
    }
    await prisma.bidangNop.delete({ where: { id } });
    const kunci = kunciBidang(baris.kodeWilayah, baris.nib);
    res.json((await integrasi.nopBidang([kunci], pengguna, { kecuali: bacaKecuali(req.query.kecuali) }))[kunci]);
  })
);

/** GET /api/integrasi/unduh?pola=&cari= -> daftar kerja integrasi (.xlsx). Khusus admin. */
router.get(
  "/unduh",
  requireAdmin,
  wrap(async (req, res) => {
    const laporan = await bacaLaporan();
    const pola = integrasi.POLA[req.query.pola] ? req.query.pola : "";
    const baris = integrasi.saringBaris(laporan.baris, { pola, cari: req.query.cari });
    const tanggal = new Date().toISOString().slice(0, 10);
    await kirimXlsx(res, {
      nama: `integrasi-nib-nop${pola ? `-${pola.replace(/_/g, "-")}` : ""}-${tanggal}`,
      sheet: "Integrasi NIB-NOP",
      tabel: integrasi.tabelLaporan(baris, { baseUrl: baseUrlEkspor(req) }),
    });
  })
);

/** GET /api/integrasi/unduh-pasangan -> pasangan NIB-NOP kedua sumber (.xlsx). Khusus admin. */
router.get(
  "/unduh-pasangan",
  requireAdmin,
  wrap(async (req, res) => {
    const [pasangan, persil] = await Promise.all([integrasi.bacaPasangan(), integrasi.persilTercatat()]);
    await kirimXlsx(res, {
      nama: `pasangan-nib-nop-${new Date().toISOString().slice(0, 10)}`,
      sheet: "Pasangan NIB-NOP",
      tabel: integrasi.tabelPasangan(pasangan, persil, { baseUrl: baseUrlEkspor(req) }),
    });
  })
);

/**
 * GET /api/integrasi/unduh-geojson -> lapisan NOP PBB (.geojson, EPSG:4326): satu
 * bidang BPN tercatat per Feature dengan NOP dan statusnya, untuk QGIS. Khusus admin.
 */
router.get(
  "/unduh-geojson",
  requireAdmin,
  wrap(async (_req, res) => {
    const [pasangan, persil] = await Promise.all([integrasi.bacaPasangan(), integrasi.persilTercatat({ geometri: true })]);
    const nama = `peta-bidang-pbb-${new Date().toISOString().slice(0, 10)}.geojson`;
    res.setHeader("Content-Type", "application/geo+json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nama}"`);
    res.send(integrasi.teksGeojsonPbb(pasangan, persil));
  })
);

module.exports = router;

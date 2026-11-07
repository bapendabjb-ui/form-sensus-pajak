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
 *
 * Pemadanan (lapisan Terintegrasi): petugas dan admin boleh memadankan bidang
 * dan mengubah padanan siapa pun - yang terakhir memutuskan tercatat namanya.
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
const config = require("../config");

const router = express.Router();

const batasi = pembatas({
  jendelaMs: 10 * 60 * 1000,
  maks: 1200,
  pesan: "Terlalu banyak permintaan integrasi NIB. Tunggu beberapa menit.",
});

/** Laporan dan status peta disusun dari seluruh data: dipakai bersama sampai ada data yang berubah. */
const bacaLaporan = simpanSementara({ umurMs: 60 * 1000, susun: integrasi.susunLaporan });
const bacaStatusPeta = simpanSementara({ umurMs: 60 * 1000, susun: integrasi.statusBidangPeta });
const bacaStatusTerpadu = simpanSementara({ umurMs: 60 * 1000, susun: integrasi.statusTerpaduPeta });
const bacaAntrean = simpanSementara({
  umurMs: 60 * 1000,
  susun: async () => integrasi.susunAntrean(await integrasi.terpaduSementara(), await integrasi.persilTercatat()),
});

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
 * bidang persil untuk mode warna "NOP PBB" di Peta Sensus. Id ditulis sebagai
 * selisih berurutan (integrasi.selisihUrut).
 * ?lapisan=terpadu -> { padan, tinjau, pecah, tanpa_nop }: mode warna "Terintegrasi".
 */
router.get(
  "/bidang",
  batasi,
  wrap(async (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.json(await (req.query.lapisan === "terpadu" ? bacaStatusTerpadu() : bacaStatusPeta()));
  })
);

/**
 * GET /api/integrasi/padanan?mulai= ->
 *   { ringkas: { padan, tinjau, pecah, tanpa_nop }, alasan: { kunci: label },
 *     data: { baris, total, mulai, lebih } }
 * Antrean bidang yang perlu dipadankan, untuk halaman Integrasi NIB.
 */
router.get(
  "/padanan",
  batasi,
  wrap(async (req, res) => {
    const { ringkas, baris } = await bacaAntrean();
    const mulai = Math.max(0, Math.min(Number.parseInt(req.query.mulai, 10) || 0, baris.length));
    res.setHeader("Cache-Control", "no-cache");
    res.json({
      ringkas,
      alasan: integrasi.ALASAN_TINJAU,
      data: { baris: baris.slice(mulai, mulai + PER_HALAMAN), total: baris.length, mulai, lebih: mulai + PER_HALAMAN < baris.length },
    });
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
    res.status(201).json((await integrasi.nopBidang([kunci], pengguna, { kecuali, segar: true }))[kunci]);
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
    res.json((await integrasi.nopBidang([kunci], pengguna, { kecuali: bacaKecuali(req.query.kecuali), segar: true }))[kunci]);
  })
);

/* ---------- pemadanan per bidang ---------- */

/** Pemadan: petugas atau admin yang masuk. */
async function bacaPemadan(req) {
  const pengguna = await bacaPengguna(req);
  if (!pengguna) throw unauthorized("Masuk sebagai petugas atau admin untuk memadankan NOP.");
  if (pengguna.role !== "admin" && pengguna.role !== "petugas") throw forbidden("Hanya petugas dan admin yang boleh memadankan NOP.");
  return pengguna;
}

/**
 * PUT /api/integrasi/padanan { kunci, rincian: [{ nop, tindak, luasPbb, luasBeda }], catatan, kecuali? }
 * -> isi tab NOP terbaru. Simpan / ganti keputusan pemadanan satu bidang
 * (integrasi.bacaKirimanPadanan). `kecuali` = data yang sedang dibuka di formulir:
 * NOP-nya dikirim di rincian, belum tentu sudah tersimpan.
 */
router.put(
  "/padanan",
  batasi,
  wrap(async (req, res) => {
    const pengguna = await bacaPemadan(req);
    const kunci = String(req.body?.kunci || "");
    const kecuali = bacaKecuali(req.body?.kecuali);
    let isi;
    try {
      isi = integrasi.bacaKirimanPadanan(req.body || {}, await integrasi.nopSekarang(kunci, { kecuali }));
    } catch (e) {
      throw badRequest(e.message);
    }
    const data = {
      hasil: isi.hasil,
      nopUtama: isi.nopUtama,
      rincian: isi.rincian,
      catatan: isi.catatan,
      olehPeran: pengguna.role,
      olehId: pengguna.id,
      olehNama: String(pengguna.nama || pengguna.username || "").slice(0, 150),
    };
    await prisma.padananBidang.upsert({
      where: { kodeWilayah_nib: { kodeWilayah: isi.kode, nib: isi.nib } },
      create: { kodeWilayah: isi.kode, nib: isi.nib, ...data },
      update: data,
    });
    const k = kunciBidang(isi.kode, isi.nib);
    res.json((await integrasi.nopBidang([k], pengguna, { kecuali, segar: true }))[k]);
  })
);

/** DELETE /api/integrasi/padanan?kunci=&kecuali= -> isi tab NOP terbaru. Batalkan padanan bidang ini. */
router.delete(
  "/padanan",
  batasi,
  wrap(async (req, res) => {
    const pengguna = await bacaPemadan(req);
    const k = integrasi.pisahKunci(req.query.kunci);
    if (!k) throw badRequest("Bidang tidak dikenal.");
    await prisma.padananBidang.deleteMany({ where: { kodeWilayah: k.kode, nib: k.nib } });
    const kunci = kunciBidang(k.kode, k.nib);
    res.json((await integrasi.nopBidang([kunci], pengguna, { kecuali: bacaKecuali(req.query.kecuali), segar: true }))[kunci]);
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
    const [pasangan, persil, terpadu, keputusan] = await Promise.all([
      integrasi.bacaPasangan(),
      integrasi.persilTercatat(),
      integrasi.bacaTerpadu(),
      integrasi.bacaKeputusan(),
    ]);
    await kirimXlsx(res, {
      nama: `pasangan-nib-nop-${new Date().toISOString().slice(0, 10)}`,
      sheet: "Pasangan NIB-NOP",
      tabel: integrasi.tabelPasangan(pasangan, persil, {
        baseUrl: baseUrlEkspor(req),
        terpadu,
        keputusan: new Map(keputusan.map((d) => [d.kunci, d])),
      }),
    });
  })
);

/**
 * GET /api/integrasi/unduh-geojson -> lapisan NOP PBB dan Terintegrasi (.geojson,
 * EPSG:4326): satu bidang BPN tercatat per Feature dengan NOP, status, dan NOP
 * hasil padanannya, untuk QGIS. Khusus admin.
 */
router.get(
  "/unduh-geojson",
  requireAdmin,
  wrap(async (_req, res) => {
    const [pasangan, persil, terpadu] = await Promise.all([
      integrasi.bacaPasangan(),
      integrasi.persilTercatat({ geometri: true }),
      integrasi.bacaTerpadu(),
    ]);
    const nama = `peta-bidang-pbb-${new Date().toISOString().slice(0, 10)}.geojson`;
    res.setHeader("Content-Type", "application/geo+json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nama}"`);
    res.send(integrasi.teksGeojsonPbb(pasangan, persil, terpadu));
  })
);

/**
 * GET /api/integrasi/unduh-tindak-lanjut -> tindak lanjut hasil pemadanan (.xlsx):
 * NOP ganda, NOP yang digabung, luas PBB yang perlu disesuaikan, bidang yang perlu
 * dipecah, dan NOP yang letaknya perlu dicek. Khusus admin.
 */
router.get(
  "/unduh-tindak-lanjut",
  requireAdmin,
  wrap(async (req, res) => {
    const [keputusan, terpadu, persil] = await Promise.all([
      integrasi.bacaKeputusan(),
      integrasi.bacaTerpadu(),
      integrasi.persilTercatat(),
    ]);
    await kirimXlsx(res, {
      nama: `tindak-lanjut-padanan-${new Date().toISOString().slice(0, 10)}`,
      sheet: "Tindak lanjut padanan",
      tabel: integrasi.tabelTindakLanjut(integrasi.susunTindakLanjut(keputusan, terpadu), persil, {
        baseUrl: baseUrlEkspor(req),
        timezone: config.timezone,
      }),
    });
  })
);

module.exports = router;

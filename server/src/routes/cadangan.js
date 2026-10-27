"use strict";

/**
 * Cadangan manual: database (.sql.gz) dan foto per bulan (.tar) diunduh admin
 * untuk disimpan di luar server. Aturannya di src/cadangan.js.
 */

const fs = require("fs");
const path = require("path");
const express = require("express");
const prisma = require("../prisma");
const config = require("../config");
const { requireAdmin } = require("../auth");
const { wrap, badRequest, notFound, ApiError } = require("../http");
const {
  bacaDatabaseUrl,
  argumenMysqldump,
  cariMysqldump,
  folderBulan,
  ringkasFotoPerBulan,
  buatTiket,
  pakaiTiket,
  alirkan,
  mulai,
  tulisOpsiSementara,
} = require("../cadangan");

const router = express.Router();

/** Ukuran database (data + indeks, sebelum dikompres), atau null bila tidak terbaca. */
async function ukuranDatabase(nama) {
  try {
    const [r] = await prisma.$queryRaw`
      SELECT COALESCE(SUM(data_length + index_length), 0) AS ukuran
      FROM information_schema.tables WHERE table_schema = ${nama}`;
    return Number(r.ukuran);
  } catch {
    return null;
  }
}

/**
 * GET /api/cadangan -> { database: { tersedia, ukuran }, foto: [{ bulan, jumlah, ukuran }] }
 * `tersedia` false bila mysqldump tidak ditemukan di server.
 */
router.get(
  "/",
  requireAdmin,
  wrap(async (_req, res) => {
    const db = bacaDatabaseUrl(process.env.DATABASE_URL);
    const [ukuran, foto] = await Promise.all([
      db ? ukuranDatabase(db.database) : null,
      prisma.foto.findMany({ select: { berkas: true, ukuran: true } }),
    ]);
    res.json({
      database: { tersedia: Boolean(db && cariMysqldump()), ukuran },
      foto: ringkasFotoPerBulan(foto),
    });
  })
);

/**
 * POST /api/cadangan/tiket  { jenis: "database" } | { jenis: "foto", bulan: "2026-10" }
 *   -> { tiket } untuk GET /api/cadangan/unduh?tiket=, sekali pakai, berlaku 2 menit.
 * Semua pemeriksaan dilakukan di sini, supaya galatnya tampil di layar admin
 * dan bukan sebagai halaman JSON setelah tautan dibuka.
 */
router.post(
  "/tiket",
  requireAdmin,
  wrap(async (req, res) => {
    const jenis = req.body?.jenis;
    let isi;
    if (jenis === "database") {
      if (!bacaDatabaseUrl(process.env.DATABASE_URL)) {
        throw new ApiError(500, "DATABASE_URL di server tidak terbaca.");
      }
      if (!cariMysqldump()) {
        throw new ApiError(
          503,
          "mysqldump tidak ditemukan di server. Isi MYSQLDUMP_PATH di .env dengan lokasinya, lalu restart aplikasi."
        );
      }
      isi = { jenis };
    } else if (jenis === "foto") {
      const folder = folderBulan(req.body?.bulan);
      if (!folder) throw badRequest("Bulan foto tidak valid.");
      if (!fs.existsSync(path.join(config.uploadDir, folder))) throw notFound("Belum ada foto pada bulan itu.");
      isi = { jenis, bulan: req.body.bulan, folder };
    } else {
      throw badRequest("Jenis cadangan tidak dikenal.");
    }
    isi.admin = req.admin.username;
    res.json({ tiket: buatTiket(isi) });
  })
);

/** Cap waktu untuk nama berkas, mis. 2026-10-27_1430 (zona waktu aplikasi). */
function capWaktu() {
  const b = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: config.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return `${b.year}-${b.month}-${b.day}_${b.hour}${b.minute}`;
}

/**
 * GET /api/cadangan/unduh?tiket= -> berkas cadangan. Tanpa login: tiket sekali
 * pakai dari POST /tiket adalah izinnya (lihat bebasGerbang di src/auth.js).
 */
router.get(
  "/unduh",
  wrap(async (req, res) => {
    const isi = pakaiTiket(req.query.tiket);
    if (!isi) throw new ApiError(410, "Tautan unduh sudah dipakai atau kedaluwarsa. Tekan tombol Unduh lagi.");
    console.log(`[Sensus Pajak] cadangan ${isi.jenis}${isi.bulan ? ` ${isi.bulan}` : ""} diunduh oleh ${isi.admin}.`);

    if (isi.jenis === "database") {
      const db = bacaDatabaseUrl(process.env.DATABASE_URL);
      const opsi = tulisOpsiSementara(db);
      const hapusOpsi = () => fs.rm(opsi, { force: true }, () => {});
      let anak;
      try {
        anak = await mulai(cariMysqldump(), argumenMysqldump(opsi, db.database));
      } catch (e) {
        hapusOpsi();
        throw new ApiError(503, `mysqldump tidak bisa dijalankan: ${e.message}`);
      }
      // Berkas berisi password database: hapus begitu mysqldump selesai,
      // berhasil, gagal, maupun dibatalkan.
      anak.on("close", hapusOpsi);
      alirkan(res, anak, {
        nama: `sensus-pajak-database-${capWaktu()}.sql.gz`,
        jenis: "application/gzip",
        gzip: true,
        label: "database",
      });
      return;
    }

    // Foto: path relatif "YYYY/MM" supaya cukup diekstrak ke dalam UPLOAD_DIR.
    const anak = await mulai("tar", ["-cf", "-", "-C", config.uploadDir, isi.folder]).catch((e) => {
      throw new ApiError(503, `tar tidak bisa dijalankan: ${e.message}`);
    });
    alirkan(res, anak, {
      nama: `sensus-pajak-foto-${isi.bulan}.tar`,
      jenis: "application/x-tar",
      label: `foto ${isi.bulan}`,
    });
  })
);

module.exports = router;

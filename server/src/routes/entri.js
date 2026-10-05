"use strict";

const express = require("express");
const prisma = require("../prisma");
const { requireAdmin, bacaAdmin } = require("../auth");
const { wrap, badRequest, notFound, parseId, ApiError } = require("../http");
const { siapkanJawaban, tulisJawaban, muatEntri, bacaBerkas, bacaKoordinat } = require("../entri");
const { hapusBerkas } = require("../foto");
const { hapusEntri } = require("../hapus");
const { includePertanyaan } = require("../bentuk");
const { nilaiTitik } = require("../cekLokasi");
const { KANTOR, AKURASI_REKAM_ULANG_M } = require("../batas");

const router = express.Router();

/** GET /api/entri/:id -> satu data lengkap dengan formulir & jawabannya. */
router.get(
  "/:id",
  wrap(async (req, res) => {
    res.json(await muatEntri(parseId(req.params.id)));
  })
);

/** PUT /api/entri/:id  { jawaban, dariEpbb?, berkasLengkap?, catatanBerkas? } -> ubah isian. Kolom wajib divalidasi -> 422. */
router.put(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const entri = await prisma.entri.findUnique({
      where: { id },
      include: { formulir: { include: includePertanyaan } },
    });
    if (!entri) throw notFound("Data tidak ditemukan.");

    const siap = await siapkanJawaban(entri.formulir, req.body?.jawaban, id, req.body?.dariEpbb);
    if (Object.keys(siap.errors).length) {
      throw new ApiError(422, "Periksa kembali isian yang ditandai merah.", { errors: siap.errors });
    }

    // Koordinat rekaman (GPS asli) sengaja tidak disentuh di sini, termasuk
    // bila masih kosong. Data yang tersimpan di lapangan sebelum GPS mengunci
    // lalu diperbaiki di kantor dulu terisi diam-diam dengan titik kantor.
    // GPS asli kini hanya terekam saat data dibuat, atau lewat PUT /:id/rekam
    // yang dijalankan petugas dengan sadar di lokasi objek.
    let dilepas = [];
    await prisma.$transaction(async (tx) => {
      await tx.entri.update({
        where: { id },
        data: { updatedAt: new Date(), ...bacaBerkas(req.body) },
      });
      dilepas = await tulisJawaban(tx, id, siap);
    });
    await hapusBerkas(dilepas);

    res.json(await muatEntri(id));
  })
);

/**
 * PUT /api/entri/:id/titik  { lat, lon } | { hapus: true } -> koreksi titik objek lewat peta.
 *
 * Terbuka untuk petugas maupun admin. GPS asli tidak ikut berubah, jadi bukti
 * kunjungannya tetap ada; pelakunya dicatat (username admin, atau "petugas").
 */
router.put(
  "/:id/titik",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const ada = await prisma.entri.findUnique({ where: { id }, select: { id: true } });
    if (!ada) throw notFound("Data tidak ditemukan.");

    let data;
    if (req.body?.hapus === true) {
      data = { koreksiLat: null, koreksiLon: null, koreksiWaktu: null, koreksiOleh: "" };
    } else {
      const k = bacaKoordinat(req.body);
      if (!k) throw badRequest("Titik di peta tidak valid.");
      const admin = await bacaAdmin(req);
      data = { koreksiLat: k.lat, koreksiLon: k.lon, koreksiWaktu: new Date(), koreksiOleh: admin ? admin.username : "petugas" };
    }

    await prisma.entri.update({ where: { id }, data });
    res.json(await muatEntri(id));
  })
);

/**
 * PUT /api/entri/:id/rekam  { lat, lon, akurasi } -> rekam ulang GPS asli di lokasi objek.
 *
 * Satu-satunya jalan mengganti GPS asli, jadi syaratnya ketat: akurasi harus
 * diketahui dan cukup teliti, dan posisinya tidak boleh di area kantor.
 */
router.put(
  "/:id/rekam",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const ada = await prisma.entri.findUnique({ where: { id }, select: { id: true } });
    if (!ada) throw notFound("Data tidak ditemukan.");

    const k = bacaKoordinat(req.body);
    if (!k) throw badRequest("Posisi GPS tidak valid.");
    if (k.akurasi === null || k.akurasi > AKURASI_REKAM_ULANG_M) {
      throw new ApiError(
        422,
        `GPS belum cukup teliti (${k.akurasi === null ? "akurasi tidak diketahui" : `±${Math.round(k.akurasi)} m`}). ` +
          `Pindah ke tempat terbuka lalu coba lagi - minimal ±${AKURASI_REKAM_ULANG_M} m.`
      );
    }
    if (nilaiTitik(k) === "kantor") {
      throw new ApiError(422, `Posisi Anda masih di area ${KANTOR.nama}. Rekam ulang saat berada di lokasi objek.`);
    }

    await prisma.entri.update({
      where: { id },
      data: { rekamLat: k.lat, rekamLon: k.lon, rekamAkurasi: k.akurasi, rekamWaktu: new Date() },
    });
    res.json(await muatEntri(id));
  })
);

/** DELETE /api/entri/:id -> hapus satu data beserta fotonya. Khusus admin. */
router.delete(
  "/:id",
  requireAdmin,
  wrap(async (req, res) => {
    await hapusEntri(parseId(req.params.id), req.admin);
    res.status(204).end();
  })
);

module.exports = router;

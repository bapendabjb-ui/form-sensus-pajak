"use strict";

/**
 * Persil BPN di Peta Sensus (aturannya di src/persil.js). Siapa pun yang boleh
 * membuka Peta Sensus boleh melihatnya; impor dan hapus khusus admin.
 */

const express = require("express");
const { requireAdmin } = require("../auth");
const { wrap, badRequest } = require("../http");
const { pembatas } = require("../laju");
const persil = require("../persil");

const router = express.Router();

/*
 * Peta memuat persil per petak: menggeser peta di daerah padat bisa meminta
 * puluhan petak, dan satu kantor bisa keluar lewat satu IP. Yang dicegah hanya
 * pemuatan tanpa henti.
 */
const batasiPetak = pembatas({
  jendelaMs: 10 * 60 * 1000,
  maks: 6000,
  pesan: "Persil terlalu sering dimuat. Tunggu beberapa menit.",
});

const batasiCari = pembatas({
  jendelaMs: 10 * 60 * 1000,
  maks: 1200,
  pesan: "Terlalu banyak pencarian persil. Tunggu beberapa menit.",
});

/** Bilangan bulat dari parameter rute (nomor petak boleh negatif: lintang selatan). */
function bacaBulat(nilai, label) {
  const n = Number(nilai);
  if (!Number.isInteger(n) || Math.abs(n) > 100000) throw badRequest(`Parameter ${label} tidak valid.`);
  return n;
}

/** Koordinat dari query string ?lat=&lon=. */
function bacaTitik(q) {
  const lat = Number(q.lat);
  const lon = Number(q.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw badRequest("Koordinat tidak valid.");
  }
  return { lat, lon };
}

/** GET /api/persil -> { jumlah, versi, wilayah: [...] } (lihat persil.ringkasan). */
router.get(
  "/",
  batasiCari,
  wrap(async (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.json(await persil.ringkasan());
  })
);

/**
 * GET /api/persil/petak/:i/:j?v=<versi> -> bidang di petak itu, ringkas
 * (persil.teksPetak). Alamatnya memuat versi persil, jadi isinya untuk alamat
 * yang sama tidak pernah berubah: browser boleh menyimpannya.
 */
router.get(
  "/petak/:i/:j",
  batasiPetak,
  wrap(async (req, res) => {
    const i = bacaBulat(req.params.i, "petak");
    const j = bacaBulat(req.params.j, "petak");
    const isi = await persil.petakPeta(i, j);
    res.setHeader("Cache-Control", req.query.v ? "private, max-age=86400" : "no-cache");
    res.type("json").send(isi);
  })
);

/**
 * GET /api/persil/ringkas/:i/:j?v=<versi> -> isi ringkas satu sel ±2,2 km untuk
 * peta yang diperkecil (persil.teksRingkas). Boleh disimpan browser, seperti petak.
 */
router.get(
  "/ringkas/:i/:j",
  batasiPetak,
  wrap(async (req, res) => {
    const isi = await persil.ringkasPeta(bacaBulat(req.params.i, "sel"), bacaBulat(req.params.j, "sel"));
    res.setHeader("Cache-Control", req.query.v ? "private, max-age=86400" : "no-cache");
    res.type("json").send(isi);
  })
);

/**
 * GET /api/persil/titik?lat=&lon=[&bentuk=1] -> { ada: ada persil tersimpan, persil: bidang di titik itu | null }.
 * `bentuk=1`: bidangnya beserta kotak dan Feature-nya - bidang yang diketuk di peta.
 */
router.get(
  "/titik",
  batasiCari,
  wrap(async (req, res) => {
    const { lat, lon } = bacaTitik(req.query);
    const bentuk = req.query.bentuk === "1";
    const [ada, hasil] = await Promise.all([persil.adaPersil(), persil.cariDiTitik(lat, lon, { bentuk })]);
    res.json({ ada, persil: hasil });
  })
);

/** GET /api/persil/cari?q=<NIB> -> [{ ...bidang, batas, fitur }], paling banyak 20. */
router.get(
  "/cari",
  batasiCari,
  wrap(async (req, res) => {
    res.json(await persil.cariNib(req.query.q));
  })
);

/* ---------- impor & hapus (admin) ---------- */

/** POST /api/persil/impor -> { token, kirimMaks }: mulai impor dari browser. */
router.post(
  "/impor",
  requireAdmin,
  wrap(async (_req, res) => {
    res.status(201).json({ token: await persil.mulaiImpor(), kirimMaks: persil.KIRIM_MAKS });
  })
);

/** POST /api/persil/impor/:token { sumber, fitur: [...] } -> { diterima, ditolak: { alasan: jumlah } }. */
router.post(
  "/impor/:token",
  requireAdmin,
  wrap(async (req, res) => {
    const token = persil.bacaToken(req.params.token);
    res.json(await persil.simpanKiriman(token, req.body, req.admin.username));
  })
);

/** POST /api/persil/impor/:token/selesai -> { jumlah, diganti, wilayah }: tampilkan hasil impor. */
router.post(
  "/impor/:token/selesai",
  requireAdmin,
  wrap(async (req, res) => {
    res.json(await persil.selesaikanImpor(persil.bacaToken(req.params.token)));
  })
);

/** DELETE /api/persil/impor/:token -> 204: batalkan impor yang belum selesai. */
router.delete(
  "/impor/:token",
  requireAdmin,
  wrap(async (req, res) => {
    await persil.batalkanImpor(persil.bacaToken(req.params.token));
    res.status(204).end();
  })
);

/** POST /api/persil/hapus { kunci: [...] } | { semua: true } -> { dihapus }. */
router.post(
  "/hapus",
  requireAdmin,
  wrap(async (req, res) => {
    const body = req.body || {};
    res.json({ dihapus: await persil.hapusPersil({ kunci: body.kunci, semua: body.semua === true }) });
  })
);

module.exports = router;

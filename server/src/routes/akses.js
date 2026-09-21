"use strict";

const express = require("express");
const { wrap, badRequest } = require("../http");
const { pembatas } = require("../laju");
const { aksesAktif, punyaAkses, pasangCookieAkses, samaAman } = require("../keamanan");
const config = require("../config");

const router = express.Router();

/** Kode akses jauh lebih pendek daripada password, jadi batasnya lebih ketat. */
const batasiKode = pembatas({
  jendelaMs: 15 * 60 * 1000,
  maks: 10,
  hanyaGagal: true,
  pesan: "Terlalu banyak percobaan kode akses. Coba lagi dalam beberapa menit.",
});

/**
 * GET /api/akses -> { perlu, sudah }
 *
 * Dipanggil klien saat aplikasi dibuka untuk tahu apakah gerbang kode akses
 * perlu ditampilkan. Tidak pernah membocorkan kodenya sendiri.
 */
router.get("/", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ perlu: aksesAktif(), sudah: aksesAktif() ? punyaAkses(req) : true });
});

/** POST /api/akses  { kode } -> pasang cookie akses bila kodenya benar. */
router.post(
  "/",
  batasiKode,
  wrap(async (req, res) => {
    if (!aksesAktif()) return res.json({ ok: true, perlu: false });

    const kode = String(req.body?.kode || "").trim();
    if (!kode) throw badRequest("Kode akses wajib diisi.");
    if (!samaAman(kode, config.aksesKode)) throw badRequest("Kode akses salah.");

    pasangCookieAkses(res);
    res.json({ ok: true, perlu: true });
  })
);

module.exports = router;

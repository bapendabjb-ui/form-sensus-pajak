"use strict";

/**
 * Pemeriksaan lokasi data - murni, tanpa database.
 *
 * Setiap data punya dua macam titik:
 *
 *   - GPS asli   : posisi perangkat petugas saat data pertama kali disimpan
 *                  (kolom rekam_*). Ini bukti kunjungan, jadi tidak bisa
 *                  digeser lewat peta - hanya bisa direkam ulang di tempat.
 *   - titik objek: letak objek pajak. Urutan sumbernya: koreksi lewat peta,
 *                  lalu jawaban pertanyaan Lokasi di formulir, lalu GPS asli.
 *
 * Titik objek inilah yang dipakai Peta Sensus dan yang diperiksa sebelum
 * kertas kerja ditandai selesai. Salinan untuk klien: client/src/lib/cekLokasi.js.
 */

const { KANTOR, AKURASI_KASAR_M, JARAK_JAUH_M } = require("./batas");

/** Koordinat sah? Jawaban lokasi yang kosong disimpan sebagai { lat: null, lon: null }. */
const adaTitik = (t) =>
  !!t &&
  typeof t === "object" &&
  typeof t.lat === "number" &&
  typeof t.lon === "number" &&
  t.lat >= -90 &&
  t.lat <= 90 &&
  t.lon >= -180 &&
  t.lon <= 180;

/** Jarak dua titik dalam meter (haversine). */
function jarakMeter(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Nilai sebuah titik: "baik" | "tanpa" | "kantor" | "kasar".
 *
 * Titik yang ditunjuk manusia di peta (`manual`) tidak diperiksa terhadap
 * kantor: objek yang memang bertetangga dengan kantor harus bisa ditandai, dan
 * orang yang berniat curang bisa menunjuk tempat lain mana pun di peta. Bukti
 * kunjungannya tetap GPS asli, yang dinilai terpisah.
 */
function nilaiTitik(t) {
  if (!adaTitik(t)) return "tanpa";
  if (t.manual) return "baik";
  if (jarakMeter(t, KANTOR) <= KANTOR.radiusM) return "kantor";
  if (typeof t.akurasi === "number" && t.akurasi > AKURASI_KASAR_M) return "kasar";
  return "baik";
}

/** GPS asli sebuah entri, atau null. */
function titikGps(e) {
  if (!e || e.rekamLat === null || e.rekamLat === undefined || e.rekamLon === null || e.rekamLon === undefined) {
    return null;
  }
  return { lat: e.rekamLat, lon: e.rekamLon, akurasi: e.rekamAkurasi ?? null };
}

/** Jawaban pertanyaan Lokasi pertama yang terisi. `qids` urut seperti di formulir. */
function jawabanLokasiPertama(qids, jawaban = {}) {
  for (const qid of qids) {
    if (adaTitik(jawaban[qid])) return jawaban[qid];
  }
  return null;
}

/**
 * Titik objek: koreksi peta > jawaban pertanyaan Lokasi > GPS asli.
 * @returns {{ lat, lon, akurasi, manual, sumber: "koreksi"|"formulir"|"gps" } | null}
 */
function titikObjek(e, jawabanLokasi) {
  if (e && typeof e.koreksiLat === "number" && typeof e.koreksiLon === "number") {
    return { lat: e.koreksiLat, lon: e.koreksiLon, akurasi: null, manual: true, sumber: "koreksi" };
  }
  if (adaTitik(jawabanLokasi)) {
    return {
      lat: jawabanLokasi.lat,
      lon: jawabanLokasi.lon,
      akurasi: typeof jawabanLokasi.akurasi === "number" ? jawabanLokasi.akurasi : null,
      manual: jawabanLokasi.sumber === "peta",
      sumber: "formulir",
    };
  }
  const gps = titikGps(e);
  return gps ? { ...gps, manual: false, sumber: "gps" } : null;
}

/**
 * Ringkasan lokasi untuk tampilan.
 *   status : nilai titik objek - selain "baik", data perlu diperiksa
 *   gps    : nilai GPS asli (bukti kunjungan), untuk keterangan
 *   sumber : asal titik objek, null bila tidak ada titik sama sekali
 *   jarakM : jarak titik objek dari GPS asli bila keduanya berbeda sumber
 *   jauh   : jarak itu melebihi JARAK_JAUH_M padahal GPS asli baik
 */
function ringkasLokasi(e, jawabanLokasi) {
  const gps = titikGps(e);
  const objek = titikObjek(e, jawabanLokasi);
  const nilaiGps = nilaiTitik(gps);
  const jarakM = objek && gps && objek.sumber !== "gps" ? Math.round(jarakMeter(objek, gps)) : null;
  return {
    status: nilaiTitik(objek),
    gps: nilaiGps,
    sumber: objek ? objek.sumber : null,
    jarakM,
    jauh: jarakM !== null && nilaiGps === "baik" && jarakM > JARAK_JAUH_M,
  };
}

module.exports = { adaTitik, jarakMeter, nilaiTitik, titikGps, jawabanLokasiPertama, titikObjek, ringkasLokasi };

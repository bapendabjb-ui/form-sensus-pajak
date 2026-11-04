"use strict";

/**
 * Pemeriksaan lokasi - murni, tanpa database.
 *
 *   - pertanyaan Lokasi : koordinat objek di formulir, mis. Koordinat Objek
 *                         Pajak pada PBB-P2. Dinilai per data.
 *   - GPS asli per data : posisi perangkat saat data pertama kali disimpan
 *                         (kolom entri.rekam_*), direkam diam-diam sebagai bukti
 *                         kunjungan; tidak bisa diubah dan tidak ditampilkan.
 *
 * Koordinat objek yang sudah dicek admin (koordinat_dicek_at) dianggap
 * terverifikasi: nilainya "baik" walau, mis., letaknya dekat kantor.
 *
 * Fitur "lokasi sensus" per kertas kerja (titik ditetapkan di peta / Rekam di
 * sini, status & centang dicek-nya) sudah dihapus; kolom kertas_kerja.titik_*,
 * lokasi_status, dan lokasi_dicek_* dibiarkan di database tanpa dipakai.
 *
 * Salinan aturan nilaiTitik untuk klien: client/src/lib/cekLokasi.js.
 */

const { KANTOR, AKURASI_KASAR_M } = require("./batas");

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

/** { oleh, waktu } bila sudah dicek admin, null bila belum. */
const tandaDicek = (waktu, oleh) => (waktu ? { oleh: oleh || "", waktu } : null);

/** Jawaban pertanyaan Lokasi pertama yang terisi. `qids` urut seperti di formulir. */
function jawabanLokasiPertama(qids, jawaban = {}) {
  for (const qid of qids) {
    if (adaTitik(jawaban[qid])) return jawaban[qid];
  }
  return null;
}

/**
 * Ringkasan lokasi satu data.
 *   gps   : nilai GPS asli data ini
 *   objek : nilai koordinat dari pertanyaan Lokasi (objek lain), null bila tidak diisi
 *   dicek : { oleh, waktu } bila koordinat objeknya sudah dicek admin (terkunci)
 */
function ringkasLokasiEntri(e, jawabanLokasi) {
  const dicek = tandaDicek(e && e.koordinatDicekAt, e && e.koordinatDicekOleh);
  return {
    gps: nilaiTitik(titikGps(e)),
    objek: adaTitik(jawabanLokasi)
      ? nilaiTitik({ ...jawabanLokasi, manual: jawabanLokasi.sumber === "peta" || Boolean(dicek) })
      : null,
    dicek,
  };
}

module.exports = {
  adaTitik,
  jarakMeter,
  nilaiTitik,
  titikGps,
  jawabanLokasiPertama,
  ringkasLokasiEntri,
};

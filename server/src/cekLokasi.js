"use strict";

/**
 * Pemeriksaan lokasi - murni, tanpa database.
 *
 * Satu kertas kerja = satu objek (rumah / bidang yang disensus), jadi titik
 * objeknya satu per kertas kerja:
 *
 *   - titik kertas kerja : ditetapkan dengan sengaja - ditunjuk di peta /
 *                          ditempel dari Google Maps ("koreksi"), atau Rekam di
 *                          sini saat berada di lokasi ("rekam"). Bila belum ada,
 *                          dipakai GPS terbaik dari data-datanya ("gps").
 *   - GPS asli per data  : posisi perangkat saat data pertama kali disimpan
 *                          (kolom entri.rekam_*). Bukti kunjungan; tidak bisa
 *                          diubah.
 *   - pertanyaan Lokasi  : koordinat objek lain yang berbeda tempat, mis. rumah
 *                          kedua pada formulir PBB-P2. Dinilai per data.
 *
 * Titik yang sudah dicek admin (lokasi_dicek_at / koordinat_dicek_at) dianggap
 * terverifikasi: nilainya "baik" walau, mis., letaknya dekat kantor.
 *
 * Salinan aturan nilaiTitik untuk klien: client/src/lib/cekLokasi.js.
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

/** Urutan dari yang terbaik, untuk memilih GPS terbaik di antara data. */
const PERINGKAT = { baik: 0, kasar: 1, kantor: 2, tanpa: 3 };

/** GPS asli sebuah entri, atau null. */
function titikGps(e) {
  if (!e || e.rekamLat === null || e.rekamLat === undefined || e.rekamLon === null || e.rekamLon === undefined) {
    return null;
  }
  return { lat: e.rekamLat, lon: e.rekamLon, akurasi: e.rekamAkurasi ?? null };
}

/**
 * GPS terbaik di antara data sebuah kertas kerja: yang nilainya paling baik,
 * lalu yang paling teliti. Kasar di luar kantor lebih berguna daripada teliti
 * di kantor - yang pertama setidaknya dekat dengan objeknya.
 */
function gpsTerbaik(entri = []) {
  let terbaik = null;
  for (const e of entri) {
    const t = titikGps(e);
    if (!t) continue;
    const nilai = nilaiTitik(t);
    const lebihBaik =
      !terbaik ||
      PERINGKAT[nilai] < PERINGKAT[terbaik.nilai] ||
      (PERINGKAT[nilai] === PERINGKAT[terbaik.nilai] && (t.akurasi ?? Infinity) < (terbaik.akurasi ?? Infinity));
    if (lebihBaik) terbaik = { ...t, nilai, entriId: e.id };
  }
  return terbaik;
}

/** titik_sumber yang tersimpan -> sumber yang ditampilkan. */
const SUMBER_TITIK = { peta: "koreksi", gps: "rekam", data: "gps" };

/**
 * Titik objek sebuah kertas kerja.
 * @returns {{ lat, lon, akurasi, manual, sumber: "koreksi"|"rekam"|"gps" } | null}
 */
function titikKk(kk, entri = []) {
  const dicek = Boolean(kk && kk.lokasiDicekAt);
  if (kk && typeof kk.titikLat === "number" && typeof kk.titikLon === "number") {
    const sumber = SUMBER_TITIK[kk.titikSumber] || "koreksi";
    return {
      lat: kk.titikLat,
      lon: kk.titikLon,
      akurasi: sumber === "koreksi" ? null : kk.titikAkurasi ?? null,
      manual: sumber === "koreksi" || dicek,
      sumber,
    };
  }
  const gps = gpsTerbaik(entri);
  return gps ? { lat: gps.lat, lon: gps.lon, akurasi: gps.akurasi, manual: dicek, sumber: "gps" } : null;
}

/** { oleh, waktu } bila sudah dicek admin, null bila belum. */
const tandaDicek = (waktu, oleh) => (waktu ? { oleh: oleh || "", waktu } : null);

/**
 * Ringkasan lokasi sebuah kertas kerja untuk tampilan.
 *   status : nilai titik objek - selain "baik", kertas kerja perlu diperiksa
 *   sumber : asal titik objek, null bila belum ada titik sama sekali
 *   titik  : { lat, lon, akurasi } | null
 *   gps    : jumlah data menurut nilai GPS aslinya { baik, kasar, kantor, tanpa }
 *   jarakM : jarak titik yang ditetapkan dari GPS asli terbaik yang baik
 *   jauh   : jarak itu melebihi JARAK_JAUH_M - ditunjuk jauh dari tempat petugas berada
 */
function ringkasLokasiKk(kk, entri = []) {
  const titik = titikKk(kk, entri);
  const gps = { baik: 0, kasar: 0, kantor: 0, tanpa: 0 };
  for (const e of entri) gps[nilaiTitik(titikGps(e))] += 1;

  const terbaik = gpsTerbaik(entri);
  const jarakM =
    titik && titik.sumber !== "gps" && terbaik && terbaik.nilai === "baik" ? Math.round(jarakMeter(titik, terbaik)) : null;

  return {
    status: nilaiTitik(titik),
    sumber: titik ? titik.sumber : null,
    titik: titik ? { lat: titik.lat, lon: titik.lon, akurasi: titik.akurasi } : null,
    waktu: titik && titik.sumber !== "gps" ? kk.titikWaktu ?? null : null,
    oleh: titik && titik.sumber !== "gps" ? kk.titikOleh || "" : "",
    dicek: tandaDicek(kk && kk.lokasiDicekAt, kk && kk.lokasiDicekOleh),
    gps,
    jarakM,
    jauh: jarakM !== null && jarakM > JARAK_JAUH_M,
  };
}

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
  gpsTerbaik,
  titikKk,
  ringkasLokasiKk,
  jawabanLokasiPertama,
  ringkasLokasiEntri,
};

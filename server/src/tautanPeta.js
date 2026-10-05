"use strict";

/**
 * Baca koordinat yang ditempel petugas dari Google Maps.
 *
 * Bentuk yang diterima:
 *   - teks koordinat     : "-3.439325, 114.829525" (hasil tekan lama di aplikasi)
 *   - derajat-menit-detik: 3°26'21.6"S 114°49'46.3"E
 *   - tautan lengkap     : .../place/.../@-3.43,114.82,17z/data=...!3d-3.439325!4d114.829525
 *   - tautan pendek      : https://maps.app.goo.gl/xxxx (tombol Bagikan) - diikuti
 *                          pengalihannya di server, karena browser tidak boleh
 *                          membaca pengalihan ke domain lain.
 *
 * Salinan pembaca teks untuk klien: client/src/lib/koordinatTeks.js.
 */

const { ApiError } = require("./http");

/** Koordinat sah, atau null. */
function sah(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/** 3°26'21.6"S -> -3.4393... */
function dariDms(derajat, menit, detik, arah) {
  const nilai = Number(derajat) + Number(menit || 0) / 60 + Number(detik || 0) / 3600;
  return /[SW]/i.test(arah) ? -nilai : nilai;
}

/**
 * Koordinat dari teks atau tautan lengkap, tanpa jaringan.
 * @returns {{ lat: number, lon: number } | null}
 */
function bacaKoordinatTeks(teks) {
  let s = String(teks || "").trim();
  if (!s) return null;
  try {
    s = decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    /* bukan teks ter-encode - pakai apa adanya */
  }

  // Titik penanda tempat pada tautan Google Maps lebih tepat daripada "@",
  // yang hanya pusat tampilan peta.
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(s);
  if (pin) return sah(Number(pin[1]), Number(pin[2]));

  const dms =
    /(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*["″]?\s*([NS])[\s,]+(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*["″]?\s*([EW])/i.exec(s);
  if (dms) return sah(dariDms(dms[1], dms[2], dms[3], dms[4]), dariDms(dms[5], dms[6], dms[7], dms[8]));

  // Pasangan desimal pertama: teks biasa, "@lat,lon", "?q=lat,lon", "/search/lat, lon".
  const pasangan = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/.exec(s);
  if (pasangan) return sah(Number(pasangan[1]), Number(pasangan[2]));

  return null;
}

/** Host tautan pendek Google Maps yang boleh diikuti server. */
const HOST_PENDEK = new Set(["maps.app.goo.gl", "goo.gl"]);

/** Host tujuan pengalihan yang masih dianggap Google Maps. */
const HOST_GOOGLE = /^(www\.|maps\.)?google\.(com|co\.id)$/;

const HOP_MAKS = 5;
const BATAS_WAKTU_MS = 8000;

/** URL tautan pendek Google Maps, atau null bila bukan. */
function tautanPendek(teks) {
  let u;
  try {
    u = new URL(String(teks || "").trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !HOST_PENDEK.has(u.hostname)) return null;
  return u;
}

/**
 * Ikuti pengalihan tautan pendek sampai ke tautan lengkap Google Maps, lalu
 * baca koordinatnya. Setiap lompatan harus tetap di host Google - server tidak
 * boleh dijadikan alat membuka alamat sembarang.
 *
 * @param {typeof fetch} [ambil] disuntikkan saat pengujian
 */
async function bacaTautanPendek(url, ambil = fetch) {
  let sekarang = url;
  for (let i = 0; i < HOP_MAKS; i++) {
    let res;
    try {
      res = await ambil(sekarang.href, { redirect: "manual", signal: AbortSignal.timeout(BATAS_WAKTU_MS) });
    } catch {
      throw new ApiError(502, "Tautan Google Maps tidak dapat dibuka dari server. Salin koordinatnya saja.");
    }
    const ke = res.headers.get("location");
    if (!ke || res.status < 300 || res.status >= 400) break;

    const berikut = new URL(ke, sekarang);
    if (berikut.protocol !== "https:" || !(HOST_PENDEK.has(berikut.hostname) || HOST_GOOGLE.test(berikut.hostname))) {
      throw new ApiError(422, "Tautan ini tidak mengarah ke Google Maps.");
    }
    const k = bacaKoordinatTeks(berikut.href);
    if (k) return k;
    sekarang = berikut;
  }
  throw new ApiError(
    422,
    "Tautan ini tidak memuat koordinat. Di Google Maps, tekan lama letak objek lalu salin koordinat yang muncul."
  );
}

/** Koordinat dari kiriman petugas: teks, tautan lengkap, atau tautan pendek. */
async function bacaKoordinatTempel(teks) {
  const k = bacaKoordinatTeks(teks);
  if (k) return k;
  const pendek = tautanPendek(teks);
  if (pendek) return bacaTautanPendek(pendek);
  throw new ApiError(422, "Koordinat tidak terbaca. Contoh yang benar: -3.439325, 114.829525");
}

module.exports = { bacaKoordinatTeks, tautanPendek, bacaTautanPendek, bacaKoordinatTempel };

"use strict";

/**
 * Lapisan keamanan HTTP: header pengeras, dipasang sebelum route mana pun.
 */

const config = require("./config");

/* ------------------------------------------------------------------ */
/* Header keamanan                                                     */
/* ------------------------------------------------------------------ */

/**
 * Content-Security-Policy.
 *
 * Hasil build Vite tidak memuat satu pun skrip inline (lihat client/index.html),
 * jadi script-src boleh ketat. Yang tidak bisa diketatkan adalah style: Leaflet
 * memasang posisi ubin peta lewat atribut style inline.
 *
 * Dua host ubin peta berasal dari client/src/components/PetaLokasi.jsx dan
 * PetaSebaran.jsx - bila daftar ubin di sana bertambah, tambahkan juga di sini,
 * kalau tidak petanya akan kosong tanpa pesan galat yang jelas.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://server.arcgisonline.com",
  "connect-src 'self'",
  "font-src 'self' data:",
  "manifest-src 'self'",
].join("; ");

/**
 * Header yang dipasang di setiap respons.
 *
 * HSTS hanya di produksi: memasangnya saat pengembangan akan memaksa browser
 * memakai HTTPS untuk localhost dan efeknya menempel berbulan-bulan.
 */
function headerKeamanan(_req, res, next) {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(self), geolocation=(self), microphone=()");
  if (config.isProd) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

module.exports = {
  CSP,
  headerKeamanan,
};

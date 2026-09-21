"use strict";

/**
 * Lapisan keamanan HTTP: header pengeras dan gerbang kode akses.
 *
 * Keduanya di satu berkas karena sama-sama dipasang sebelum route mana pun dan
 * sama-sama dikendalikan dari .env.
 */

const crypto = require("crypto");
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

/* ------------------------------------------------------------------ */
/* Gerbang kode akses                                                  */
/* ------------------------------------------------------------------ */

const NAMA_COOKIE = "sensus_akses";

/** Berlaku 30 hari - petugas tidak perlu mengetik ulang kodenya tiap hari kerja. */
const UMUR_COOKIE_DETIK = 30 * 24 * 3600;

/**
 * Nilai cookie: sidik jari dari kode akses, bukan kodenya sendiri.
 *
 * Diikat ke JWT_SECRET supaya cookie dari satu pemasangan tidak berlaku di
 * pemasangan lain, dan supaya mengganti kode akses (atau JWT_SECRET) langsung
 * membatalkan semua cookie yang beredar.
 */
function sidikAkses() {
  return crypto.createHmac("sha256", config.jwtSecret).update(`akses:${config.aksesKode}`).digest("hex");
}

/** Bandingkan tanpa membocorkan panjang kecocokan lewat waktu eksekusi. */
function samaAman(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Baca satu cookie dari header - tidak perlu pustaka untuk satu nama. */
function bacaCookie(req, nama) {
  const mentah = req.headers.cookie;
  if (!mentah) return "";
  for (const bagian of mentah.split(";")) {
    const pisah = bagian.indexOf("=");
    if (pisah === -1) continue;
    if (bagian.slice(0, pisah).trim() !== nama) continue;
    try {
      return decodeURIComponent(bagian.slice(pisah + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

function pasangCookieAkses(res) {
  const bagian = [
    `${NAMA_COOKIE}=${sidikAkses()}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${UMUR_COOKIE_DETIK}`,
  ];
  if (config.isProd) bagian.push("Secure");
  res.setHeader("Set-Cookie", bagian.join("; "));
}

const aksesAktif = () => Boolean(config.aksesKode);

/** Sudah pernah memasukkan kode akses yang benar? */
const punyaAkses = (req) => samaAman(bacaCookie(req, NAMA_COOKIE), sidikAkses());

/**
 * Endpoint yang tetap terbuka walau kode akses dipasang.
 *
 * /api/health dipakai Railway untuk healthcheck, /api/akses adalah tempat kode
 * ditukar dengan cookie, dan /api/auth/login harus bisa dicapai supaya admin
 * bisa masuk tanpa tahu kode akses petugas.
 */
const TERBUKA = new Set(["/health", "/akses", "/auth/login"]);

/**
 * Middleware: bila AKSES_KODE dipasang, seluruh /api butuh cookie akses yang
 * sah atau token admin.
 *
 * Sengaja memakai cookie, bukan header: `<img src="/api/foto/123">` tidak bisa
 * mengirim header Authorization, sehingga hanya cookie yang bisa ikut menutup
 * enumerasi foto.
 *
 * Bila AKSES_KODE kosong (bawaan), middleware ini tidak melakukan apa pun dan
 * aplikasi berperilaku persis seperti sebelumnya.
 */
function jagaAkses(req, res, next) {
  if (!aksesAktif()) return next();

  const jalur = req.path.replace(/\/+$/, "") || "/";
  if (TERBUKA.has(jalur)) return next();

  if (punyaAkses(req)) return next();

  // Admin yang membawa token sah tidak perlu kode akses.
  const header = req.headers.authorization || "";
  if (header.toLowerCase().startsWith("bearer ")) {
    try {
      require("jsonwebtoken").verify(header.slice(7).trim(), config.jwtSecret);
      return next();
    } catch {
      /* token tidak sah - jatuh ke penolakan di bawah */
    }
  }

  return res.status(401).json({
    error: "Masukkan kode akses untuk memakai aplikasi ini.",
    kode: "akses",
  });
}

module.exports = {
  CSP,
  headerKeamanan,
  jagaAkses,
  aksesAktif,
  punyaAkses,
  pasangCookieAkses,
  bacaCookie,
  samaAman,
  NAMA_COOKIE,
};

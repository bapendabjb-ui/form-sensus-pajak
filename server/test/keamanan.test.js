"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { CSP, susunCsp, headerKeamanan } = require("../src/keamanan");

/* ---------- perkakas tiruan ---------- */

const buatRes = () => {
  const res = {
    header: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) {
      this.header[k] = v;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  return res;
};

const buatReq = ({ path = "/petugas" } = {}) => ({ path, headers: {} });

/** Jalankan middleware, kembalikan true bila lolos ke next(). */
function lewat(middleware, req, res) {
  let lolos = false;
  middleware(req, res, () => {
    lolos = true;
  });
  return lolos;
}

/* ---------- header ---------- */

test("headerKeamanan memasang CSP dan pencegah clickjacking", () => {
  const res = buatRes();
  lewat(headerKeamanan, buatReq(), res);

  assert.equal(res.header["X-Frame-Options"], "DENY");
  assert.equal(res.header["X-Content-Type-Options"], "nosniff");
  assert.ok(res.header["Content-Security-Policy"].includes("frame-ancestors 'none'"));
  assert.ok(res.header["Content-Security-Policy"].includes("script-src 'self'"));
});

test("CSP mengizinkan host ubin peta yang benar-benar dipakai klien", () => {
  // Bila daftar ubin di client/src/lib/ubinPeta.js berubah, tes ini gagal lebih
  // dulu daripada peta yang diam-diam kosong di produksi.
  assert.ok(CSP.includes("https://tile.openstreetmap.org"));
  assert.ok(CSP.includes("https://server.arcgisonline.com"));
  assert.ok(CSP.includes("img-src 'self' data: blob:"));
  // Klien menguji sendiri apakah ubin OSM masih boleh dipakai; tanpa host ini
  // di connect-src, ujinya selalu gagal dan peta jalan selamanya memakai cadangan.
  assert.ok(CSP.includes("connect-src 'self' https://tile.openstreetmap.org"));
});

test("CSP tanpa kunci Google tetap ketat", () => {
  const csp = susunCsp(false);
  assert.ok(csp.includes("script-src 'self';"), "script-src hanya 'self'");
  assert.ok(!csp.includes("googleapis"));
  assert.ok(!csp.includes("unsafe-eval"));
});

test("CSP dengan kunci Google mengizinkan host Maps JavaScript API, tanpa unsafe-inline di script-src", () => {
  const csp = susunCsp(true);
  const arahan = (nama) => csp.split("; ").find((d) => d.startsWith(`${nama} `)) || "";

  assert.ok(arahan("script-src").includes("https://*.googleapis.com"));
  assert.ok(arahan("script-src").includes("'unsafe-eval'"), "dibutuhkan Maps JavaScript API");
  assert.ok(!arahan("script-src").includes("'unsafe-inline'"), "skrip Google dimuat lewat src, bukan inline");
  assert.ok(arahan("img-src").includes("https://*.gstatic.com"));
  assert.ok(arahan("connect-src").includes("https://*.googleapis.com"));
  // Peta cadangan harus tetap jalan bila Google gagal.
  assert.ok(arahan("img-src").includes("https://tile.openstreetmap.org"));
  assert.ok(arahan("img-src").includes("https://server.arcgisonline.com"));
});

test("Referrer-Policy masih mengirim asal ke penyedia ubin peta", () => {
  // same-origin akan menghapus Referer ke luar; OpenStreetMap memakai Referer
  // untuk mengenali aplikasi dan memblokir yang tidak mengenalkan diri.
  const res = buatRes();
  lewat(headerKeamanan, buatReq(), res);

  assert.equal(res.header["Referrer-Policy"], "strict-origin-when-cross-origin");
});

test("HSTS tidak dipasang di luar produksi", () => {
  const res = buatRes();
  lewat(headerKeamanan, buatReq(), res);
  assert.equal(res.header["Strict-Transport-Security"], undefined);
});

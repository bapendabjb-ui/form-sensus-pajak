"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const config = require("../src/config");
const {
  CSP,
  headerKeamanan,
  jagaAkses,
  aksesAktif,
  punyaAkses,
  pasangCookieAkses,
  bacaCookie,
  samaAman,
  NAMA_COOKIE,
} = require("../src/keamanan");

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

const buatReq = ({ path = "/petugas", cookie = "", auth = "" } = {}) => ({
  path,
  headers: { ...(cookie ? { cookie } : {}), ...(auth ? { authorization: auth } : {}) },
});

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
  // Bila daftar ubin di PetaLokasi.jsx / PetaSebaran.jsx berubah, tes ini gagal
  // lebih dulu daripada peta yang diam-diam kosong di produksi.
  assert.ok(CSP.includes("https://tile.openstreetmap.org"));
  assert.ok(CSP.includes("https://server.arcgisonline.com"));
  assert.ok(CSP.includes("img-src 'self' data: blob:"));
});

test("HSTS tidak dipasang di luar produksi", () => {
  const res = buatRes();
  lewat(headerKeamanan, buatReq(), res);
  assert.equal(res.header["Strict-Transport-Security"], undefined);
});

/* ---------- perkakas kecil ---------- */

test("bacaCookie hanya mengambil cookie yang namanya persis", () => {
  const req = buatReq({ cookie: "lain=1; sensus_akses=abc123; sensus_akses_lain=zzz" });
  assert.equal(bacaCookie(req, NAMA_COOKIE), "abc123");
  assert.equal(bacaCookie(req, "tidak_ada"), "");
  assert.equal(bacaCookie(buatReq(), NAMA_COOKIE), "");
});

test("samaAman menolak panjang berbeda tanpa melempar", () => {
  assert.equal(samaAman("rahasia", "rahasia"), true);
  assert.equal(samaAman("rahasia", "rahasia-panjang"), false);
  assert.equal(samaAman("", ""), true);
  assert.equal(samaAman(undefined, "x"), false);
});

/* ---------- gerbang kode akses ---------- */

test("jagaAkses tidak berbuat apa-apa bila AKSES_KODE kosong", () => {
  const asli = config.aksesKode;
  config.aksesKode = "";
  try {
    assert.equal(aksesAktif(), false);
    assert.equal(lewat(jagaAkses, buatReq(), buatRes()), true);
  } finally {
    config.aksesKode = asli;
  }
});

test("jagaAkses menutup /api saat AKSES_KODE dipasang", async (t) => {
  const asli = config.aksesKode;
  config.aksesKode = "kode-rahasia";
  t.after(() => {
    config.aksesKode = asli;
  });

  // Tanpa cookie: ditolak 401 dengan penanda "akses" yang dikenali klien.
  const res = buatRes();
  assert.equal(lewat(jagaAkses, buatReq(), res), false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.kode, "akses");

  // Endpoint yang harus tetap terbuka: healthcheck, penukaran kode, login admin.
  for (const path of ["/health", "/akses", "/auth/login"]) {
    assert.equal(lewat(jagaAkses, buatReq({ path }), buatRes()), true, `${path} harus terbuka`);
  }
});

test("cookie yang dipasang server diterima kembali oleh gerbang", () => {
  const asli = config.aksesKode;
  config.aksesKode = "kode-rahasia";
  try {
    const res = buatRes();
    pasangCookieAkses(res);
    const setCookie = res.header["Set-Cookie"];
    assert.ok(setCookie.includes("HttpOnly"), "cookie harus HttpOnly");
    assert.ok(setCookie.includes("SameSite=Lax"));

    const nilai = setCookie.split(";")[0].split("=")[1];
    const req = buatReq({ cookie: `${NAMA_COOKIE}=${nilai}` });
    assert.equal(punyaAkses(req), true);
    assert.equal(lewat(jagaAkses, req, buatRes()), true);

    // Mengganti kode akses membatalkan cookie yang sudah beredar.
    config.aksesKode = "kode-baru";
    assert.equal(punyaAkses(req), false);
  } finally {
    config.aksesKode = asli;
  }
});

test("token admin yang sah menggantikan kode akses", () => {
  const asli = config.aksesKode;
  config.aksesKode = "kode-rahasia";
  try {
    const token = jwt.sign({ sub: 1, role: "admin", ver: 0 }, config.jwtSecret, { expiresIn: "5m" });
    assert.equal(lewat(jagaAkses, buatReq({ auth: `Bearer ${token}` }), buatRes()), true);

    // Token palsu tidak.
    const palsu = jwt.sign({ sub: 1, role: "admin" }, "secret-lain", { expiresIn: "5m" });
    assert.equal(lewat(jagaAkses, buatReq({ auth: `Bearer ${palsu}` }), buatRes()), false);
  } finally {
    config.aksesKode = asli;
  }
});

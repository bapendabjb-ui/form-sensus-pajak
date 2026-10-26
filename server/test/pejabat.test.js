"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const config = require("../src/config");
const { bolehBagiPejabat, tolakTulisPejabat, signPejabatToken, perluPerpanjang } = require("../src/auth");

/*
 * Akun pejabat hanya untuk melihat. Penjaganya satu aturan di server untuk
 * seluruh /api, jadi rute baru yang menulis data otomatis tertutup bagi
 * pejabat tanpa perlu diingat satu per satu.
 */

test("pejabat boleh membuka semua halaman baca", () => {
  for (const p of ["/kertas-kerja", "/kertas-kerja/12", "/entri/5", "/peta", "/foto/9", "/dashboard/stats", "/petugas", "/formulir", "/auth/me"]) {
    assert.equal(bolehBagiPejabat("GET", p), true, p);
  }
  assert.equal(bolehBagiPejabat("HEAD", "/foto/9"), true);
});

test("pejabat tidak bisa cek NOP ke EPBB, apa pun bentuk alamatnya", () => {
  for (const p of ["/nop", "/nop/", "/nop/123456789012345678", "/nop/cari", "/NOP/123", "/Nop/cari/", "//nop/1"]) {
    assert.equal(bolehBagiPejabat("GET", p), false, p);
  }
});

test("pejabat tidak bisa menulis apa pun selain akunnya sendiri", () => {
  const tulis = [
    ["POST", "/kertas-kerja"],
    ["PUT", "/kertas-kerja/1/status"],
    ["PUT", "/kertas-kerja/1/titik"],
    ["PUT", "/kertas-kerja/1/rekam"],
    ["POST", "/kertas-kerja/1/entri"],
    ["PUT", "/entri/1"],
    ["DELETE", "/entri/1"],
    ["POST", "/foto"],
    ["POST", "/pengajuan-hapus"],
    ["DELETE", "/pengajuan-hapus/1"],
    ["POST", "/tautan-peta"],
    ["PATCH", "/kertas-kerja/1"],
    ["PUT", "/auth/password/x"],
  ];
  for (const [m, p] of tulis) assert.equal(bolehBagiPejabat(m, p), false, `${m} ${p}`);

  assert.equal(bolehBagiPejabat("PUT", "/auth/password"), true, "ganti password sendiri");
  assert.equal(bolehBagiPejabat("PUT", "/AUTH/Password/"), true);
  assert.equal(bolehBagiPejabat("POST", "/auth/keluar"), true);
  assert.equal(bolehBagiPejabat("POST", "/auth/login"), true, "berganti akun");
});

/** Jalankan penjaga dengan pemakai yang sudah dikenali; kembalikan galat yang diteruskan ke next(). */
function lewatPenjaga(method, path, pengguna) {
  return new Promise((selesai) => {
    const req = { method, path, headers: {}, _pengguna: Promise.resolve(pengguna) };
    tolakTulisPejabat(req, {}, (galat) => selesai(galat || null));
  });
}

test("penjaga menolak tulisan pejabat dengan 403, bukan 401", async () => {
  const galat = await lewatPenjaga("PUT", "/entri/1", { role: "pejabat", id: 1 });
  assert.equal(galat.status, 403, "401 akan membuat klien mengeluarkan pejabatnya");
  assert.equal(await lewatPenjaga("GET", "/entri/1", { role: "pejabat", id: 1 }), null);
});

test("penjaga tidak menyentuh admin, petugas, dan pemakai tanpa login", async () => {
  assert.equal(await lewatPenjaga("PUT", "/entri/1", { role: "admin", id: 1 }), null);
  assert.equal(await lewatPenjaga("PUT", "/entri/1", { role: "petugas", id: 1 }), null);
  assert.equal(await lewatPenjaga("PUT", "/entri/1", null), null);
});

test("token pejabat berumur 30 hari, membawa versi, dan diperpanjang seperti petugas", () => {
  const isi = jwt.verify(signPejabatToken({ id: 3, tokenVersi: 2 }), config.jwtSecret);
  assert.equal(isi.role, "pejabat");
  assert.equal(isi.sub, 3);
  assert.equal(isi.ver, 2);
  assert.equal(isi.exp - isi.iat, 30 * 24 * 3600);

  const sekarang = Date.UTC(2026, 9, 26, 8, 0, 0);
  const iat = (jamLalu) => Math.floor(sekarang / 1000) - jamLalu * 3600;
  assert.equal(perluPerpanjang({ role: "pejabat", iat: iat(25) }, sekarang), true);
  assert.equal(perluPerpanjang({ role: "pejabat", iat: iat(2) }, sekarang), false);
});

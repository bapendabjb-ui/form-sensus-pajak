"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const config = require("../src/config");
const { passwordLemah, signAdminToken, PASSWORD_MIN } = require("../src/auth");
const { padNomor, LEBAR_NOMOR } = require("../src/nomor");

/*
 * Penjaga terakhir sebelum akun admin dibuat di produksi. Nilai contoh di
 * .env.example pernah berisi "admin123"; kalau tersalin apa adanya ke server,
 * login admin praktis tidak ada gunanya.
 */
test("passwordLemah menolak nilai contoh dan yang terlalu pendek", () => {
  assert.equal(passwordLemah("admin123"), true);
  assert.equal(passwordLemah("Admin123"), true, "beda huruf besar-kecil tetap ditolak");
  assert.equal(passwordLemah("password"), true);
  assert.equal(passwordLemah(""), true);
  assert.equal(passwordLemah(undefined), true);
  assert.equal(passwordLemah("a".repeat(PASSWORD_MIN - 1)), true);
});

test("passwordLemah meloloskan password yang wajar", () => {
  assert.equal(passwordLemah("kantor-pajak-2026!"), false);
  assert.equal(passwordLemah("a".repeat(PASSWORD_MIN)), false);
});

/*
 * Inti pencabutan sesi: versi token ikut ditandatangani, dan requireAdmin
 * membandingkannya dengan angka di database.
 */
test("token admin membawa versi token", () => {
  const token = signAdminToken({ id: 3, username: "admin", tokenVersi: 7 });
  const isi = jwt.verify(token, config.jwtSecret);
  assert.equal(isi.sub, 3);
  assert.equal(isi.role, "admin");
  assert.equal(isi.ver, 7);
});

test("token admin lama tanpa versi diperlakukan sebagai versi 0", () => {
  const token = signAdminToken({ id: 1, username: "admin" });
  assert.equal(jwt.verify(token, config.jwtSecret).ver, 0);
});

test("padNomor menjaga lebar nomor kertas kerja", () => {
  assert.equal(padNomor(1), "0".repeat(LEBAR_NOMOR - 1) + "1");
  assert.equal(padNomor(12345).length, LEBAR_NOMOR);
});

/*
 * Sesi petugas diingat di HP: token 30 hari yang diperpanjang selama dipakai.
 * Sesi admin tidak: tetap berakhir 12 jam setelah login walau terus dipakai -
 * itu pengaman komputer kantor yang dipakai bersama.
 */
const { perluPerpanjang, signPetugasToken } = require("../src/auth");

const JAM = 60 * 60;

test("token admin berumur 12 jam", () => {
  const isi = jwt.verify(signAdminToken({ id: 1, username: "admin", tokenVersi: 0 }), config.jwtSecret);
  assert.equal(isi.exp - isi.iat, 12 * JAM);
});

test("token petugas berumur 30 hari dan membawa versi token", () => {
  const isi = jwt.verify(signPetugasToken({ id: 9, nama: "Andi", tokenVersi: 4 }), config.jwtSecret);
  assert.equal(isi.role, "petugas");
  assert.equal(isi.sub, 9);
  assert.equal(isi.ver, 4, "ganti password / dikeluarkan admin tetap bisa mencabutnya");
  assert.equal(isi.exp - isi.iat, 30 * 24 * JAM);
});

test("perluPerpanjang hanya untuk token petugas yang umurnya lewat sehari", () => {
  const sekarang = Date.UTC(2026, 9, 23, 8, 0, 0);
  const iat = (jamLalu) => Math.floor(sekarang / 1000) - jamLalu * JAM;

  assert.equal(perluPerpanjang({ role: "petugas", iat: iat(25) }, sekarang), true);
  assert.equal(perluPerpanjang({ role: "petugas", iat: iat(24) }, sekarang), true, "tepat sehari");
  assert.equal(perluPerpanjang({ role: "petugas", iat: iat(23) }, sekarang), false, "belum sehari: tidak tiap buka");
  assert.equal(perluPerpanjang({ role: "admin", iat: iat(11) }, sekarang), false, "sesi admin tidak diperpanjang");
  assert.equal(perluPerpanjang({ role: "admin", iat: iat(100) }, sekarang), false);
  assert.equal(perluPerpanjang(undefined, sekarang), false);
});

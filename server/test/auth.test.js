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

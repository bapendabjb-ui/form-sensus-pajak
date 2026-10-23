"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalUsername,
  galatUsername,
  galatPassword,
  usernameDariNama,
  usernameUnik,
  buatPassword,
  HURUF_PASSWORD,
} = require("../src/akunPetugas");
const { bacaCookie, readToken, bebasGerbang, gerbangMasuk } = require("../src/auth");

/*
 * Username & password akun petugas. Username dibuat dari nama saat admin
 * membuatkan akun massal, jadi aturannya harus menghasilkan sesuatu yang bisa
 * diketik di HP dan tidak pernah kembar.
 */

test("username dinormalkan ke huruf kecil tanpa spasi tepi", () => {
  assert.equal(normalUsername("  Andi.Saputra "), "andi.saputra");
  assert.equal(normalUsername(undefined), "");
});

test("galatUsername menerima bentuk wajar dan menolak sisanya", () => {
  for (const u of ["andi", "andi.saputra", "andi_s", "andi-s2", "198705122010011003"]) {
    assert.equal(galatUsername(u), "", u);
  }
  assert.match(galatUsername(""), /wajib/);
  assert.match(galatUsername("ab"), /minimal 3/);
  assert.match(galatUsername("a".repeat(65)), /maksimal 64/);
  assert.match(galatUsername("andi saputra"), /hanya boleh/, "spasi ditolak");
  assert.match(galatUsername(".andi"), /hanya boleh/, "harus diawali huruf atau angka");
  assert.match(galatUsername("andi@kantor"), /hanya boleh/);
});

test("galatPassword menjaga panjang minimal dan batas bcrypt", () => {
  assert.equal(galatPassword("abcd1234"), "");
  assert.match(galatPassword("abc"), /minimal 8/);
  assert.match(galatPassword(""), /minimal 8/);
  assert.match(galatPassword("é".repeat(40)), /maksimal 72/, "dihitung per byte, bukan per huruf");
});

test("usernameDariNama memakai dua kata pertama tanpa gelar", () => {
  assert.equal(usernameDariNama("Andi Saputra"), "andi.saputra");
  assert.equal(usernameDariNama("Andi Saputra Wijaya"), "andi.saputra");
  assert.equal(usernameDariNama("Andi Saputra, S.Kom"), "andi.saputra");
  assert.equal(usernameDariNama("H. Ahmad Fauzi, S.E."), "ahmad.fauzi");
  assert.equal(usernameDariNama("Drs. Muh. Ridwan"), "ridwan");
  assert.equal(usernameDariNama("Zé Ánna"), "ze.anna", "tanda diakritik dibuang");
  assert.equal(usernameDariNama("Nur'aini"), "nuraini");
});

test("usernameDariNama tetap menghasilkan username sah untuk nama yang aneh", () => {
  assert.equal(usernameDariNama("Ii"), "petugas.ii");
  assert.equal(usernameDariNama(""), "petugas");
  assert.equal(usernameDariNama("..."), "petugas");
  for (const nama of ["Ii", "", "A B", "Ünal Çelik", "x".repeat(200)]) {
    assert.equal(galatUsername(usernameDariNama(nama)), "", nama);
  }
});

test("usernameUnik memberi angka pada kembaran dan mencatat yang dipakai", () => {
  const terpakai = new Set(["andi.saputra", "admin"]);
  assert.equal(usernameUnik("andi.saputra", terpakai), "andi.saputra2");
  assert.equal(usernameUnik("andi.saputra", terpakai), "andi.saputra3", "kembaran dalam satu batch");
  assert.equal(usernameUnik("budi", terpakai), "budi");
  assert.ok(terpakai.has("budi"));
});

test("buatPassword acak, cukup panjang, dan tanpa huruf yang mudah tertukar", () => {
  const p = buatPassword();
  assert.equal(p.length, 10);
  assert.equal(galatPassword(p), "");
  assert.ok([...p].every((c) => HURUF_PASSWORD.includes(c)));
  for (const c of "0o1li") assert.equal(HURUF_PASSWORD.includes(c), false, c);
  const banyak = new Set(Array.from({ length: 200 }, () => buatPassword()));
  assert.equal(banyak.size, 200);
});

/*
 * Gerbang login. Jalur bebasnya sempit: tanpa login hanya bisa membuka
 * konfigurasi awal dan login itu sendiri.
 */

test("bebasGerbang hanya meloloskan login dan konfigurasi", () => {
  for (const p of ["/auth/login", "/auth/me", "/auth/keluar", "/konfigurasi", "/health"]) {
    assert.equal(bebasGerbang(p), true, p);
  }
  for (const p of ["/kertas-kerja", "/foto/12", "/petugas", "/nop/123", "/peta", "/authx", "/konfigurasi/x"]) {
    assert.equal(bebasGerbang(p), false, p);
  }
});

test("bacaCookie mengambil satu cookie dari header", () => {
  assert.equal(bacaCookie("a=1; sp_foto=abc.def; b=2", "sp_foto"), "abc.def");
  assert.equal(bacaCookie("sp_foto=x%3Dy", "sp_foto"), "x=y");
  assert.equal(bacaCookie("xsp_foto=1", "sp_foto"), "");
  assert.equal(bacaCookie(undefined, "sp_foto"), "");
  assert.equal(bacaCookie("sp_foto=%E0%A4%A", "sp_foto"), "", "pengodean rusak dianggap tidak ada");
});

test("readToken memakai cookie foto hanya untuk permintaan baca", () => {
  const req = (method, headers) => ({ method, headers });
  assert.equal(readToken(req("GET", { authorization: "Bearer t1", cookie: "sp_foto=t2" })), "t1");
  assert.equal(readToken(req("GET", { cookie: "sp_foto=t2" })), "t2");
  assert.equal(readToken(req("POST", { cookie: "sp_foto=t2" })), "", "aksi tulis tidak pernah lewat cookie");
  assert.equal(readToken(req("DELETE", { cookie: "sp_foto=t2" })), "");
});

/** Jalankan gerbang dengan permintaan tanpa token; kembalikan galat yang diteruskan ke next(). */
function lewatGerbang(path, wajib) {
  return new Promise((selesai) => {
    const req = { method: "GET", path, headers: {} };
    const res = { setHeader() {}, cookie() {} };
    gerbangMasuk(async () => wajib)(req, res, (galat) => selesai(galat || null));
  });
}

test("gerbang terbuka bagi semua selama login belum diwajibkan", async () => {
  assert.equal(await lewatGerbang("/kertas-kerja", false), null);
});

test("gerbang menolak tanpa login bila diwajibkan, kecuali jalur bebas", async () => {
  const galat = await lewatGerbang("/kertas-kerja", true);
  assert.equal(galat.status, 401);
  assert.equal(galat.details.perluMasuk, true, "klien perlu tahu ini soal login, bukan sesi habis");
  assert.equal(await lewatGerbang("/auth/login", true), null);
  assert.equal(await lewatGerbang("/konfigurasi", true), null);
});

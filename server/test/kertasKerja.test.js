"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Ketiganya memang diekspor routes/kertasKerja.js untuk diuji terpisah: murni,
// dan merekalah yang menentukan baris mana yang ikut terkirim ke klien.
const { bacaPaginasi, syaratCari, syaratSaring } = require("../src/routes/kertasKerja");

/*
 * Paginasi daftar kertas kerja. Query string datang dari klien apa adanya, jadi
 * yang dijaga di sini bukan hanya jalur normalnya, tetapi juga bahwa nilai
 * ngawur tidak bisa membuat server menarik seluruh tabel.
 */

test("bacaPaginasi memakai bawaan bila query kosong", () => {
  assert.deepEqual(bacaPaginasi({}), { hal: 1, per: 20, saring: "semua" });
  assert.deepEqual(bacaPaginasi(), { hal: 1, per: 20, saring: "semua" });
});

test("bacaPaginasi membaca nilai yang wajar", () => {
  assert.deepEqual(bacaPaginasi({ hal: "3", per: "50", saring: "kurang" }), {
    hal: 3,
    per: 50,
    saring: "kurang",
  });
});

test("bacaPaginasi membulatkan nilai ngawur ke batasnya", () => {
  // Inti penjagaannya: `per` sebesar apa pun tidak boleh menarik seluruh tabel.
  assert.equal(bacaPaginasi({ per: "100000" }).per, 100);
  assert.equal(bacaPaginasi({ per: "0" }).per, 20);
  assert.equal(bacaPaginasi({ per: "-5" }).per, 20);
  assert.equal(bacaPaginasi({ per: "abc" }).per, 20);
  assert.equal(bacaPaginasi({ per: "12.9" }).per, 12);

  assert.equal(bacaPaginasi({ hal: "0" }).hal, 1);
  assert.equal(bacaPaginasi({ hal: "-3" }).hal, 1);
  assert.equal(bacaPaginasi({ hal: "abc" }).hal, 1);
});

test("bacaPaginasi hanya menerima saringan yang dikenal", () => {
  for (const s of ["semua", "draft", "selesai", "kurang"]) {
    assert.equal(bacaPaginasi({ saring: s }).saring, s);
  }
  assert.equal(bacaPaginasi({ saring: "dihapus" }).saring, "semua");
  assert.equal(bacaPaginasi({ saring: "" }).saring, "semua");
});

/*
 * Pencarian & penyaringan pindah dari klien ke server saat daftar dipaginasi.
 * Aturannya harus tetap sama persis, kalau tidak hasil pencarian berubah diam-diam.
 */

test("syaratCari hanya memakai angka dari kata kunci", () => {
  // Mengetik "4" harus menemukan "00004" tanpa perlu menghitung nolnya.
  assert.deepEqual(syaratCari("4"), { nomor: { contains: "4" } });
  assert.deepEqual(syaratCari(" 00012 "), { nomor: { contains: "00012" } });
  assert.deepEqual(syaratCari("kk-12"), { nomor: { contains: "12" } });
});

test("syaratCari tidak menyaring apa pun bila kata kunci kosong", () => {
  assert.deepEqual(syaratCari(""), {});
  assert.deepEqual(syaratCari("   "), {});
  assert.deepEqual(syaratCari("abc"), {}, "huruf saja sama dengan tidak mencari");
  assert.deepEqual(syaratCari(undefined), {});
});

test("syaratSaring memetakan saringan ke syarat database", () => {
  assert.deepEqual(syaratSaring("draft"), { status: "draft" });
  assert.deepEqual(syaratSaring("selesai"), { status: "selesai" });
  // "Berkas tidak lengkap" sifat entri di dalamnya, bukan kolom kertas kerja.
  assert.deepEqual(syaratSaring("kurang"), { entri: { some: { berkasLengkap: false } } });
  assert.deepEqual(syaratSaring("semua"), {});
  assert.deepEqual(syaratSaring("ngawur"), {});
});

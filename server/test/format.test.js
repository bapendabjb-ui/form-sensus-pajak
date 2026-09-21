"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  lindungiSelCsv,
  buildCsv,
  csvNilai,
  formatNpwp,
  formatRtRw,
  formatLuas,
  formatNomorTelepon,
  groupNum,
} = require("../src/format");

/*
 * Isi data diketik petugas lewat endpoint yang terbuka tanpa login, sementara
 * yang membuka hasil ekspornya adalah admin. Sel yang terbaca sebagai rumus
 * karena itu harus dilucuti sebelum ditulis ke CSV.
 */
test("lindungiSelCsv melucuti sel yang akan dibaca sebagai rumus", () => {
  assert.equal(lindungiSelCsv("=1+1"), "'=1+1");
  assert.equal(lindungiSelCsv('=HYPERLINK("http://jahat","klik")'), '\'=HYPERLINK("http://jahat","klik")');
  assert.equal(lindungiSelCsv("+62812"), "'+62812");
  assert.equal(lindungiSelCsv("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(lindungiSelCsv("\tdipindah"), "'\tdipindah");
  assert.equal(lindungiSelCsv("-1+1+cmd|' /C calc'!A0"), "'-1+1+cmd|' /C calc'!A0");
});

test("lindungiSelCsv membiarkan teks & angka biasa apa adanya", () => {
  assert.equal(lindungiSelCsv("Budi Santoso"), "Budi Santoso");
  assert.equal(lindungiSelCsv(""), "");
  assert.equal(lindungiSelCsv("Jl. Mawar No. 5"), "Jl. Mawar No. 5");
  // Angka negatif aman dan harus tetap bisa dijumlah di Excel.
  assert.equal(lindungiSelCsv("-5"), "-5");
  assert.equal(lindungiSelCsv("-1.234,56"), "-1.234,56");
});

test("buildCsv memakai BOM, CRLF, kutip ganda, dan perlindungan rumus", () => {
  const csv = buildCsv([
    ["Nama", "Catatan"],
    ['Budi "Bud" S', "=cmd|' /C calc'!A0"],
  ]);
  assert.ok(csv.startsWith("\ufeff"), "BOM UTF-8 harus ada");
  assert.ok(csv.includes('"Budi ""Bud"" S"'), "kutip ganda harus di-escape");
  assert.ok(csv.includes("\"'=cmd|' /C calc'!A0\""), "rumus harus diberi apostrof");
  assert.ok(csv.endsWith("\r\n"));
});

test("csvNilai merangkum nilai per tipe pertanyaan", () => {
  assert.equal(csvNilai("wilayah", { kecamatan: "Landasan Ulin", kelurahan: "Guntung Payung" }),
    "Kel. Guntung Payung, Kec. Landasan Ulin");
  assert.equal(csvNilai("wilayah", { kecamatan: "Cempaka" }), "Kec. Cempaka");
  assert.equal(csvNilai("wilayah", {}), "");

  assert.equal(csvNilai("lokasi", { lat: -3.44, lon: 114.84, akurasi: 12.4 }), "-3.44, 114.84 (±12 m)");
  assert.equal(csvNilai("lokasi", { lat: -3.44, lon: 114.84, sumber: "peta" }), "-3.44, 114.84 (dipilih di peta)");
  assert.equal(csvNilai("lokasi", { lat: null, lon: null }), "");

  assert.equal(
    csvNilai("foto", [{ id: 7 }, { id: 9 }], { baseUrl: "https://contoh.test" }),
    "https://contoh.test/api/foto/7 ; https://contoh.test/api/foto/9"
  );

  assert.equal(csvNilai("telepon", [{ keterangan: "Pemilik", nomor: "081234567890" }]),
    "Pemilik - 0812-3456-7890");
});

test("format identitas tidak mengubah deret digit jadi angka hitung", () => {
  assert.equal(csvNilai("nik", "6371012345670001"), "6371012345670001");
  assert.equal(formatRtRw({ rt: "001", rw: "002" }), "RT 001 / RW 002");
  assert.equal(formatLuas({ tanah: 120, bangunan: 0 }), "Tanah 120 m² / Bangunan 0 m²");
  assert.equal(formatNomorTelepon("081234567890"), "0812-3456-7890");
  assert.equal(groupNum(1234567.5), "1.234.567,5");
  assert.ok(formatNpwp("123456789012345").includes("."));
});

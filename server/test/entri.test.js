"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Murni dan menentukan apa yang boleh diubah petugas pada data yang koordinatnya terkunci.
const { kunciKoordinat } = require("../src/routes/entri");

const formulir = {
  pertanyaan: [
    { id: 1, tipe: "text" },
    { id: 2, tipe: "lokasi" },
    { id: 3, tipe: "lokasi" },
  ],
};

test("kunciKoordinat mempertahankan koordinat tersimpan, isian lain tetap dari petugas", () => {
  const tersimpan = { 1: "Lama", 2: { lat: -3.44, lon: 114.83, sumber: "peta" } };
  const masuk = { 1: "Baru", 2: { lat: -3.1, lon: 114.1, sumber: "gps" }, 3: { lat: -3.2, lon: 114.2 } };
  const hasil = kunciKoordinat(formulir, masuk, tersimpan);
  assert.equal(hasil[1], "Baru");
  assert.deepEqual(hasil[2], tersimpan[2]);
  assert.equal(hasil[3], undefined, "koordinat yang belum pernah diisi tidak bisa ditambahkan diam-diam");
});

test("kunciKoordinat tahan kiriman kosong", () => {
  assert.deepEqual(kunciKoordinat(formulir, null, {}), {});
});

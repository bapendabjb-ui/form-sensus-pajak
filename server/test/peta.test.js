"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Kedua fungsi ini memang diekspor routes/peta.js untuk diuji terpisah:
// keduanya murni dan menentukan titik mana yang muncul di peta serta namanya.
const { punyaTitik, judulEntri } = require("../src/routes/peta");

test("punyaTitik menolak jawaban lokasi yang kosong", () => {
  // Jawaban lokasi yang belum diisi tetap tersimpan sebagai { lat: null, lon: null },
  // jadi penyaringan ini yang menjaga peta dari titik di tengah Samudra Atlantik.
  assert.equal(punyaTitik({ lat: null, lon: null }), false);
  assert.equal(punyaTitik(null), false);
  assert.equal(punyaTitik("bukan objek"), false);
  assert.equal(punyaTitik({ lat: "-3.44", lon: "114.84" }), false, "string bukan koordinat");
});

test("punyaTitik menerima koordinat di dalam rentang bumi", () => {
  assert.equal(punyaTitik({ lat: -3.4419, lon: 114.8409 }), true);
  assert.equal(punyaTitik({ lat: 0, lon: 0 }), true);
  assert.equal(punyaTitik({ lat: -90, lon: 180 }), true);
  assert.equal(punyaTitik({ lat: -91, lon: 114 }), false);
  assert.equal(punyaTitik({ lat: -3, lon: 181 }), false);
});

test("judulEntri memakai jawaban teks pertama sebagai nama titik", () => {
  const jawaban = [
    { pertanyaan: { tipe: "foto" }, nilai: [] },
    { pertanyaan: { tipe: "text" }, nilai: "  Warung Bu Siti  " },
    { pertanyaan: { tipe: "text" }, nilai: "Diabaikan" },
  ];
  assert.equal(judulEntri(jawaban), "Warung Bu Siti");
});

test("judulEntri melewati tipe yang bukan teks dan teks kosong", () => {
  assert.equal(
    judulEntri([
      { pertanyaan: { tipe: "number" }, nilai: "12345" },
      { pertanyaan: { tipe: "text" }, nilai: "   " },
      { pertanyaan: { tipe: "dropdown" }, nilai: "Hotel" },
    ]),
    "Hotel"
  );
  assert.equal(judulEntri([]), "", "tanpa jawaban teks, balon peta jatuh ke nama formulir");
  assert.equal(judulEntri(undefined), "");
});

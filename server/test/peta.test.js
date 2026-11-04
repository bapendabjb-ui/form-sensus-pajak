"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Fungsi-fungsi ini memang diekspor routes/peta.js untuk diuji terpisah:
// keduanya murni dan menentukan titik mana yang muncul di peta serta namanya.
const { punyaTitik, judulEntri, susunTitikPeta } = require("../src/routes/peta");

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

/* ---------- susunTitikPeta: satu titik per data berkoordinat ---------- */

const RUMAH = { lat: -3.4419, lon: 114.8409 };
const RUMAH_KEDUA = { lat: -3.47, lon: 114.8 };

const jawabTeks = (nilai) => ({ pertanyaan: { tipe: "text", urutan: 0 }, nilai });
const jawabLokasi = (t, sumber = "peta") => ({ pertanyaan: { tipe: "lokasi", urutan: 1 }, nilai: { ...t, akurasi: null, sumber } });

const entri = (id, jawaban = [], lain = {}) => ({
  id,
  berkasLengkap: true,
  catatanBerkas: "",
  updatedAt: new Date(2026, 9, id),
  formulir: { judul: `Formulir ${id}` },
  jawaban,
  ...lain,
});

const kk = (lain) => ({ id: 1, nomor: "00001", status: "draft", petugas: [], ...lain });

test("susunTitikPeta: satu titik per data yang mengisi pertanyaan Lokasi", () => {
  const t = susunTitikPeta([
    kk({
      entri: [
        entri(1, [jawabTeks("Bu Siti"), jawabLokasi(RUMAH)]),
        entri(2, [jawabTeks("Rumah kedua"), jawabLokasi(RUMAH_KEDUA)], { berkasLengkap: false }),
      ],
    }),
  ]);
  assert.equal(t.length, 2);
  assert.ok(t.every((x) => x.jenis === "data" && x.sumber === "formulir"));
  const kedua = t.find((x) => x.entriId === 2);
  assert.equal(kedua.lat, RUMAH_KEDUA.lat);
  assert.equal(kedua.judul, "Rumah kedua");
  assert.equal(kedua.formulir, "Formulir 2");
  assert.equal(kedua.berkasLengkap, false);
});

test("susunTitikPeta: data tanpa koordinat Lokasi tidak muncul (titik kertas kerja sudah dihapus)", () => {
  assert.deepEqual(susunTitikPeta([kk({ entri: [entri(1, [jawabTeks("Tanpa titik")])] })]), []);
  assert.deepEqual(susunTitikPeta([kk({ entri: [entri(1, [jawabLokasi({ lat: null, lon: null })])] })]), []);
});

test("susunTitikPeta: tanda sudah dicek mengikuti koordinat objek datanya", () => {
  const [t] = susunTitikPeta([kk({ entri: [entri(1, [jawabLokasi(RUMAH)], { koordinatDicekAt: new Date() })] })]);
  assert.equal(t.dicek, true);
});

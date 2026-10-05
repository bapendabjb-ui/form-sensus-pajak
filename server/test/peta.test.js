"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Kedua fungsi ini memang diekspor routes/peta.js untuk diuji terpisah:
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

/* ---------- susunTitikPeta: satu titik per kertas kerja ---------- */

const KANTOR_DEKAT = { lat: -3.43895, lon: 114.829525 };
const RUMAH = { lat: -3.4419, lon: 114.8409 };
const RUMAH_KEDUA = { lat: -3.4700, lon: 114.8000 };

const jawabTeks = (nilai) => ({ pertanyaan: { tipe: "text", urutan: 0 }, nilai });
const jawabLokasi = (t, sumber = "peta") => ({ pertanyaan: { tipe: "lokasi", urutan: 1 }, nilai: { ...t, akurasi: null, sumber } });

const entri = (id, gps, jawaban = [], lain = {}) => ({
  id,
  rekamLat: gps ? gps.lat : null,
  rekamLon: gps ? gps.lon : null,
  rekamAkurasi: gps ? 8 : null,
  berkasLengkap: true,
  catatanBerkas: "",
  updatedAt: new Date(2026, 9, id),
  formulir: { judul: `Formulir ${id}` },
  jawaban,
  ...lain,
});

const kk = (lain) => ({
  id: 1,
  nomor: "00001",
  status: "draft",
  titikLat: null,
  titikLon: null,
  titikAkurasi: null,
  titikSumber: "",
  petugas: [],
  ...lain,
});

test("susunTitikPeta: banyak data dalam satu kertas kerja menjadi satu titik", () => {
  const t = susunTitikPeta([
    kk({ entri: [entri(1, RUMAH, [jawabTeks("Bu Siti")]), entri(2, RUMAH), entri(3, KANTOR_DEKAT)] }),
  ]);
  assert.equal(t.length, 1);
  assert.equal(t[0].entriId, null);
  assert.equal(t[0].sumber, "gps");
  assert.equal(t[0].lat, RUMAH.lat, "GPS di lapangan, bukan yang di kantor");
  assert.equal(t[0].judul, "Bu Siti");
  assert.equal(t[0].jumlahData, 3);
});

test("susunTitikPeta: rumah kedua dari pertanyaan Lokasi PBB-P2 tampil terpisah", () => {
  const t = susunTitikPeta([
    kk({ entri: [entri(1, RUMAH), entri(2, RUMAH, [jawabTeks("Rumah kedua"), jawabLokasi(RUMAH_KEDUA)])] }),
  ]);
  assert.equal(t.length, 2);
  const objek = t.find((x) => x.entriId === 2);
  assert.equal(objek.sumber, "formulir");
  assert.equal(objek.lat, RUMAH_KEDUA.lat);
});

test("susunTitikPeta: koordinat Lokasi di tempat yang sama tidak digambar dua kali", () => {
  const t = susunTitikPeta([kk({ entri: [entri(1, RUMAH, [jawabLokasi(RUMAH)])] })]);
  assert.equal(t.length, 1);
  assert.equal(t[0].entriId, null);
});

test("susunTitikPeta: batas objek yang sama 50 m", () => {
  // 0,0004 derajat lintang ≈ 44 m: GPS dari jalan, koordinat OP di bangunan.
  const dekat = { lat: RUMAH.lat - 0.0004, lon: RUMAH.lon };
  assert.equal(susunTitikPeta([kk({ entri: [entri(1, RUMAH, [jawabLokasi(dekat)])] })]).length, 1);
  // 0,0006 derajat ≈ 67 m: dianggap objek lain.
  const jauh = { lat: RUMAH.lat - 0.0006, lon: RUMAH.lon };
  assert.equal(susunTitikPeta([kk({ entri: [entri(1, RUMAH, [jawabLokasi(jauh)])] })]).length, 2);
});

test("susunTitikPeta: titik yang ditetapkan didahulukan, berkas kurang terhitung", () => {
  const t = susunTitikPeta([
    kk({
      titikLat: RUMAH_KEDUA.lat,
      titikLon: RUMAH_KEDUA.lon,
      titikSumber: "peta",
      entri: [entri(1, KANTOR_DEKAT, [], { berkasLengkap: false })],
    }),
  ]);
  assert.equal(t[0].sumber, "koreksi");
  assert.equal(t[0].lat, RUMAH_KEDUA.lat);
  assert.equal(t[0].berkasLengkap, false);
  assert.equal(t[0].catatanBerkas, "1 data");
});

test("susunTitikPeta: kertas kerja tanpa titik sama sekali tidak muncul", () => {
  assert.deepEqual(susunTitikPeta([kk({ entri: [entri(1, null)] })]), []);
});

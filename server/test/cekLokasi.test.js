"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  jarakMeter,
  nilaiTitik,
  jawabanLokasiPertama,
  ringkasLokasiEntri,
} = require("../src/cekLokasi");
const { KANTOR, AKURASI_KASAR_M } = require("../src/batas");

// Sekitar 1,3 km dari kantor - titik "lapangan" yang wajar.
const LAPANGAN = { lat: -3.4419, lon: 114.8409 };
// Sekitar 25 m dari titik kantor: masih di gedung / halamannya.
const DEKAT_KANTOR = { lat: KANTOR.lat + 0.000225, lon: KANTOR.lon };
// Sekitar 100 m dari titik kantor: rumah tetangga, bukan kantor.
const TETANGGA_KANTOR = { lat: KANTOR.lat + 0.0009, lon: KANTOR.lon };

let urut = 0;
const entriGps = (titik, akurasi = 8) => ({ id: ++urut, rekamLat: titik.lat, rekamLon: titik.lon, rekamAkurasi: akurasi });

test("jarakMeter menghitung jarak di permukaan bumi", () => {
  assert.equal(jarakMeter(LAPANGAN, LAPANGAN), 0);
  // 0,001 derajat lintang ≈ 111 m.
  const d = jarakMeter({ lat: -3.44, lon: 114.83 }, { lat: -3.441, lon: 114.83 });
  assert.ok(d > 110 && d < 112, `jarak ${d}`);
  assert.ok(jarakMeter(KANTOR, DEKAT_KANTOR) < KANTOR.radiusM);
  assert.ok(jarakMeter(KANTOR, LAPANGAN) > 1000);
});

test("nilaiTitik membedakan tanpa, kantor, kasar, dan baik", () => {
  assert.equal(nilaiTitik(null), "tanpa");
  assert.equal(nilaiTitik({ lat: null, lon: null }), "tanpa");
  assert.equal(nilaiTitik({ ...DEKAT_KANTOR, akurasi: 5 }), "kantor");
  assert.equal(nilaiTitik({ ...LAPANGAN, akurasi: AKURASI_KASAR_M + 1 }), "kasar");
  assert.equal(nilaiTitik({ ...LAPANGAN, akurasi: AKURASI_KASAR_M }), "baik");
  assert.equal(nilaiTitik({ ...LAPANGAN, akurasi: null }), "baik", "akurasi tak diketahui tidak dianggap kasar");
  // Laptop kantor: posisi dari Wi-Fi, akurasinya ratusan meter, titiknya di kantor.
  assert.equal(nilaiTitik({ ...KANTOR, akurasi: 900 }), "kantor");
});

test("nilaiTitik: rumah sekitar 100 m dari kantor tidak dianggap di kantor", () => {
  const jarak = jarakMeter(KANTOR, TETANGGA_KANTOR);
  assert.ok(jarak > KANTOR.radiusM && jarak < 150, `jarak ${jarak}`);
  assert.equal(nilaiTitik({ ...TETANGGA_KANTOR, akurasi: 8 }), "baik");
});

test("nilaiTitik: titik yang ditunjuk di peta tidak diperiksa terhadap kantor", () => {
  // Objek yang memang bertetangga dengan kantor harus bisa ditandai.
  assert.equal(nilaiTitik({ ...DEKAT_KANTOR, akurasi: null, manual: true }), "baik");
});

test("jawabanLokasiPertama memakai jawaban terisi pertama sesuai urutan formulir", () => {
  const jawaban = { 7: { lat: null, lon: null }, 9: { ...LAPANGAN, sumber: "gps" }, 3: { lat: 1, lon: 1 } };
  assert.deepEqual(jawabanLokasiPertama([7, 9, 3], jawaban), jawaban[9]);
  assert.equal(jawabanLokasiPertama([], jawaban), null);
  assert.equal(jawabanLokasiPertama([7], jawaban), null);
});

test("ringkasLokasiEntri: koordinat objek lain diperiksa terpisah dari GPS asli", () => {
  const e = entriGps(LAPANGAN);
  assert.deepEqual(ringkasLokasiEntri(e, null), { gps: "baik", objek: null, dicek: null });
  // Koordinat rumah kedua diambil dengan tombol GPS di kantor: keliru.
  assert.equal(ringkasLokasiEntri(e, { ...DEKAT_KANTOR, akurasi: 6, sumber: "gps" }).objek, "kantor");
  // Ditunjuk di peta / ditempel dari Google Maps: dipercaya.
  assert.equal(ringkasLokasiEntri(e, { ...DEKAT_KANTOR, akurasi: null, sumber: "peta" }).objek, "baik");
});

test("ringkasLokasiEntri: koordinat objek yang dicek admin terverifikasi", () => {
  const e = { ...entriGps(LAPANGAN), koordinatDicekAt: new Date(), koordinatDicekOleh: "admin" };
  const r = ringkasLokasiEntri(e, { ...DEKAT_KANTOR, akurasi: 6, sumber: "gps" });
  assert.equal(r.objek, "baik");
  assert.equal(r.dicek.oleh, "admin");
});

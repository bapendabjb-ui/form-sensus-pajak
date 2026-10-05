"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { jarakMeter, nilaiTitik, jawabanLokasiPertama, titikObjek, ringkasLokasi } = require("../src/cekLokasi");
const { KANTOR, AKURASI_KASAR_M } = require("../src/batas");

// Sekitar 1,3 km dari kantor - titik "lapangan" yang wajar.
const LAPANGAN = { lat: -3.4419, lon: 114.8409 };
// Sekitar 50 m dari titik kantor.
const DEKAT_KANTOR = { lat: KANTOR.lat + 0.00045, lon: KANTOR.lon };

const entriGps = (titik, akurasi = 8) => ({ rekamLat: titik.lat, rekamLon: titik.lon, rekamAkurasi: akurasi });

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
});

test("nilaiTitik: area kantor didahulukan dari akurasi kasar", () => {
  // Laptop kantor: posisi dari Wi-Fi, akurasinya ratusan meter, titiknya di kantor.
  assert.equal(nilaiTitik({ ...KANTOR, akurasi: 900 }), "kantor");
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

test("titikObjek: koreksi > jawaban Lokasi > GPS asli", () => {
  const gps = entriGps(DEKAT_KANTOR);
  const jawaban = { ...LAPANGAN, akurasi: 12, sumber: "gps" };

  assert.equal(titikObjek(gps, null).sumber, "gps");
  assert.equal(titikObjek(gps, jawaban).sumber, "formulir");
  assert.equal(titikObjek({ ...gps, koreksiLat: -3.45, koreksiLon: 114.84 }, jawaban).sumber, "koreksi");
  assert.equal(titikObjek({ rekamLat: null, rekamLon: null }, null), null);
});

test("ringkasLokasi: GPS asli di kantor perlu diperiksa", () => {
  const r = ringkasLokasi(entriGps(DEKAT_KANTOR), null);
  assert.deepEqual(r, { status: "kantor", gps: "kantor", sumber: "gps", jarakM: null, jauh: false });
});

test("ringkasLokasi: koreksi di peta menyelesaikan pemeriksaan, GPS asli tetap tercatat", () => {
  const e = { ...entriGps(DEKAT_KANTOR), koreksiLat: LAPANGAN.lat, koreksiLon: LAPANGAN.lon };
  const r = ringkasLokasi(e, null);
  assert.equal(r.status, "baik");
  assert.equal(r.gps, "kantor", "bukti kunjungan tidak ikut berubah");
  assert.equal(r.sumber, "koreksi");
  assert.ok(r.jarakM > 1000);
  assert.equal(r.jauh, false, "jarak jauh dari GPS kantor bukan tanda bahaya - memang itu yang dikoreksi");
});

test("ringkasLokasi: koreksi jauh dari GPS asli yang baik disorot", () => {
  const e = { ...entriGps(LAPANGAN), koreksiLat: KANTOR.lat - 0.01, koreksiLon: KANTOR.lon };
  const r = ringkasLokasi(e, null);
  assert.equal(r.status, "baik");
  assert.equal(r.jauh, true);
});

test("ringkasLokasi: jawaban Lokasi dari GPS di kantor juga diperiksa", () => {
  const r = ringkasLokasi(entriGps(LAPANGAN), { ...DEKAT_KANTOR, akurasi: 6, sumber: "gps" });
  assert.equal(r.status, "kantor");
  assert.equal(r.sumber, "formulir");
});

test("ringkasLokasi: data tanpa titik sama sekali", () => {
  assert.deepEqual(ringkasLokasi({ rekamLat: null, rekamLon: null }, null), {
    status: "tanpa",
    gps: "tanpa",
    sumber: null,
    jarakM: null,
    jauh: false,
  });
});

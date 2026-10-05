"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  jarakMeter,
  nilaiTitik,
  gpsTerbaik,
  titikKk,
  ringkasLokasiKk,
  jawabanLokasiPertama,
  ringkasLokasiEntri,
} = require("../src/cekLokasi");
const { KANTOR, AKURASI_KASAR_M } = require("../src/batas");

// Sekitar 1,3 km dari kantor - titik "lapangan" yang wajar.
const LAPANGAN = { lat: -3.4419, lon: 114.8409 };
// Sekitar 50 m dari titik kantor.
const DEKAT_KANTOR = { lat: KANTOR.lat + 0.00045, lon: KANTOR.lon };

let urut = 0;
const entriGps = (titik, akurasi = 8) => ({ id: ++urut, rekamLat: titik.lat, rekamLon: titik.lon, rekamAkurasi: akurasi });
const entriTanpaGps = () => ({ id: ++urut, rekamLat: null, rekamLon: null, rekamAkurasi: null });
const KK_KOSONG = { titikLat: null, titikLon: null, titikAkurasi: null, titikSumber: "" };

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

test("nilaiTitik: titik yang ditunjuk di peta tidak diperiksa terhadap kantor", () => {
  // Objek yang memang bertetangga dengan kantor harus bisa ditandai.
  assert.equal(nilaiTitik({ ...DEKAT_KANTOR, akurasi: null, manual: true }), "baik");
});

test("gpsTerbaik mendahulukan GPS di lapangan, lalu yang paling teliti", () => {
  const kantor = entriGps(DEKAT_KANTOR, 3);
  const kasar = entriGps(LAPANGAN, 400);
  const baik = entriGps(LAPANGAN, 20);
  const baikSekali = entriGps(LAPANGAN, 6);
  assert.equal(gpsTerbaik([kantor, kasar, baik, baikSekali]).entriId, baikSekali.id);
  assert.equal(gpsTerbaik([kantor, kasar]).entriId, kasar.id, "kasar di luar kantor lebih berguna daripada teliti di kantor");
  assert.equal(gpsTerbaik([entriTanpaGps()]), null);
});

test("titikKk: titik yang ditetapkan > GPS terbaik datanya", () => {
  const entri = [entriGps(DEKAT_KANTOR), entriGps(LAPANGAN)];
  assert.equal(titikKk(KK_KOSONG, entri).sumber, "gps");
  assert.equal(titikKk({ ...KK_KOSONG, titikLat: -3.45, titikLon: 114.84, titikSumber: "peta" }, entri).sumber, "koreksi");
  const rekam = titikKk({ titikLat: -3.45, titikLon: 114.84, titikAkurasi: 7, titikSumber: "gps" }, entri);
  assert.equal(rekam.sumber, "rekam");
  assert.equal(rekam.akurasi, 7);
  assert.equal(titikKk(KK_KOSONG, []), null);
});

test("ringkasLokasiKk: satu data di lapangan cukup, walau data lain diisi di kantor", () => {
  const r = ringkasLokasiKk(KK_KOSONG, [entriGps(LAPANGAN), entriGps(DEKAT_KANTOR), entriTanpaGps()]);
  assert.equal(r.status, "baik");
  assert.equal(r.sumber, "gps");
  assert.deepEqual(r.gps, { baik: 1, kasar: 0, kantor: 1, tanpa: 1 });
});

test("ringkasLokasiKk: semua GPS di kantor perlu diperiksa", () => {
  const r = ringkasLokasiKk(KK_KOSONG, [entriGps(DEKAT_KANTOR), entriGps(DEKAT_KANTOR)]);
  assert.equal(r.status, "kantor");
  assert.equal(r.jarakM, null);
});

test("ringkasLokasiKk: koreksi di peta menyelesaikan pemeriksaan, hitungan GPS tetap jujur", () => {
  const kk = { ...KK_KOSONG, titikLat: LAPANGAN.lat, titikLon: LAPANGAN.lon, titikSumber: "peta", titikOleh: "petugas" };
  const r = ringkasLokasiKk(kk, [entriGps(DEKAT_KANTOR)]);
  assert.equal(r.status, "baik");
  assert.equal(r.sumber, "koreksi");
  assert.equal(r.oleh, "petugas");
  assert.equal(r.gps.kantor, 1, "bukti kunjungan tidak ikut berubah");
  assert.equal(r.jarakM, null, "tidak ada GPS lapangan untuk dibandingkan");
});

test("ringkasLokasiKk: titik yang ditunjuk jauh dari GPS lapangan disorot", () => {
  const kk = { ...KK_KOSONG, titikLat: KANTOR.lat - 0.01, titikLon: KANTOR.lon, titikSumber: "peta" };
  const r = ringkasLokasiKk(kk, [entriGps(LAPANGAN)]);
  assert.equal(r.status, "baik");
  assert.ok(r.jarakM > 500);
  assert.equal(r.jauh, true);
});

test("ringkasLokasiKk: kertas kerja tanpa data dan tanpa titik", () => {
  const r = ringkasLokasiKk(KK_KOSONG, []);
  assert.equal(r.status, "tanpa");
  assert.equal(r.sumber, null);
  assert.equal(r.titik, null);
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

test("titik yang sudah dicek admin dianggap terverifikasi walau dekat kantor", () => {
  const kk = { ...KK_KOSONG, lokasiDicekAt: new Date(), lokasiDicekOleh: "admin" };
  const r = ringkasLokasiKk(kk, [entriGps(DEKAT_KANTOR)]);
  assert.equal(r.status, "baik");
  assert.deepEqual(r.dicek, { oleh: "admin", waktu: kk.lokasiDicekAt });
  assert.equal(ringkasLokasiKk(KK_KOSONG, [entriGps(DEKAT_KANTOR)]).dicek, null);
});

test("titikKk: GPS data yang dibekukan saat dicek tetap tampil sebagai GPS data", () => {
  const kk = { titikLat: LAPANGAN.lat, titikLon: LAPANGAN.lon, titikAkurasi: 9, titikSumber: "data", lokasiDicekAt: new Date() };
  const t = titikKk(kk, [entriGps(DEKAT_KANTOR)]);
  assert.equal(t.sumber, "gps");
  assert.equal(t.lat, LAPANGAN.lat, "bekuan tidak bergeser oleh data lain");
  assert.equal(t.akurasi, 9);
});

test("ringkasLokasiEntri: koordinat objek yang dicek admin terverifikasi", () => {
  const e = { ...entriGps(LAPANGAN), koordinatDicekAt: new Date(), koordinatDicekOleh: "admin" };
  const r = ringkasLokasiEntri(e, { ...DEKAT_KANTOR, akurasi: 6, sumber: "gps" });
  assert.equal(r.objek, "baik");
  assert.equal(r.dicek.oleh, "admin");
});

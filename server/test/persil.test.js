"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  UKURAN_PETAK,
  rapikanGeometri,
  titikDalam,
  rapikanAtribut,
  kunciWilayah,
  bacaFiturImpor,
  bacaKiriman,
  bacaToken,
  nibLengkap,
  bacaKueriNib,
  pilihDiTitik,
  petakTitik,
  batasPetak,
  teksKoleksi,
} = require("../src/persil");

/*
 * Persil BPN dikirim browser admin yang sudah mengubah koordinatnya ke WGS 84
 * (client/src/lib/shapefile.js). Server memeriksanya ulang: bidang di luar
 * Banjarbaru hampir pasti salah sistem koordinat dan tidak boleh tersimpan,
 * dan petak / kunci wilayahnya menentukan apa yang tampil di peta dan apa yang
 * diganti saat impor ulang.
 */

/** Persegi di sekitar (lon, lat) selebar `d` derajat. */
const kotak = (lon, lat, d = 0.0002) => [
  [lon, lat],
  [lon, lat + d],
  [lon + d, lat + d],
  [lon + d, lat],
  [lon, lat],
];

// Loktabat Selatan, Banjarbaru.
const LON = 114.821768;
const LAT = -3.448741;

const bidang = (lebih = {}) => ({
  nib: "03612",
  kodeWilayah: "17117402",
  kecamatan: "Banjarbaru Selatan",
  kelurahan: "Loktabat Selatan",
  tipeHak: "Hak Milik",
  luasPeta: 566.841999,
  atribut: { PENGGUNAAN: "Kosong", TAHUN: 0, KOSONG: "" },
  geometri: { type: "Polygon", coordinates: [kotak(LON, LAT)] },
  ...lebih,
});

test("bacaFiturImpor: kotak, petak, kunci wilayah, dan pembulatan", () => {
  const { data, alasan } = bacaFiturImpor(bidang());
  assert.equal(alasan, undefined);
  assert.equal(data.nib, "03612");
  assert.equal(data.luasPeta, 566.84);
  assert.equal(data.kunciWilayah, "kode:17117402");
  assert.deepEqual(JSON.parse(data.atribut), { PENGGUNAAN: "Kosong", TAHUN: 0 });
  assert.equal(data.minLat, LAT);
  assert.equal(data.maxLon, Math.round((LON + 0.0002) * 1e6) / 1e6);
  assert.equal(data.selLat, Math.floor(LAT / UKURAN_PETAK));
  assert.equal(data.selLon, Math.floor(LON / UKURAN_PETAK));
  assert.equal(data.besar, false);
  assert.equal(JSON.parse(data.geometri).type, "Polygon");
});

test("bacaFiturImpor: bidang lebih lebar dari satu petak ditandai besar", () => {
  const { data } = bacaFiturImpor(bidang({ geometri: { type: "Polygon", coordinates: [kotak(LON, LAT, 0.006)] } }));
  assert.equal(data.besar, true);
});

test("bacaFiturImpor: koordinat di luar Banjarbaru (salah sistem koordinat) ditolak", () => {
  // TM-3 yang terbaca sebagai UTM 50S jatuh di sekitar lintang -80.
  assert.equal(bacaFiturImpor(bidang({ geometri: { type: "Polygon", coordinates: [kotak(113.9, -80.2)] } })).alasan, "di luar wilayah");
  // Satu bidang Cempaka di data BPN: x 458373 -> ±330 km ke timur.
  assert.equal(bacaFiturImpor(bidang({ geometri: { type: "Polygon", coordinates: [kotak(117.83, -3.51)] } })).alasan, "di luar wilayah");
  // Angka meter mentah yang tidak diubah.
  assert.equal(bacaFiturImpor(bidang({ geometri: { type: "Polygon", coordinates: [kotak(125000, 1119000, 10)] } })).alasan, "di luar wilayah");
});

test("bacaFiturImpor: bentuk rusak ditolak, bukan disimpan", () => {
  assert.equal(bacaFiturImpor(bidang({ geometri: null })).alasan, "tanpa bentuk");
  assert.equal(bacaFiturImpor(bidang({ geometri: { type: "Point", coordinates: [LON, LAT] } })).alasan, "tanpa bentuk");
  const duaTitik = [
    [LON, LAT],
    [LON + 0.001, LAT],
  ];
  assert.equal(bacaFiturImpor(bidang({ geometri: { type: "Polygon", coordinates: [duaTitik] } })).alasan, "tanpa bentuk");
  assert.equal(bacaFiturImpor(null).alasan, "bukan bidang");
});

test("rapikanGeometri: cincin ditutup, titik kembar dibuang, lubang rusak dibuang", () => {
  const terbuka = kotak(LON, LAT).slice(0, 4);
  const g = rapikanGeometri({ type: "Polygon", coordinates: [terbuka, [[LON, LAT]]] });
  assert.equal(g.coordinates.length, 1);
  assert.deepEqual(g.coordinates[0][0], g.coordinates[0][4]);
  // MultiPolygon berisi satu poligon sah = Polygon.
  const m = rapikanGeometri({ type: "MultiPolygon", coordinates: [[kotak(LON, LAT)], [[[1, 2]]]] });
  assert.equal(m.type, "Polygon");
});

test("titikDalam: lubang tidak termasuk, MultiPolygon dicek semua", () => {
  const luar = kotak(LON, LAT, 0.001);
  const lubang = kotak(LON + 0.0004, LAT + 0.0004, 0.0002);
  const g = { type: "Polygon", coordinates: [luar, lubang] };
  assert.equal(titikDalam(g, LON + 0.0001, LAT + 0.0001), true);
  assert.equal(titikDalam(g, LON + 0.0005, LAT + 0.0005), false);
  assert.equal(titikDalam(g, LON - 0.0001, LAT), false);
  const multi = { type: "MultiPolygon", coordinates: [[kotak(LON, LAT)], [kotak(LON + 0.01, LAT)]] };
  assert.equal(titikDalam(multi, LON + 0.0101, LAT + 0.0001), true);
});

test("pilihDiTitik: bidang bertumpuk -> yang terkecil", () => {
  const baris = (id, d, luasPeta) => ({
    id,
    luasPeta,
    geometri: JSON.stringify({ type: "Polygon", coordinates: [kotak(LON, LAT, d)] }),
    minLon: LON,
    minLat: LAT,
    maxLon: LON + d,
    maxLat: LAT + d,
  });
  const calon = [baris(1, 0.001, 1200), baris(2, 0.0003, 100), baris(3, 0.002, 4800)];
  assert.equal(pilihDiTitik(calon, LAT + 0.0001, LON + 0.0001).id, 2);
  assert.equal(pilihDiTitik(calon, LAT + 0.0008, LON + 0.0008).id, 1);
  assert.equal(pilihDiTitik(calon, LAT - 0.001, LON), null);
});

test("petak: titik selalu di dalam batas petaknya, juga di lintang selatan", () => {
  const { i, j } = petakTitik(LAT, LON);
  const b = batasPetak(i, j);
  assert.ok(b.s <= LAT && LAT < b.n);
  assert.ok(b.w <= LON && LON < b.e);
  assert.ok(j < 0);
});

test("kunciWilayah: kode BPN, lalu nama kecamatan + kelurahan, lalu nama berkas", () => {
  assert.equal(kunciWilayah({ kodeWilayah: "17117402", kecamatan: "A", kelurahan: "B" }), "kode:17117402");
  assert.equal(kunciWilayah({ kodeWilayah: "", kecamatan: "Cempaka", kelurahan: "Palam" }), "nama:cempaka|palam");
  assert.equal(kunciWilayah({ kodeWilayah: "", kecamatan: "", kelurahan: "" }, "CempakaOK"), "berkas:cempakaok");
});

test("rapikanAtribut: hanya teks / angka / ya-tidak, jumlahnya dibatasi", () => {
  const banyak = Object.fromEntries(Array.from({ length: 40 }, (_, k) => [`K${k}`, k]));
  assert.equal(Object.keys(rapikanAtribut(banyak)).length, 30);
  assert.deepEqual(rapikanAtribut({ A: { x: 1 }, B: [1], C: true, D: "  x  ", E: 1.23456 }), { C: true, D: "x", E: 1.235 });
  assert.deepEqual(rapikanAtribut("bukan objek"), {});
});

test("bacaKiriman: jumlah bidang ditolak per alasan; kiriman kosong / kebesaran ditolak", () => {
  const h = bacaKiriman({ sumber: "Uji", fitur: [bidang(), bidang({ geometri: null }), bidang({ geometri: null })] });
  assert.equal(h.baris.length, 1);
  assert.deepEqual(h.ditolak, { "tanpa bentuk": 2 });
  assert.throws(() => bacaKiriman({ fitur: [] }), /tidak berisi/);
  assert.throws(() => bacaKiriman({ fitur: Array(3001).fill(bidang()) }), /Paling banyak/);
});

test("bacaToken: hanya token buatan server", () => {
  assert.equal(bacaToken("0123456789abcdef01234567"), "0123456789abcdef01234567");
  assert.throws(() => bacaToken("../../etc"), /tidak sah/);
});

test("nibLengkap: kode wilayah 8 digit + NIB 5 digit bertitik", () => {
  assert.equal(nibLengkap("17117402", "03612"), "17.11.74.02.03612");
  assert.equal(nibLengkap("", "03612"), "03612");
  assert.equal(nibLengkap("1711", "3612"), "1711.3612");
});

test("bacaKueriNib: NIB pendek dengan / tanpa nol depan, NIB lengkap 13 digit", () => {
  assert.deepEqual(bacaKueriNib("3612").nib.sort(), ["03612", "3612"]);
  assert.deepEqual(bacaKueriNib("03612").nib.sort(), ["03612", "3612"]);
  assert.deepEqual(bacaKueriNib("17.11.74.02.03612"), { kodeWilayah: "17117402", nib: ["03612"] });
  assert.equal(bacaKueriNib("  "), null);
  assert.throws(() => bacaKueriNib("12345678901234"), /13 digit/);
});

test("teksKoleksi: FeatureCollection sah dengan id bidang dan keterangan balon", () => {
  const { data } = bacaFiturImpor(bidang());
  const koleksi = JSON.parse(teksKoleksi([{ id: 7, ...data }]));
  assert.equal(koleksi.type, "FeatureCollection");
  const [f] = koleksi.features;
  assert.equal(f.id, 7);
  assert.equal(f.geometry.type, "Polygon");
  assert.deepEqual(f.properties, {
    nib: "17.11.74.02.03612",
    tipeHak: "Hak Milik",
    luasPeta: 566.84,
    kelurahan: "Loktabat Selatan",
    kecamatan: "Banjarbaru Selatan",
    lain: { PENGGUNAAN: "Kosong", TAHUN: 0 },
  });
});

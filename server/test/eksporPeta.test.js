"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { susunTabel } = require("../src/ekspor");
const { namaAtribut, keFitur, keGeojson, keKml } = require("../src/eksporPeta");

/*
 * Ekspor GeoJSON / KML = tabel Excel yang sama, satu titik per baris. Koordinat
 * dari kolom Lokasi pertama yang terisi; baris tanpa koordinat tidak ikut.
 */

const opsi = { baseUrl: "", timezone: "Asia/Makassar" };

const FORM_WP = { id: 1, judul: "WP", pertanyaan: [{ id: 101, tipe: "text", label: "Nama" }] };
const FORM_OBJEK = {
  id: 2,
  judul: "Objek",
  pertanyaan: [
    { id: 201, tipe: "text", label: "NOP" },
    { id: 202, tipe: "number", label: "Luas" },
    { id: 203, tipe: "lokasi", label: "Titik" },
  ],
};

const kk = (id, nomor) => ({ id, nomor, status: "selesai", petugas: [] });
const KK1 = kk(1, "00001");
const KK2 = kk(2, "00002");

let idEntri = 0;
const isian = (k, formulirId, jawaban) => ({
  kk: k,
  e: {
    id: ++idEntri,
    formulirId,
    createdAt: new Date(idEntri * 1000),
    jawaban: Object.entries(jawaban).map(([pertanyaanId, nilai]) => ({ pertanyaanId: Number(pertanyaanId), nilai })),
  },
});

const data = [
  isian(KK1, 1, { 101: "Budi & Ani <CV>" }),
  isian(KK1, 2, { 201: "NOP-1", 202: 250, 203: { lat: -3.4412345, lon: 114.8412345, akurasi: 8, sumber: "gps" } }),
  isian(KK1, 2, { 201: "NOP-2", 203: { lat: null, lon: null } }),
  isian(KK2, 2, { 201: "NOP-3", 202: 90, 203: { lat: -3.45, lon: 114.83, akurasi: null, sumber: "peta" } }),
];

test("tabel ekspor menandai letak kolom latitude & longitude", () => {
  const perData = susunTabel(data, [FORM_OBJEK], { perData: true, ...opsi });
  assert.equal(perData.titik.length, 1);
  const [iLat, iLon] = perData.titik[0];
  assert.equal(perData.header[iLat], "Objek - Titik (Latitude)");
  assert.equal(perData.header[iLon], "Objek - Titik (Longitude)");

  const perKk = susunTabel(data, [FORM_WP, FORM_OBJEK], { perData: false, ...opsi });
  const [jLat, jLon] = perKk.titik[0];
  assert.equal(perKk.header[jLat], "Objek - Titik (Latitude)");
  assert.equal(perKk.header[jLon], "Objek - Titik (Longitude)");
});

test("keFitur: satu titik per baris berkoordinat, sisanya dihitung", () => {
  const t = susunTabel(data, [FORM_OBJEK], { perData: true, ...opsi });
  const { fitur, tanpaTitik } = keFitur(t);
  assert.deepEqual(
    fitur.map((f) => [f.lon, f.lat]),
    [
      [114.8412345, -3.4412345],
      [114.83, -3.45],
    ]
  );
  assert.equal(tanpaTitik, 1, "NOP-2 belum punya koordinat");
});

test("keFitur: 'Semua formulir' memberi identitas WP pada titik objeknya", () => {
  const t = susunTabel(data, [FORM_WP, FORM_OBJEK], { perData: false, ...opsi });
  const { nama, fitur } = keFitur(t);
  const iNama = nama.indexOf("WP - Nama");
  assert.equal(fitur.length, 2);
  assert.equal(fitur[0].sel[iNama].teks, "Budi & Ani <CV>");
});

test("namaAtribut: judul kolom kembar dibuat unik", () => {
  assert.deepEqual(namaAtribut(["Nomor", "Objek - NOP", "Objek - NOP", "", "Objek - NOP"]), [
    "Nomor",
    "Objek - NOP",
    "Objek - NOP (2)",
    "Kolom",
    "Objek - NOP (3)",
  ]);
});

test("GeoJSON: titik [bujur, lintang], angka tetap angka, kosong jadi null", () => {
  const t = susunTabel(data, [FORM_OBJEK], { perData: true, ...opsi });
  const gj = JSON.parse(keGeojson(keFitur(t), "Objek"));
  assert.equal(gj.type, "FeatureCollection");
  assert.equal(gj.name, "Objek");
  assert.equal(gj.features.length, 2);

  const [a, b] = gj.features;
  assert.deepEqual(a.geometry, { type: "Point", coordinates: [114.8412345, -3.4412345] });
  assert.equal(a.properties.Nomor, "00001");
  assert.equal(a.properties["Objek - Luas"], 250);
  assert.equal(a.properties["Objek - Titik (Latitude)"], -3.4412345);
  assert.equal(b.properties["Objek - Titik (Keterangan)"], "dipilih di peta");
  assert.equal(b.properties["Catatan kekurangan berkas"], null);
  assert.deepEqual(Object.keys(a.properties), Object.keys(b.properties), "semua titik punya kolom yang sama");
});

test("KML: koordinat bujur,lintang, teks di-escape, kolom angka bertipe double", () => {
  const t = susunTabel(data, [FORM_WP, FORM_OBJEK], { perData: false, ...opsi });
  const kml = keKml(keFitur(t), "Semua data");
  assert.ok(kml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(kml.includes("<coordinates>114.8412345,-3.4412345</coordinates>"));
  assert.ok(kml.includes("<name>00001</name>"));
  assert.ok(kml.includes('<SimpleData name="WP - Nama">Budi &amp; Ani &lt;CV&gt;</SimpleData>'));
  assert.ok(kml.includes('<SimpleField name="Objek - Luas" type="double"/>'));
  assert.ok(kml.includes('<SimpleField name="Objek - NOP" type="string"/>'));
  assert.equal((kml.match(/<Placemark>/g) || []).length, 2);
});

test("KML: karakter kendali yang terlarang di XML dibuang", () => {
  const kotor = [isian(KK2, 2, { 201: "NOP\u0007-9\u0000", 203: { lat: -3.4, lon: 114.8 } })];
  const kml = keKml(keFitur(susunTabel(kotor, [FORM_OBJEK], { perData: true, ...opsi })), "x");
  assert.ok(kml.includes(">NOP-9<"));
  assert.ok(!/[\u0000-\u0008]/.test(kml));
});

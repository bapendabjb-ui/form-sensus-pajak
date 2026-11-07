"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

/*
 * Koordinat objek yang diisi otomatis dari bidang NIB (client/src/lib/nib.js
 * titikDalamBidang): titiknya harus selalu jatuh di dalam bidang, juga untuk
 * bidang berbentuk U atau berlubang yang titik beratnya di luar tanahnya.
 * Asal titik "bidang" diterima server dan tidak dianggap GPS.
 */

const { normalizeNilai } = require("../src/answers");
const { keteranganLokasi } = require("../src/format");
const { nilaiTitik } = require("../src/cekLokasi");

const muat = () => import(pathToFileURL(path.join(__dirname, "../../client/src/lib/nib.js")).href);

/** Cincin [lon, lat] dari titik-titik (x, y) dalam satuan 0,0001 derajat di sekitar Banjarbaru. */
const cincin = (titik) => {
  const c = titik.map(([x, y]) => [114.81 + x * 1e-4, -3.45 + y * 1e-4]);
  return [...c, c[0]];
};

/** Titik di dalam cincin? (sama dengan cara browser, untuk memeriksa hasil) */
function dalam([x, y], c) {
  let d = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, yi] = c[i];
    const [xj, yj] = c[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

test("titikDalamBidang: persegi -> titik tengahnya", async () => {
  const { titikDalamBidang } = await muat();
  const t = titikDalamBidang({ type: "Polygon", coordinates: [cincin([[0, 0], [2, 0], [2, 2], [0, 2]])] });
  assert.ok(Math.abs(t.lon - 114.8101) < 1e-7 && Math.abs(t.lat - -3.4499) < 1e-7, JSON.stringify(t));
});

test("titikDalamBidang: bidang berbentuk U - titik beratnya di celah, titiknya tetap di tanah", async () => {
  const { titikDalamBidang } = await muat();
  // U terbuka ke atas: dua kaki lebar 1, alas tinggi 1, celah di tengah.
  const u = cincin([[0, 0], [5, 0], [5, 5], [4, 5], [4, 1], [1, 1], [1, 5], [0, 5]]);
  const t = titikDalamBidang({ type: "Polygon", coordinates: [u] });
  assert.ok(dalam([t.lon, t.lat], u), `titik ${JSON.stringify(t)} di luar bidang U`);
});

test("titikDalamBidang: lubang di tengah, poligon terbesar dari MultiPolygon, dan geometri rusak", async () => {
  const { titikDalamBidang } = await muat();
  const luar = cincin([[0, 0], [6, 0], [6, 6], [0, 6]]);
  const lubang = cincin([[2, 2], [4, 2], [4, 4], [2, 4]]);
  const t = titikDalamBidang({ type: "Polygon", coordinates: [luar, lubang] });
  assert.ok(dalam([t.lon, t.lat], luar) && !dalam([t.lon, t.lat], lubang), `titik ${JSON.stringify(t)} jatuh di lubang`);

  const kecil = cincin([[10, 10], [11, 10], [11, 11], [10, 11]]);
  const besar = cincin([[0, 0], [4, 0], [4, 4], [0, 4]]);
  const m = titikDalamBidang({ type: "MultiPolygon", coordinates: [[kecil], [besar]] });
  assert.ok(dalam([m.lon, m.lat], besar), "MultiPolygon: titik di bagian terbesar");

  assert.equal(titikDalamBidang(null), null);
  assert.equal(titikDalamBidang({ type: "Point", coordinates: [114.8, -3.4] }), null);
  assert.equal(titikDalamBidang({ type: "Polygon", coordinates: [[[114.8, -3.4]]] }), null);
});

test("koordinat dari bidang NIB: asal 'bidang' disimpan, diekspor, dan tidak dianggap GPS kasar / di kantor", () => {
  const v = normalizeNilai("lokasi", { lat: -3.45, lon: 114.81, akurasi: null, sumber: "bidang" });
  assert.equal(v.sumber, "bidang");
  assert.equal(normalizeNilai("lokasi", { lat: -3.45, lon: 114.81, sumber: "lain" }).sumber, "");
  assert.equal(keteranganLokasi(v), "dari bidang NIB");
  // Tanpa angka ketelitian dan tepat di kantor: titik manual tetap "baik".
  const kantor = { lat: -3.45, lon: 114.81, radiusM: 200 };
  assert.equal(nilaiTitik({ ...v, manual: true }, { kantor, akurasiKasarM: 50 }), "baik");
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { bacaGeojson, bacaNama, bacaWarna, namaDariBerkas, ISI_MAKS_BYTE } = require("../src/lapisanPeta");

/*
 * Lapisan peta dari QGIS / ArcGIS: hanya GeoJSON berderajat WGS 84 yang bisa
 * digambar peta Google / Leaflet. Berkas UTM atau TM-3 harus ditolak dengan
 * petunjuk, bukan tergambar di tempat yang salah.
 */

const kotak = (lon, lat) => ({
  type: "Polygon",
  coordinates: [
    [
      [lon, lat],
      [lon + 0.001, lat],
      [lon + 0.001, lat + 0.001],
      [lon, lat],
    ],
  ],
});

const koleksi = (features, extra = {}) =>
  JSON.stringify({ type: "FeatureCollection", ...extra, features });

test("bacaGeojson: koordinat dibulatkan 6 desimal, Z dibuang, atribut kosong dibuang", () => {
  const hasil = bacaGeojson(
    Buffer.from(
      koleksi(
        [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [114.812345678901, -3.456789012345, 21.5] },
            properties: { BLOK: "001", KET: "", LUAS: 120.5, X: null, ATR: { a: 1 } },
          },
        ],
        { name: "Blok PBB Cempaka", crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } } }
      )
    )
  );
  const gj = JSON.parse(hasil.isi);
  assert.equal(hasil.jumlahFitur, 1);
  assert.equal(hasil.nama, "Blok PBB Cempaka");
  assert.deepEqual(gj.features[0].geometry.coordinates, [114.812346, -3.456789]);
  assert.deepEqual(gj.features[0].properties, { BLOK: "001", LUAS: 120.5, ATR: '{"a":1}' });
  assert.equal(gj.crs, undefined, "keluarannya GeoJSON RFC 7946 tanpa member crs");
});

test("bacaGeojson: Feature tunggal, geometri telanjang, dan BOM diterima", () => {
  const fitur = { type: "Feature", geometry: kotak(114.8, -3.4), properties: { NAMA: "A" } };
  assert.equal(bacaGeojson(JSON.stringify(fitur)).jumlahFitur, 1);
  assert.equal(bacaGeojson(JSON.stringify(kotak(114.8, -3.4))).jumlahFitur, 1);
  assert.equal(bacaGeojson("\uFEFF" + koleksi([fitur])).jumlahFitur, 1);
});

test("bacaGeojson: fitur tanpa geometri dilewati dan dihitung", () => {
  const hasil = bacaGeojson(
    koleksi([
      { type: "Feature", geometry: kotak(114.8, -3.4), properties: {} },
      { type: "Feature", geometry: null, properties: { NAMA: "tanpa bentuk" } },
      { type: "Feature", geometry: { type: "Bentuk aneh", coordinates: [1, 2] } },
    ])
  );
  assert.equal(hasil.jumlahFitur, 1);
  assert.equal(hasil.dilewati, 2);
});

test("bacaGeojson: CRS proyeksi (UTM 50S) ditolak dengan petunjuk EPSG:4326", () => {
  const utm = koleksi([{ type: "Feature", geometry: kotak(114.8, -3.4) }], {
    crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::32750" } },
  });
  assert.throws(() => bacaGeojson(utm), (e) => e.status === 400 && /EPSG::32750/.test(e.message) && /EPSG:4326/.test(e.message));

  const epsg4326 = koleksi([{ type: "Feature", geometry: kotak(114.8, -3.4) }], {
    crs: { type: "name", properties: { name: "EPSG:4326" } },
  });
  assert.equal(bacaGeojson(epsg4326).jumlahFitur, 1);
});

test("bacaGeojson: koordinat meter tanpa member crs tetap ketahuan", () => {
  const meter = koleksi([{ type: "Feature", geometry: { type: "Point", coordinates: [245123.4, 9618234.1] } }]);
  assert.throws(() => bacaGeojson(meter), (e) => e.status === 400 && /UTM atau TM-3/.test(e.message));
});

test("bacaGeojson: bukan JSON, bukan GeoJSON, atau tanpa fitur -> 400", () => {
  assert.throws(() => bacaGeojson("<kml/>"), (e) => e.status === 400);
  assert.throws(() => bacaGeojson('{"type":"Topology"}'), (e) => e.status === 400);
  assert.throws(() => bacaGeojson(koleksi([])), (e) => e.status === 400 && /Tidak ada fitur/.test(e.message));
});

test("bacaGeojson: isi yang melewati batas penyimpanan ditolak", () => {
  // Satu atribut teks panjang per fitur, cukup untuk melewati batas isi.
  const panjang = "x".repeat(1024 * 1024);
  const fitur = Array.from({ length: Math.ceil(ISI_MAKS_BYTE / panjang.length) + 1 }, () => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [114.8, -3.4] },
    properties: { CATATAN: panjang },
  }));
  assert.throws(() => bacaGeojson(koleksi(fitur)), (e) => e.status === 400 && /terlalu besar/.test(e.message));
});

test("nama dan warna lapisan", () => {
  assert.equal(bacaNama("  Batas   blok  PBB "), "Batas blok PBB");
  assert.throws(() => bacaNama("   "), (e) => e.status === 400);
  assert.equal(namaDariBerkas("batas-blok_pbb.geojson"), "batas blok pbb");
  assert.equal(bacaWarna("#e11d48"), "#E11D48");
  assert.equal(bacaWarna("merah"), "#2563EB");
  assert.equal(bacaWarna("merah", null), null);
});

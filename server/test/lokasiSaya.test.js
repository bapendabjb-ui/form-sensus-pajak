"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

/**
 * Titik biru "Lokasi saya" (client/src/lib/rekamPosisi.js, dipakai
 * lib/useLokasiSaya.js): mengikuti pembacaan terbaru, bukan hasil cache
 * browser atau pembacaan tertua yang kebetulan paling teliti.
 */
const muat = () => import(pathToFileURL(path.join(__dirname, "../../client/src/lib/rekamPosisi.js")).href);

const baca = (lat, lon, akurasi, waktu) => ({ lat, lon, akurasi, waktu });

test("pakaiPembacaan: mode ikuti memakai pembacaan terbaru kecuali lonjakan kasar", async () => {
  const { pakaiPembacaan } = await muat();
  const lama = baca(-3.44, 114.83, 8, 1000);
  // Rekam data (bawaan): yang lebih kasar ditolak sampai 30 detik.
  assert.equal(pakaiPembacaan(lama, baca(-3.4402, 114.83, 15, 3000)), false);
  assert.equal(pakaiPembacaan(lama, baca(-3.4402, 114.83, 15, 32000)), true);
  // Ikuti: perangkat berpindah dengan ketelitian sedikit lebih kasar -> tetap diikuti.
  assert.equal(pakaiPembacaan(lama, baca(-3.4402, 114.83, 15, 3000), { ikuti: true }), true);
  assert.equal(pakaiPembacaan(lama, baca(-3.4402, 114.83, 33, 3000), { ikuti: true }), true);
  // Lonjakan dari jaringan (±1,5 km) di tengah GPS ditolak, kecuali GPS sudah lama diam.
  assert.equal(pakaiPembacaan(lama, baca(-3.45, 114.84, 1500, 3000), { ikuti: true }), false);
  assert.equal(pakaiPembacaan(lama, baca(-3.45, 114.84, 1500, 40000), { ikuti: true }), true);
  assert.equal(pakaiPembacaan(null, baca(-3.45, 114.84, 1500, 0), { ikuti: true }), true);
});

test("perluPusatkanUlang: GPS mengunci atau perangkat berpindah, bukan goyangan kecil", async () => {
  const { perluPusatkanUlang, jarakMeter } = await muat();
  const kasar = baca(-3.44, 114.83, 900, 0);
  // ±900 m -> ±12 m: dipusatkan ulang walau titiknya dekat.
  assert.equal(perluPusatkanUlang(kasar, baca(-3.4401, 114.83, 12, 0)), true);
  const gps = baca(-3.44, 114.83, 12, 0);
  // Bergeser ~5 m dengan ketelitian sama: diam saja.
  assert.equal(perluPusatkanUlang(gps, baca(-3.44004, 114.83, 12, 0)), false);
  // Bergeser ~55 m: ikuti.
  assert.equal(perluPusatkanUlang(gps, baca(-3.4405, 114.83, 12, 0)), true);
  assert.equal(perluPusatkanUlang(null, gps), true);
  const d = jarakMeter({ lat: -3.44, lon: 114.83 }, { lat: -3.44, lon: 114.831 });
  assert.ok(d > 110 && d < 112, `1/1000 derajat bujur di Banjarbaru ~111 m, dapat ${d}`);
});

test("pantauPosisi ikuti: cache browser ditolak dan pembacaan terbaru yang dilaporkan", async () => {
  const { pantauPosisi } = await muat();
  let kirim = null;
  let opsiDiminta = null;
  const asli = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        watchPosition: (ok, _gagal, opsi) => {
          kirim = ok;
          opsiDiminta = opsi;
          return 7;
        },
        clearWatch: () => {},
      },
    },
  });
  try {
    const laporan = [];
    const henti = pantauPosisi((k) => laporan.push(k), { ikuti: true });
    assert.equal(opsiDiminta.maximumAge, 0);
    assert.equal(opsiDiminta.enableHighAccuracy, true);
    const pos = (lat, lon, accuracy) => ({ coords: { latitude: lat, longitude: lon, accuracy } });
    kirim(pos(-3.44, 114.83, 6));
    // Perangkat berpindah ~110 m, ketelitian sedikit lebih kasar: titik biru ikut pindah.
    kirim(pos(-3.441, 114.83, 14));
    const akhir = laporan[laporan.length - 1];
    assert.equal(akhir.status, "siap");
    assert.equal(akhir.posisi.lat, -3.441);
    assert.equal(akhir.posisi.akurasi, 14);
    henti();
  } finally {
    if (asli) Object.defineProperty(globalThis, "navigator", asli);
    else delete globalThis.navigator;
  }
});

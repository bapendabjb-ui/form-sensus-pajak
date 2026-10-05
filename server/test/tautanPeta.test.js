"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { bacaKoordinatTeks, tautanPendek, bacaTautanPendek } = require("../src/tautanPeta");

const KANTOR = { lat: -3.439325, lon: 114.829525 };

test("bacaKoordinatTeks membaca koordinat hasil tekan lama di Google Maps", () => {
  assert.deepEqual(bacaKoordinatTeks("-3.439325, 114.829525"), KANTOR);
  assert.deepEqual(bacaKoordinatTeks("-3.439325,114.829525"), KANTOR);
  assert.deepEqual(bacaKoordinatTeks("  -3.439325 ,  114.829525  "), KANTOR);
});

test("bacaKoordinatTeks mendahulukan titik penanda (!3d!4d) daripada pusat tampilan (@)", () => {
  const url =
    "https://www.google.com/maps/place/Kantor+BPPRD+Kota+Banjarbaru/@-3.4391217,114.829573,20z/" +
    "data=!4m6!3m5!1s0x2de681747b236be9:0x11518d451175a73b!8m2!3d-3.439325!4d114.829525!16s%2Fg%2F11c3mq407q";
  assert.deepEqual(bacaKoordinatTeks(url), KANTOR);
});

test("bacaKoordinatTeks membaca @, ?q=, dan /search/", () => {
  assert.deepEqual(bacaKoordinatTeks("https://www.google.com/maps/@-3.4419,114.8409,17z"), { lat: -3.4419, lon: 114.8409 });
  assert.deepEqual(bacaKoordinatTeks("https://www.google.com/maps?q=-3.4419,114.8409"), { lat: -3.4419, lon: 114.8409 });
  assert.deepEqual(bacaKoordinatTeks("https://www.google.com/maps/search/-3.4419,+114.8409"), { lat: -3.4419, lon: 114.8409 });
  assert.deepEqual(bacaKoordinatTeks("https://www.google.com/maps?q=-3.4419%2C114.8409"), { lat: -3.4419, lon: 114.8409 });
});

test("bacaKoordinatTeks membaca derajat-menit-detik", () => {
  const k = bacaKoordinatTeks(`3°26'21.6"S 114°49'46.3"E`);
  assert.ok(Math.abs(k.lat - -3.4393333) < 1e-6, `lat ${k.lat}`);
  assert.ok(Math.abs(k.lon - 114.8295278) < 1e-6, `lon ${k.lon}`);
});

test("bacaKoordinatTeks menolak teks tanpa koordinat sah", () => {
  assert.equal(bacaKoordinatTeks(""), null);
  assert.equal(bacaKoordinatTeks("Jl. Ahmad Yani km 33"), null);
  assert.equal(bacaKoordinatTeks("https://maps.app.goo.gl/FJrvciT919j39fuU6"), null, "tautan pendek perlu dibuka server");
  assert.equal(bacaKoordinatTeks("95.1234, 114.8295"), null, "lintang di luar ±90");
  assert.equal(bacaKoordinatTeks("3, 114"), null, "angka bulat bukan koordinat GPS");
});

test("tautanPendek hanya menerima tautan https maps.app.goo.gl / goo.gl", () => {
  assert.ok(tautanPendek("https://maps.app.goo.gl/FJrvciT919j39fuU6"));
  assert.ok(tautanPendek("https://goo.gl/maps/abc"));
  assert.equal(tautanPendek("http://maps.app.goo.gl/abc"), null);
  assert.equal(tautanPendek("https://contoh.com/maps.app.goo.gl"), null);
  assert.equal(tautanPendek("-3.4, 114.8"), null);
});

/** fetch tiruan: peta url -> { status, location }. */
const tiruan = (rute) => async (url) => {
  const r = rute[url];
  if (!r) throw new Error(`tak terduga: ${url}`);
  return { status: r.status, headers: { get: (n) => (n === "location" ? r.location || null : null) } };
};

test("bacaTautanPendek mengikuti pengalihan ke Google Maps lalu membaca koordinatnya", async () => {
  const pendek = new URL("https://maps.app.goo.gl/FJrvciT919j39fuU6");
  const ambil = tiruan({
    [pendek.href]: {
      status: 302,
      location: "https://www.google.com/maps/place/X/@-3.4391217,114.829573,20z/data=!3d-3.439325!4d114.829525",
    },
  });
  assert.deepEqual(await bacaTautanPendek(pendek, ambil), KANTOR);
});

test("bacaTautanPendek menolak pengalihan ke luar Google", async () => {
  const pendek = new URL("https://maps.app.goo.gl/jahat");
  const ambil = tiruan({ [pendek.href]: { status: 302, location: "https://contoh-jahat.com/@-3.4,114.8" } });
  await assert.rejects(bacaTautanPendek(pendek, ambil), (e) => e.status === 422);
});

test("bacaTautanPendek melapor bila tautan tidak memuat koordinat", async () => {
  const pendek = new URL("https://maps.app.goo.gl/tempat");
  const ambil = tiruan({
    [pendek.href]: { status: 302, location: "https://www.google.com/maps?cid=1234567890" },
    "https://www.google.com/maps?cid=1234567890": { status: 200 },
  });
  await assert.rejects(bacaTautanPendek(pendek, ambil), (e) => e.status === 422 && /tekan lama/.test(e.message));
});

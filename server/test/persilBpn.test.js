"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

/*
 * Warna persil per kecamatan di Peta Sensus (client/src/lib/persilBpn.js).
 * Warna harus mengikuti kecamatannya, bukan urutannya: menyembunyikan atau
 * menambah kecamatan tidak boleh mengecat ulang yang lain.
 */

const muat = () => import(pathToFileURL(path.join(__dirname, "../../client/src/lib/persilBpn.js")).href);

const BANJARBARU = ["Banjarbaru Selatan", "Banjarbaru Utara", "Cempaka", "Landasan Ulin", "Liang Anggang"];

test("warnaKecamatan: lima kecamatan Banjarbaru mendapat warna tetap yang berbeda-beda", async () => {
  const { warnaKecamatan } = await muat();
  const w = warnaKecamatan(BANJARBARU);
  assert.equal(new Set(Object.values(w).map((x) => x.peta)).size, 5);
  assert.equal(new Set(Object.values(w).map((x) => x.satelit)).size, 5);
  assert.equal(w["Banjarbaru Selatan"].peta, "#2a78d6");
  // Tidak ada yang memakai teal / amber titik sensus.
  for (const x of Object.values(w)) assert.ok(!["#0F766E", "#B87309"].includes(x.peta.toUpperCase()));
});

test("warnaKecamatan: warna mengikuti nama, bukan urutan atau jumlah kecamatan", async () => {
  const { warnaKecamatan } = await muat();
  const semua = warnaKecamatan(BANJARBARU);
  const sebagian = warnaKecamatan(["Liang Anggang", "cempaka"]);
  assert.deepEqual(sebagian["Liang Anggang"], semua["Liang Anggang"]);
  assert.deepEqual(sebagian.cempaka, semua.Cempaka);
});

test("warnaKecamatan / warnaDi: kecamatan lain dapat warna cadangan, lalu abu-abu", async () => {
  const { warnaKecamatan, warnaDi } = await muat();
  const w = warnaKecamatan([...BANJARBARU, "Martapura", "Astambul", "Gambut"]);
  // Urut abjad: dua warna cadangan (oranye, merah), yang ketiga abu-abu.
  assert.deepEqual(
    ["Astambul", "Gambut", "Martapura"].map((k) => w[k].peta),
    ["#eb6834", "#e34948", "#64748B"]
  );
  assert.equal(warnaDi(w, "Martapura", "peta"), "#64748B");
  assert.equal(warnaDi(w, "Tidak ada", "satelit"), "#94A3B8");
  assert.equal(warnaDi(w, "Cempaka", "satelit"), w.Cempaka.satelit);
});

/*
 * Isi ringkas (peta diperkecil, zoom 13-14): disandikan server
 * (server/src/persil.js teksRingkas), dibaca browser (uraiRingkas). Bolak-balik
 * harus mengembalikan bidang di tempat yang sama, ±1 satuan (1e-5 derajat).
 */
const { teksRingkas, sederhanakanCincin, UKURAN_RINGKAS, UKURAN_PETAK } = require("../src/persil");

const persegi = (lon, lat, d) => [
  [lon, lat],
  [lon, lat + d],
  [lon + d, lat + d],
  [lon + d, lat],
  [lon, lat],
];

test("sederhanakanCincin: titik yang hampir segaris dibuang, sudut dipertahankan, tanpa titik penutup", () => {
  const c = [
    [0, 0],
    [0, 50],
    [1, 100],
    [0, 150],
    [100, 150],
    [100, 0],
    [0, 0],
  ];
  assert.deepEqual(sederhanakanCincin(c, 3), [
    [0, 0],
    [0, 150],
    [100, 150],
    [100, 0],
  ]);
});

test("teksRingkas -> uraiRingkas: bidang kembali ke tempatnya; bidang kecil hanya di sel sudut barat dayanya", async () => {
  const { uraiRingkas } = await muat();
  const [i, j] = [Math.floor(114.82 / UKURAN_RINGKAS), Math.floor(-3.45 / UKURAN_RINGKAS)];
  const bidang = (id, lon, lat, d, lebih = {}) => ({
    id,
    kecamatan: "Cempaka",
    besar: d > UKURAN_PETAK,
    selLat: Math.floor(lat / UKURAN_PETAK),
    selLon: Math.floor(lon / UKURAN_PETAK),
    geometri: JSON.stringify({ type: "Polygon", coordinates: [persegi(lon, lat, d)] }),
    ...lebih,
  });
  const lon0 = i * UKURAN_RINGKAS + 0.001;
  const lat0 = j * UKURAN_RINGKAS + 0.001;
  const daftar = [
    bidang(1, lon0, lat0, 0.0002),
    bidang(2, lon0 + 0.0005, lat0 + 0.0003, 0.0001, { kecamatan: "Landasan Ulin" }),
    // Sudut barat dayanya di sel tetangga: bukan milik sel ini.
    bidang(3, lon0 - 0.002, lat0, 0.0002),
    // Bidang besar yang menjulur dari sel tetangga: ikut, dengan id-nya.
    bidang(4, lon0 - 0.004, lat0, 0.006),
  ];
  const sel = uraiRingkas(JSON.parse(teksRingkas(daftar, i, j)));
  assert.deepEqual(sel.nama, ["Cempaka", "Landasan Ulin"]);
  assert.equal(sel.n, 3);
  assert.deepEqual([...sel.id], [0, 0, 4]);
  assert.deepEqual([...sel.ki], [0, 1, 0]);
  const titik = (c) => {
    const hasil = [];
    for (let v = sel.awal[c]; v < sel.awal[c + 1]; v++) {
      hasil.push([(sel.asal[0] + sel.xy[2 * v]) / 1e5, (sel.asal[1] + sel.xy[2 * v + 1]) / 1e5]);
    }
    return hasil;
  };
  const dekat = (a, b) => a.every(([x, y], k) => Math.abs(x - b[k][0]) <= 1.01e-5 && Math.abs(y - b[k][1]) <= 1.01e-5);
  assert.ok(dekat(titik(0), persegi(lon0, lat0, 0.0002).slice(0, 4)));
  assert.ok(dekat(titik(1), persegi(lon0 + 0.0005, lat0 + 0.0003, 0.0001).slice(0, 4)));
  assert.ok(dekat(titik(2), persegi(lon0 - 0.004, lat0, 0.006).slice(0, 4)));
  // Kotak pembatas cincin pertama, satuan sel.
  const o = sel.asal;
  assert.deepEqual([...sel.kotak.slice(0, 2)], [Math.round(lon0 * 1e5) - o[0], Math.round(lat0 * 1e5) - o[1]]);
});

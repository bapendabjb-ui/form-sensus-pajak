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

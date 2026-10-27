"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { bacaIdPetugas, namaPetugas } = require("../src/routes/ekspor");

test("bacaIdPetugas membaca satu atau beberapa id, unik, urut pilihan", () => {
  assert.deepEqual(bacaIdPetugas({ petugas: "7" }), [7]);
  assert.deepEqual(bacaIdPetugas({ petugas: "3,1, 7,3" }), [3, 1, 7]);
  assert.deepEqual(bacaIdPetugas({ petugas: "3,abc,-1,0,2.5,4" }), [3, 4], "id ngawur dibuang");
});

test("bacaIdPetugas menolak daftar kosong atau terlalu banyak", () => {
  assert.throws(() => bacaIdPetugas({}), /minimal satu petugas/);
  assert.throws(() => bacaIdPetugas({ petugas: "abc" }), /minimal satu petugas/);
  const banyak = Array.from({ length: 51 }, (_, i) => i + 1).join(",");
  assert.throws(() => bacaIdPetugas({ petugas: banyak }), /Paling banyak 50/);
});

test("namaPetugas: satu nama, atau nama pertama + jumlah sisanya", () => {
  assert.deepEqual(namaPetugas([{ id: 1, nama: "Surya Arisandi" }]), {
    namaBagian: ["petugas", "surya-arisandi", false],
    judul: "Surya Arisandi",
  });
  assert.deepEqual(namaPetugas([{ id: 1, nama: "Surya" }, { id: 2, nama: "Recky" }, { id: 3, nama: "Ani" }]), {
    namaBagian: ["petugas", "surya", "dan-2-lainnya"],
    judul: "Surya +2",
  });
});

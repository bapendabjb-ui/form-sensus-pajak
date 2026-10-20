"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { selisihMenit, tanggalDi, susunHarian } = require("../src/realisasi");

test("selisihMenit mengikuti zona waktu", () => {
  const waktu = new Date("2026-10-20T03:00:00Z");
  assert.equal(selisihMenit("Asia/Makassar", waktu), 480);
  assert.equal(selisihMenit("Asia/Jakarta", waktu), 420);
  assert.equal(selisihMenit("UTC", waktu), 0);
});

test("tanggalDi berganti hari pada tengah malam waktu setempat, bukan UTC", () => {
  // 16.30 UTC = 00.30 WITA keesokan harinya.
  assert.equal(tanggalDi("Asia/Makassar", new Date("2026-10-19T16:30:00Z")), "2026-10-20");
  assert.equal(tanggalDi("Asia/Makassar", new Date("2026-10-19T15:30:00Z")), "2026-10-19");
});

test("susunHarian mengisi hari kosong sampai hari ini dan menjumlah kumulatif", () => {
  const deret = susunHarian(
    [
      { tanggal: "2026-10-16", jumlah: 3 },
      { tanggal: "2026-10-18", jumlah: 5 },
    ],
    "2026-10-20"
  );
  assert.deepEqual(deret, [
    { tanggal: "2026-10-16", jumlah: 3, kumulatif: 3 },
    { tanggal: "2026-10-17", jumlah: 0, kumulatif: 3 },
    { tanggal: "2026-10-18", jumlah: 5, kumulatif: 8 },
    { tanggal: "2026-10-19", jumlah: 0, kumulatif: 8 },
    { tanggal: "2026-10-20", jumlah: 0, kumulatif: 8 },
  ]);
});

test("susunHarian melintasi pergantian bulan", () => {
  const deret = susunHarian([{ tanggal: "2026-09-30", jumlah: 1 }], "2026-10-01");
  assert.deepEqual(
    deret.map((d) => d.tanggal),
    ["2026-09-30", "2026-10-01"]
  );
});

test("susunHarian kosong bila belum ada kertas kerja", () => {
  assert.deepEqual(susunHarian([], "2026-10-20"), []);
});

test("susunHarian tidak membuang data yang tercatat setelah 'hari ini'", () => {
  const deret = susunHarian([{ tanggal: "2026-10-21", jumlah: 2 }], "2026-10-20");
  assert.deepEqual(deret, [{ tanggal: "2026-10-21", jumlah: 2, kumulatif: 2 }]);
});

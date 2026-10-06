"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Murni dan menentukan apa yang boleh diubah petugas pada data yang koordinatnya terkunci.
const { kunciKoordinat } = require("../src/routes/entri");

const formulir = {
  pertanyaan: [
    { id: 1, tipe: "text" },
    { id: 2, tipe: "lokasi" },
    { id: 3, tipe: "lokasi" },
  ],
};

test("kunciKoordinat mempertahankan koordinat tersimpan, isian lain tetap dari petugas", () => {
  const tersimpan = { 1: "Lama", 2: { lat: -3.44, lon: 114.83, sumber: "peta" } };
  const masuk = { 1: "Baru", 2: { lat: -3.1, lon: 114.1, sumber: "gps" }, 3: { lat: -3.2, lon: 114.2 } };
  const hasil = kunciKoordinat(formulir, masuk, tersimpan);
  assert.equal(hasil[1], "Baru");
  assert.deepEqual(hasil[2], tersimpan[2]);
  assert.equal(hasil[3], undefined, "koordinat yang belum pernah diisi tidak bisa ditambahkan diam-diam");
});

test("kunciKoordinat tahan kiriman kosong", () => {
  assert.deepEqual(kunciKoordinat(formulir, null, {}), {});
});

/* ---------- simpan dengan berkas tidak lengkap ---------- */

const { siapkanJawaban } = require("../src/entri");

const formPbb = (simpanBerkasKurang) => ({
  simpanBerkasKurang,
  pertanyaan: [
    { id: 11, tipe: "text", wajib: true },
    { id: 12, tipe: "nop", wajib: true },
    { id: 13, tipe: "lokasi", wajib: true },
  ],
});
const koordinat = { lat: -3.44, lon: 114.83, akurasi: null, ketinggian: null, waktu: "", sumber: "peta" };

test("siapkanJawaban: berkas tidak lengkap melonggarkan kolom wajib, koordinat tetap wajib", async () => {
  const lolos = await siapkanJawaban(formPbb(true), { 13: koordinat }, null, [], { berkasKurang: true });
  assert.deepEqual(lolos.errors, {});

  const tanpaKoordinat = await siapkanJawaban(formPbb(true), {}, null, [], { berkasKurang: true });
  assert.deepEqual(Object.keys(tanpaKoordinat.errors), ["13"]);
});

test("siapkanJawaban: tanpa izin formulir atau dengan berkas lengkap, kolom wajib tetap wajib", async () => {
  const tanpaIzin = await siapkanJawaban(formPbb(false), { 13: koordinat }, null, [], { berkasKurang: true });
  assert.deepEqual(Object.keys(tanpaIzin.errors).sort(), ["11", "12"]);

  const berkasLengkap = await siapkanJawaban(formPbb(true), { 13: koordinat }, null, [], { berkasKurang: false });
  assert.deepEqual(Object.keys(berkasLengkap.errors).sort(), ["11", "12"]);
});

test("siapkanJawaban: isian yang diisi tetap diperiksa formatnya walau dilonggarkan", async () => {
  const r = await siapkanJawaban(formPbb(true), { 12: "123", 13: koordinat }, null, [], { berkasKurang: true });
  assert.ok(r.errors[12], "NOP 3 digit tetap ditolak");
});

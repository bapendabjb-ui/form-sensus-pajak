"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { catatPerubahan, simpanSementara } = require("../src/simpanSementara");

/** Jalankan catatPerubahan untuk satu permintaan lalu selesaikan responsnya. */
function permintaan(method, statusCode = 200) {
  const pendengar = {};
  const res = {
    statusCode,
    on(nama, fn) {
      pendengar[nama] = fn;
    },
  };
  catatPerubahan({ method }, res, () => {});
  if (pendengar.finish) pendengar.finish();
}

/** Penyusun palsu yang menghitung berapa kali dipanggil. */
function penyusun() {
  const s = async () => {
    s.kali += 1;
    return `isi-${s.kali}`;
  };
  s.kali = 0;
  return s;
}

test("simpanSementara memakai isi yang sama selama data tidak berubah", async () => {
  const susun = penyusun();
  const baca = simpanSementara({ umurMs: 60000, susun });

  assert.equal(await baca(), "isi-1");
  assert.equal(await baca(), "isi-1");
  assert.equal(susun.kali, 1);
});

test("simpanSementara: pembaca bersamaan menunggu satu susunan yang sama", async () => {
  const susun = penyusun();
  const baca = simpanSementara({ umurMs: 60000, susun });

  const hasil = await Promise.all([baca(), baca(), baca()]);
  assert.deepEqual(hasil, ["isi-1", "isi-1", "isi-1"]);
  assert.equal(susun.kali, 1);
});

test("simpanSementara disusun ulang setelah permintaan tulis yang selesai", async () => {
  const susun = penyusun();
  const baca = simpanSementara({ umurMs: 60000, susun });

  await baca();
  permintaan("PATCH");
  assert.equal(await baca(), "isi-2");

  permintaan("POST", 500);
  assert.equal(await baca(), "isi-3", "5xx bisa jadi sudah menulis sebagian data");
});

test("simpanSementara tidak terpengaruh GET maupun kiriman yang ditolak", async () => {
  const susun = penyusun();
  const baca = simpanSementara({ umurMs: 60000, susun });

  await baca();
  permintaan("GET");
  permintaan("HEAD");
  permintaan("POST", 400);
  permintaan("DELETE", 404);
  assert.equal(await baca(), "isi-1");
  assert.equal(susun.kali, 1);
});

test("simpanSementara tidak menyimpan hasil yang datanya berubah selagi disusun", async () => {
  let lepas;
  const tahan = new Promise((r) => {
    lepas = r;
  });
  let kali = 0;
  const baca = simpanSementara({
    umurMs: 60000,
    susun: async () => {
      kali += 1;
      if (kali === 1) await tahan;
      return `isi-${kali}`;
    },
  });

  const pertama = baca();
  // Tunggu susunan pertama benar-benar berjalan, lalu ubah data di tengahnya.
  await new Promise((r) => setImmediate(r));
  permintaan("PUT");
  lepas();
  assert.equal(await pertama, "isi-1", "pembaca yang sudah menunggu tetap mendapat jawaban");
  assert.equal(await baca(), "isi-2", "hasil usang tidak dipakai pembaca berikutnya");
});

test("simpanSementara disusun ulang setelah umurnya habis", async () => {
  const susun = penyusun();
  const baca = simpanSementara({ umurMs: 0, susun });

  await baca();
  assert.equal(await baca(), "isi-2");
});

test("simpanSementara: susunan yang gagal tidak disimpan dan dicoba lagi", async () => {
  let gagal = true;
  const baca = simpanSementara({
    umurMs: 60000,
    susun: async () => {
      if (gagal) throw new Error("database putus");
      return "pulih";
    },
  });

  await assert.rejects(baca(), /database putus/);
  gagal = false;
  assert.equal(await baca(), "pulih");
});

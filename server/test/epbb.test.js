"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { susunAlamat, sumberEpbbSah, aktif } = require("../src/epbb");
const config = require("../src/config");

test("susunAlamat menggabungkan bagian yang terisi saja", () => {
  assert.equal(
    susunAlamat({ jalan: "JL. MAWAR", blok_kav_no: "NO. 5", rt: "001", rw: "002" }, [
      ["KEL. ", "GUNTUNG PAYUNG"],
      ["KEC. ", "LANDASAN ULIN"],
    ]),
    "JL. MAWAR NO. 5, RT 001/RW 002, KEL. GUNTUNG PAYUNG, KEC. LANDASAN ULIN"
  );
});

test("susunAlamat tidak meninggalkan koma menggantung", () => {
  assert.equal(susunAlamat({ jalan: "JL. MAWAR" }, []), "JL. MAWAR");
  assert.equal(susunAlamat({ rt: "001" }, []), "RT 001");
  assert.equal(susunAlamat({}, [["KEL. ", ""]]), "");
  assert.equal(susunAlamat(), "");
});

test("susunAlamat merapikan spasi berlebih dari SISMIOP", () => {
  assert.equal(susunAlamat({ jalan: "  JL.   MAWAR  " }, []), "JL. MAWAR");
});

/*
 * Pengisian otomatis hanya boleh menulis ke tipe pertanyaan yang cocok - tanpa
 * penjagaan ini, "luas_tanah" bisa masuk ke pertanyaan bertipe tanggal.
 */
test("sumberEpbbSah memasangkan sumber EPBB dengan tipe pertanyaan yang cocok", () => {
  assert.equal(sumberEpbbSah("text", "nama_wp"), true);
  assert.equal(sumberEpbbSah("wilayah", "wilayah_op"), true);
  assert.equal(sumberEpbbSah("number", "luas_tanah"), true);
  assert.equal(sumberEpbbSah("date", "nama_wp"), false);
  assert.equal(sumberEpbbSah("text", "kolom_karangan"), false);
  assert.equal(sumberEpbbSah("text", "constructor"), false, "properti bawaan Object bukan sumber");
});

test("cek NOP mati bila URL atau kunci API belum diisi", () => {
  const url = config.epbbApiUrl;
  const key = config.epbbApiKey;
  try {
    config.epbbApiUrl = "";
    config.epbbApiKey = "abc";
    assert.equal(aktif(), false);
    config.epbbApiUrl = "https://epbb.contoh.test/api/nop/cek";
    assert.equal(aktif(), true);
  } finally {
    config.epbbApiUrl = url;
    config.epbbApiKey = key;
  }
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");

const { susunEkspor, keCsv, keXlsx } = require("../src/ekspor");

/*
 * Kolom Lokasi dipecah jadi latitude, longitude, dan keterangan supaya
 * koordinatnya bisa diolah sendiri-sendiri. Di Excel keduanya harus angka
 * utuh - format ribuan bawaan akan memangkasnya jadi 2 desimal.
 */

const formulir = [{ id: 1, judul: "Objek", pertanyaan: [{ id: 10, tipe: "lokasi", label: "Titik" }] }];
const kk = { id: 5, nomor: "KK-001", status: "draft", petugas: [] };
const entri = (nilai) => ({ kk, e: { formulirId: 1, createdAt: new Date(0), jawaban: [{ pertanyaanId: 10, nilai }] } });
const opsi = { baseUrl: "", timezone: "Asia/Makassar" };

const tabel = susunEkspor(
  [
    entri({ lat: -3.4412345, lon: 114.8412345, akurasi: 12.4, sumber: "gps" }),
    entri({ lat: -3.44, lon: 114.84, akurasi: null, sumber: "peta" }),
    entri({ lat: null, lon: null }),
  ],
  formulir,
  opsi
);

test("susunEkspor memecah lokasi jadi latitude, longitude, dan keterangan", () => {
  assert.deepEqual(tabel.header.slice(-3), [
    "Objek - Titik (Latitude)",
    "Objek - Titik (Longitude)",
    "Objek - Titik (Keterangan)",
  ]);
  const ekor = (r) => r.slice(-3).map((c) => c.teks);
  assert.deepEqual(ekor(tabel.baris[0]), ["-3.4412345", "114.8412345", "±12 m"]);
  assert.deepEqual(ekor(tabel.baris[1]), ["-3.44", "114.84", "dipilih di peta"]);
  assert.deepEqual(ekor(tabel.baris[2]), ["", "", ""]);
});

test("CSV menulis koordinat dengan titik desimal", () => {
  assert.ok(keCsv(tabel).includes('"-3.4412345","114.8412345","±12 m"'));
});

test("Excel menyimpan koordinat sebagai angka tanpa dipangkas", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await keXlsx(tabel, "Data"));
  const ws = wb.worksheets[0];
  const n = tabel.header.length;

  const lat = ws.getRow(2).getCell(n - 2);
  const lon = ws.getRow(2).getCell(n - 1);
  assert.equal(lat.value, -3.4412345);
  assert.equal(lon.value, 114.8412345);
  assert.equal(lat.numFmt, "0.0######");
  assert.equal(ws.getRow(4).getCell(n - 2).value, "");
});

test("susunEkspor memecah wilayah per tingkat, Banjarbaru dilengkapi kabupaten & provinsinya", () => {
  const f = [{ id: 1, judul: "WP", pertanyaan: [{ id: 11, tipe: "wilayah", label: "Alamat" }] }];
  const isi = (nilai) => ({ kk, e: { formulirId: 1, createdAt: new Date(0), jawaban: [{ pertanyaanId: 11, nilai }] } });
  const t = susunEkspor(
    [
      isi({ kecamatan: "Cempaka", kode_kecamatan: "020", kelurahan: "Palam", kode_kelurahan: "001" }),
      isi({
        kecamatan: "Banjarmasin Selatan",
        kode_kecamatan: "",
        kelurahan: "Kelayan Selatan",
        kode_kelurahan: "",
        kabupaten: "Kota Banjarmasin",
        provinsi: "Kalimantan Selatan",
        kode_kemendagri: "63.71.01.1002",
      }),
      isi({ kecamatan: "", kode_kecamatan: "", kelurahan: "", kode_kelurahan: "" }),
    ],
    f,
    opsi
  );
  assert.deepEqual(t.header.slice(-4), [
    "WP - Alamat (Kelurahan/Desa)",
    "WP - Alamat (Kecamatan)",
    "WP - Alamat (Kabupaten/Kota)",
    "WP - Alamat (Provinsi)",
  ]);
  const ekor = (r) => r.slice(-4).map((c) => c.teks);
  assert.deepEqual(ekor(t.baris[0]), ["Palam", "Cempaka", "Kota Banjarbaru", "Kalimantan Selatan"]);
  assert.deepEqual(ekor(t.baris[1]), ["Kelayan Selatan", "Banjarmasin Selatan", "Kota Banjarmasin", "Kalimantan Selatan"]);
  assert.deepEqual(ekor(t.baris[2]), ["", "", "", ""]);
});

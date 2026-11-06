"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");

const { susunTabel, susunEkspor, susunEksporPerKk, keCsv, keXlsx } = require("../src/ekspor");

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

test("susunEkspor: dengan persil BPN, NIB / tipe hak / luas peta bidang di titik Lokasi ikut", () => {
  const bidang = { nibLengkap: "17.11.74.02.03612", tipeHak: "Hak Milik", luasPeta: 566.84 };
  const persilDi = (lat, lon) => (lat === -3.44 && lon === 114.84 ? bidang : null);
  const t = susunEkspor([entri({ lat: -3.44, lon: 114.84 }), entri({ lat: -3.5, lon: 114.9 }), entri({ lat: null, lon: null })], formulir, {
    ...opsi,
    persilDi,
  });
  assert.deepEqual(t.header.slice(-6), [
    "Objek - Titik (Latitude)",
    "Objek - Titik (Longitude)",
    "Objek - Titik (Keterangan)",
    "Objek - Titik (NIB BPN)",
    "Objek - Titik (Tipe hak BPN)",
    "Objek - Titik (Luas peta BPN m²)",
  ]);
  const ekor = (r) => r.slice(-3);
  assert.deepEqual(ekor(t.baris[0]).map((c) => c.teks), ["17.11.74.02.03612", "Hak Milik", "566,84"]);
  assert.equal(ekor(t.baris[0])[2].angka, 566.84);
  assert.deepEqual(ekor(t.baris[1]).map((c) => c.teks), ["", "", ""]);
  assert.deepEqual(ekor(t.baris[2]).map((c) => c.teks), ["", "", ""]);
  // Titik untuk ekspor peta tetap kolom latitude / longitude.
  assert.deepEqual(t.titik, [[t.header.length - 6, t.header.length - 5]]);
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

/*
 * "Semua formulir": satu baris per kertas kerja. Data Identitas Wajib Pajak
 * dan PBB-P2 di kertas kerja yang sama harus berdampingan, bukan bertangga.
 */

const FORM_IDENTITAS = { id: 1, judul: "Identitas", pertanyaan: [{ id: 101, tipe: "text", label: "Nama" }] };
const FORM_PBB = { id: 2, judul: "PBB", pertanyaan: [{ id: 201, tipe: "text", label: "NOP" }] };
const kkKe = (id) => ({ id, nomor: `0000${id}`, status: "draft", petugas: [] });
let urutEntri = 0;
const data = (kkId, formulirId, pertanyaanId, nilai, lain = {}) => ({
  kk: kkKe(kkId),
  e: {
    id: ++urutEntri,
    formulirId,
    createdAt: new Date(0),
    berkasLengkap: true,
    catatanBerkas: "",
    dibuatOleh: "",
    jawaban: [{ pertanyaanId, nilai }],
    ...lain,
  },
});

const perKk = susunEksporPerKk(
  [
    // KK 1: satu Identitas + satu PBB.
    data(1, 1, 101, "Budi"),
    data(1, 2, 201, "NOP-1"),
    // KK 2: satu Identitas + dua PBB.
    data(2, 1, 101, "Ani"),
    data(2, 2, 201, "NOP-2A", { berkasLengkap: false, catatanBerkas: "KTP belum ada" }),
    data(2, 2, 201, "NOP-2B"),
    // KK 3: PBB saja.
    data(3, 2, 201, "NOP-3"),
  ],
  [FORM_IDENTITAS, FORM_PBB],
  opsi
);
const isiBaris = (r) => [r[0].teks, r[4].teks, r[9].teks, r[10].teks, r[11].teks];

test("susunEksporPerKk: kolom tiap formulir berdampingan dalam satu blok", () => {
  assert.deepEqual(perKk.header, [
    "Nomor",
    "Status",
    "Petugas",
    "NIP",
    "Identitas - Nama",
    "Identitas - Kelengkapan berkas",
    "Identitas - Catatan kekurangan berkas",
    "Identitas - Waktu input",
    "Identitas - Diisi oleh",
    "PBB - NOP",
    "PBB - Kelengkapan berkas",
    "PBB - Catatan kekurangan berkas",
    "PBB - Waktu input",
    "PBB - Diisi oleh",
  ]);
});

test("susunEksporPerKk: satu baris per kertas kerja", () => {
  assert.equal(perKk.baris.length, 4);
  assert.deepEqual(isiBaris(perKk.baris[0]), ["00001", "Budi", "NOP-1", "Lengkap", ""]);
});

test("susunEksporPerKk: data kembar mendapat baris sendiri, formulir yang datanya satu diulang", () => {
  assert.deepEqual(isiBaris(perKk.baris[1]), ["00002", "Ani", "NOP-2A", "Tidak lengkap", "KTP belum ada"]);
  assert.deepEqual(isiBaris(perKk.baris[2]), ["00002", "Ani", "NOP-2B", "Lengkap", ""]);
});

test("susunEksporPerKk: formulir yang tidak diisi dibiarkan kosong", () => {
  assert.deepEqual(isiBaris(perKk.baris[3]), ["00003", "", "NOP-3", "Lengkap", ""]);
  assert.equal(perKk.baris[3][5].teks, "", "kelengkapan berkas formulir yang tidak diisi juga kosong");
});

/*
 * Semua jenis ekspor (per kertas kerja, per formulir, wilayah, petugas,
 * seluruh data) lewat susunTabel, supaya data yang sama tampil sama di mana
 * pun diunduh.
 */

const FORM_PBB_WILAYAH = {
  id: 2,
  judul: "PBB",
  pertanyaan: [
    { id: 201, tipe: "text", label: "NOP" },
    { id: 202, tipe: "number", label: "Luas" },
  ],
};
// Sengaja tidak urut: KK 3 sebelum KK 1, PBB sebelum Identitas, data kedua sebelum data pertama.
const kkTim = (id) => ({ id, nomor: `0000${id}`, status: "draft", petugas: [] });
const isian = (kkId, formulirId, id, menit, jawaban) => ({
  kk: kkTim(kkId),
  e: {
    id,
    kertasKerjaId: kkId,
    formulirId,
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, menit)),
    berkasLengkap: true,
    catatanBerkas: "",
    dibuatOleh: "",
    jawaban: Object.entries(jawaban).map(([pertanyaanId, nilai]) => ({ pertanyaanId: Number(pertanyaanId), nilai })),
  },
});
const acak = [
  isian(3, 2, 30, 5, { 201: "NOP-3" }),
  isian(1, 2, 12, 9, { 201: "NOP-1B", 202: "1500" }),
  isian(1, 2, 11, 9, { 201: "NOP-1A", 202: "250" }), // waktu kembar: id lebih kecil dulu
  isian(1, 1, 10, 30, { 101: "Budi" }),
  isian(2, 1, 20, 1, { 101: "Ani" }),
];
const DUA_FORM = [FORM_IDENTITAS, FORM_PBB_WILAYAH];

/** Baris -> { judul kolom: isi } tanpa sel kosong, supaya tabel dengan kolom berbeda bisa dibandingkan. */
const isiBerjudul = (t) =>
  t.baris.map((r) => Object.fromEntries(t.header.map((h, i) => [h, r[i].teks]).filter(([, v]) => v !== "")));

test("susunTabel: urut nomor kertas kerja, urutan formulir di bank, waktu input, lalu id", () => {
  const t = susunTabel(acak, DUA_FORM, { perData: true, ...opsi });
  const ringkas = t.baris.map((r) => `${r[0].teks} ${r[4].teks} #${r[5].teks}`);
  assert.deepEqual(ringkas, [
    "00001 Identitas #1",
    "00001 PBB #1",
    "00001 PBB #2",
    "00002 Identitas #1",
    "00003 PBB #1",
  ]);
  assert.equal(t.baris[1][t.header.indexOf("PBB - NOP")].teks, "NOP-1A");
});

test("susunTabel: No. data dihitung sebelum disaring, jadi sama dengan ekspor per kertas kerja", () => {
  // Ekspor wilayah: data NOP-1A berada di kelurahan lain dan tersaring.
  const t = susunTabel(acak, [FORM_PBB_WILAYAH], { perData: true, ikut: (e) => e.id !== 11, ...opsi });
  const nop1b = t.baris.find((r) => r[t.header.indexOf("PBB - NOP")].teks === "NOP-1B");
  assert.equal(nop1b[t.header.indexOf("No. data")].teks, "2");
});

test("susunTabel: seluruh data = gabungan ekspor 'Semua formulir' tiap kertas kerja", () => {
  const semua = isiBerjudul(susunTabel(acak, DUA_FORM, { perData: false, ...opsi }));
  const gabungan = [1, 2, 3].flatMap((id) => {
    const milik = acak.filter((d) => d.kk.id === id);
    const formulirnya = DUA_FORM.filter((f) => milik.some((d) => d.e.formulirId === f.id));
    return isiBerjudul(susunTabel(milik, formulirnya, { perData: false, ...opsi }));
  });
  assert.deepEqual(semua, gabungan);
  assert.equal(semua.length, 4, "KK 1 punya dua data PBB, jadi dua baris");
});

test("susunTabel: seluruh data satu formulir = ekspor per formulir", () => {
  const perForm = susunTabel(acak, [FORM_PBB_WILAYAH], { perData: true, ...opsi });
  const dariSemua = susunTabel(acak, DUA_FORM, { perData: true, ...opsi });
  const pbb = dariSemua.baris.filter((r) => r[4].teks === "PBB");
  assert.deepEqual(
    pbb.map((r) => r.slice(0, 10).map((c) => c.teks)),
    perForm.baris.map((r) => r.slice(0, 10).map((c) => c.teks))
  );
});

test("Excel: kolom angka di mana pun letaknya berformat ribuan, No. data angka polos", async () => {
  // Pada susunan per kertas kerja, kolom ke-6 adalah pertanyaan formulir pertama.
  const formAngka = { id: 2, judul: "PBB", pertanyaan: [{ id: 202, tipe: "number", label: "Luas" }] };
  const t = susunTabel(acak, [FORM_IDENTITAS, formAngka], { perData: false, ...opsi });
  const kolomLuas = t.header.indexOf("PBB - Luas");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await keXlsx(t, "Data"));
  const sel = wb.worksheets[0].getRow(2).getCell(kolomLuas + 1);
  assert.equal(sel.value, 250);
  assert.equal(sel.numFmt, "#,##0.##");

  const satu = susunTabel(acak, [formAngka], { perData: true, ...opsi });
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(await keXlsx(satu, "Data"));
  const ws2 = wb2.worksheets[0];
  assert.equal(ws2.getRow(2).getCell(6).value, 1);
  assert.equal(ws2.getRow(2).getCell(6).numFmt, "0");
  assert.equal(ws2.getRow(2).getCell(satu.header.indexOf("PBB - Luas") + 1).numFmt, "#,##0.##");
  assert.equal(ws2.getRow(1).getCell(1).value, "Nomor");
  assert.equal(ws2.views[0].state, "frozen");
  assert.ok(ws2.autoFilter, "filter otomatis terpasang");
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

/*
 * Integrasi NIB BPN dengan NOP PBB (src/integrasi.js): bentuk jawaban
 * pertanyaan "nib", pola hubungan yang disimpulkan dari seluruh data, dan
 * keluarannya di ekspor / daftar kerja. Hubungan dicatat banyak-ke-banyak;
 * yang diuji di sini adalah kesimpulannya.
 */

const { normalizeNilai, nilaiTerisi, pesanFormat, normalNib, NIB_MAKS_BIDANG, kunciBidang } = require("../src/answers");
const {
  analisis,
  selisihUrut,
  nopEntri,
  bidangEntri,
  barisEntriNib,
  saringBaris,
  tabelLaporan,
  POLA,
} = require("../src/integrasi");
const { csvNilai, nibLengkap } = require("../src/format");
const { susunEkspor } = require("../src/ekspor");

const NOP_A = "637201000100201230";
const NOP_B = "637201000100201240";
const NOP_C = "637201000100201250";

const peta = (nib, lebih = {}) => ({ kode: "17117402", nib, sumber: "peta", luas: 100, ...lebih });

/* ---------- bentuk jawaban ---------- */

test("normalNib: NIB dari sertifikat hanya angka dan dilengkapi nol; bidang kembar sekali", () => {
  const v = normalNib({
    bidang: [
      { kode: "17.11.74.02", nib: "3612", sumber: "sertifikat" },
      { kode: "17117402", nib: "03612", sumber: "sertifikat" },
      { kode: "17117402", nib: "03613", sumber: "peta", luas: "250.5", tipeHak: "  Hak Milik ", diPeta: true },
      { kode: "17117402", nib: "", sumber: "peta" },
    ],
    status: "belum_sertifikat",
  });
  assert.equal(v.bidang.length, 2);
  assert.deepEqual([v.bidang[0].kode, v.bidang[0].nib, v.bidang[0].sumber], ["17117402", "03612", "sertifikat"]);
  assert.deepEqual([v.bidang[1].luas, v.bidang[1].tipeHak, v.bidang[1].diPeta], [250.5, "Hak Milik", true]);
  // Alasan tanpa NIB tidak berlaku bila ada bidang.
  assert.equal(v.status, "");
});

test("normalNib: tanpa bidang, hanya alasan yang dikenal yang disimpan; paling banyak NIB_MAKS_BIDANG", () => {
  assert.deepEqual(normalNib({ status: "belum_sertifikat" }), { bidang: [], status: "belum_sertifikat" });
  assert.deepEqual(normalNib({ status: "asal" }), { bidang: [], status: "" });
  assert.deepEqual(normalizeNilai("nib", null), { bidang: [], status: "" });
  const banyak = Array.from({ length: 30 }, (_, i) => peta(String(i).padStart(5, "0")));
  assert.equal(normalNib({ bidang: banyak }).bidang.length, NIB_MAKS_BIDANG);
});

test("nilaiTerisi / pesanFormat nib: alasan cukup untuk wajib; NIB sertifikat harus 13 digit", () => {
  assert.equal(nilaiTerisi("nib", normalNib({})), false);
  assert.equal(nilaiTerisi("nib", normalNib({ status: "belum_diketahui" })), true);
  assert.equal(nilaiTerisi("nib", normalNib({ bidang: [peta("03612")] })), true);

  assert.equal(pesanFormat("nib", normalNib({ bidang: [{ kode: "1711740", nib: "3612", sumber: "sertifikat" }] })).length > 0, true);
  assert.equal(pesanFormat("nib", normalNib({ bidang: [{ kode: "17117402", nib: "3612", sumber: "sertifikat" }] })), "");
  // Bidang dari peta memakai data BPN apa adanya.
  assert.equal(pesanFormat("nib", normalNib({ bidang: [{ kode: "", nib: "A-12", sumber: "peta" }] })), "");
});

/* ---------- pola hubungan ---------- */

test("analisis: pola setiap data dan status setiap bidang", () => {
  const k = (nib) => kunciBidang("17117402", nib);
  const baris = [
    // A: 1 NIB = 1 NOP
    { kunci: k("00001"), nop: NOP_A },
    // B menempati dua bidang yang masing-masing hanya milik B
    { kunci: k("00002"), nop: NOP_B },
    { kunci: k("00003"), nop: NOP_B },
    // bidang 4 dicatat untuk C dan juga tanpa NOP di data lain
    { kunci: k("00004"), nop: NOP_C },
    { kunci: k("00004"), nop: "" },
    // bidang 5 tanpa NOP sama sekali
    { kunci: k("00005"), nop: "" },
  ];
  const a = analisis(baris);
  assert.equal(a.pola({ nop: NOP_A, kunci: [k("00001")] }), "cocok");
  assert.equal(a.pola({ nop: NOP_B, kunci: [k("00002"), k("00003")] }), "banyak_nib");
  assert.equal(a.pola({ nop: NOP_C, kunci: [k("00004")] }), "cocok");
  assert.equal(a.pola({ nop: "", kunci: [k("00005")] }), "tanpa_nop");
  assert.equal(a.pola({ nop: NOP_A, kunci: [] }), "tanpa_nib");
  assert.equal(a.pola({ nop: "", kunci: [] }), "kosong");

  assert.equal(a.statusBidang(k("00001")), "cocok");
  assert.equal(a.statusBidang(k("00002")), "tinjau");
  assert.equal(a.statusBidang(k("00005")), "tanpa_nop");
  assert.equal(a.statusBidang(k("00004")), "cocok");
});

test("analisis: satu bidang untuk beberapa NOP, dan campuran keduanya", () => {
  const k = (nib) => kunciBidang("17117402", nib);
  const a = analisis([
    { kunci: k("00010"), nop: NOP_A },
    { kunci: k("00010"), nop: NOP_B },
    { kunci: k("00011"), nop: NOP_B },
  ]);
  assert.equal(a.pola({ nop: NOP_A, kunci: [k("00010")] }), "banyak_nop");
  assert.equal(a.pola({ nop: NOP_B, kunci: [k("00010"), k("00011")] }), "campuran");
  assert.deepEqual([...a.nopDi(k("00010"))].sort(), [NOP_A, NOP_B]);
  assert.equal(a.statusBidang(k("00010")), "tinjau");
  // Data yang sama disensus dua kali (NOP & NIB sama) tetap 1 NIB = 1 NOP.
  const ganda = analisis([
    { kunci: k("00020"), nop: NOP_C },
    { kunci: k("00020"), nop: NOP_C },
  ]);
  assert.equal(ganda.pola({ nop: NOP_C, kunci: [k("00020")] }), "cocok");
});

test("selisihUrut: id persil urut dan unik, ditulis sebagai selisih; dibaca kembali oleh browser", async () => {
  assert.deepEqual(selisihUrut([30, 10, 12, 10]), [10, 2, 18]);
  const { petaStatusBidang } = await import(pathToFileURL(path.join(__dirname, "../../client/src/lib/persilBpn.js")).href);
  const m = petaStatusBidang({ cocok: selisihUrut([5, 9]), tinjau: selisihUrut([7]), tanpa_nop: [] });
  assert.deepEqual([...m.entries()].sort((x, y) => x[0] - y[0]), [
    [5, "cocok"],
    [7, "tinjau"],
    [9, "cocok"],
  ]);
});

/* ---------- dari jawaban ---------- */

test("nopEntri / bidangEntri / barisEntriNib: NOP pertama yang lengkap, bidang dari semua pertanyaan NIB", () => {
  const jawaban = [
    { tipe: "nop", nilai: "6372" },
    { tipe: "nop", nilai: NOP_A },
    { tipe: "nib", nilai: { bidang: [peta("00001"), peta("00002")], status: "" } },
    { tipe: "nib", nilai: { bidang: [peta("00002")], status: "belum_sertifikat" } },
  ];
  assert.equal(nopEntri(jawaban), NOP_A);
  const { bidang, status } = bidangEntri(jawaban);
  assert.deepEqual(bidang.map((b) => b.nib), ["00001", "00002"]);
  assert.equal(status, "");

  const normal = [
    { q: { id: 1, tipe: "nop" }, nilai: NOP_A },
    { q: { id: 2, tipe: "nib" }, nilai: normalNib({ bidang: [peta("00001"), peta("00002", { luas: null })] }) },
  ];
  assert.deepEqual(barisEntriNib(normal), [
    { pertanyaanId: 2, kodeWilayah: "17117402", nib: "00001", nop: NOP_A, sumber: "peta", luasPeta: 100, urutan: 0 },
    { pertanyaanId: 2, kodeWilayah: "17117402", nib: "00002", nop: NOP_A, sumber: "peta", luasPeta: null, urutan: 1 },
  ]);
});

/* ---------- keluaran ---------- */

const barisLaporan = (lebih = {}) => ({
  entriId: 7,
  kkId: 3,
  nomor: "00012",
  formulir: "PBB-P2",
  judul: "Hj. Siti Aminah",
  nop: NOP_A,
  pola: "banyak_nib",
  status: "",
  bidang: [
    { kunci: "17117402|00001", nib: "17.11.74.02.00001", diPeta: true, tipeHak: "Hak Milik", luas: 120, kelurahan: "Loktabat Utara" },
    { kunci: "17117402|00002", nib: "17.11.74.02.00002", diPeta: false, tipeHak: "", luas: null, kelurahan: "" },
  ],
  luasPeta: 120,
  luasTanah: 150,
  nopLain: [],
  nibLain: [],
  kelurahan: "Loktabat Utara",
  ...lebih,
});

test("saringBaris: menurut pola, lalu NOP / NIB (tanda baca diabaikan) / nama", () => {
  const daftar = [barisLaporan(), barisLaporan({ entriId: 8, pola: "cocok", nop: NOP_B, judul: "Budi" })];
  assert.equal(saringBaris(daftar, { pola: "cocok" }).length, 1);
  assert.equal(saringBaris(daftar, { cari: "63.72.010.001.002-0124" }).length, 1);
  assert.equal(saringBaris(daftar, { cari: "17.11.74.02.00002" }).length, 2);
  assert.equal(saringBaris(daftar, { cari: "siti" }).length, 1);
});

test("tabelLaporan: satu baris per data dengan NIB, luas, selisih, dan tautan", () => {
  const t = tabelLaporan([barisLaporan()], { baseUrl: "https://sensus.contoh" });
  const sel = Object.fromEntries(t.header.map((h, i) => [h, t.baris[0][i]]));
  assert.equal(sel.Pola.teks, POLA.banyak_nib);
  assert.equal(sel.NOP.teks, "63.72.010.001.002-0123.0");
  assert.equal(sel.NIB.teks, "17.11.74.02.00001; 17.11.74.02.00002 (tidak ada di peta BPN)");
  assert.equal(sel["Selisih luas (m²)"].angka, 30);
  assert.equal(sel["Tautan data"].teks, "https://sensus.contoh/kertas-kerja/3/data/7");
});

test("ekspor & CSV: pertanyaan NIB jadi kolom NIB, jumlah bidang, luas peta, tipe hak, kelurahan, keterangan", () => {
  assert.equal(nibLengkap("17117402", "03612"), "17.11.74.02.03612");
  const nilai = {
    bidang: [
      { kode: "17117402", nib: "00001", diPeta: true, tipeHak: "Hak Milik", luas: 120.5, kelurahan: "Loktabat Utara" },
      { kode: "17117402", nib: "00002", diPeta: false, tipeHak: "", luas: null, kelurahan: "" },
    ],
    status: "",
  };
  assert.equal(csvNilai("nib", nilai), "17.11.74.02.00001; 17.11.74.02.00002");
  assert.equal(csvNilai("nib", { bidang: [], status: "belum_sertifikat" }), "Tanah belum bersertifikat");

  const formulir = [{ id: 1, judul: "PBB", pertanyaan: [{ id: 20, tipe: "nib", label: "Bidang" }] }];
  const kk = { id: 5, nomor: "00001", status: "draft", petugas: [] };
  const t = susunEkspor(
    [{ kk, e: { formulirId: 1, createdAt: new Date(0), jawaban: [{ pertanyaanId: 20, nilai }] } }],
    formulir,
    { baseUrl: "", timezone: "Asia/Makassar" }
  );
  assert.deepEqual(t.header.slice(-6), [
    "PBB - Bidang (NIB)",
    "PBB - Bidang (Jumlah bidang)",
    "PBB - Bidang (Luas peta BPN m²)",
    "PBB - Bidang (Tipe hak BPN)",
    "PBB - Bidang (Kelurahan BPN)",
    "PBB - Bidang (Keterangan)",
  ]);
  const ekor = t.baris[0].slice(-6);
  assert.deepEqual(
    ekor.map((c) => c.teks),
    ["17.11.74.02.00001; 17.11.74.02.00002", "2", "120,5", "Hak Milik", "Loktabat Utara", "Tidak ada di peta BPN: 17.11.74.02.00002"]
  );
  assert.equal(ekor[2].angka, 120.5);
});

test("lib/nib.js (browser): bentuk jawaban, NIB lengkap, dan ketikan sertifikat sama dengan server", async () => {
  const nib = await import(pathToFileURL(path.join(__dirname, "../../client/src/lib/nib.js")).href);
  assert.equal(nib.nibLengkap("17117402", "03612"), nibLengkap("17117402", "03612"));
  assert.deepEqual(nib.bacaNibLengkap("17.11.74.02.03612"), { kode: "17117402", nib: "03612" });
  assert.equal(nib.bacaNibLengkap("03612"), null);
  assert.equal(nib.formatKetikanNib("171174020361"), "17.11.74.02.0361");
  assert.deepEqual(nib.STATUS_TANAH, require("../src/answers").STATUS_TANAH);
  const v = nib.nibDari({ bidang: [peta("00001"), peta("00001"), { nib: "" }], status: "belum_sertifikat" });
  assert.equal(v.bidang.length, 1);
  assert.equal(v.status, "");
  assert.equal(nib.formatNib({ bidang: [peta("00001"), peta("00002")] }), "NIB 17.11.74.02.00001 +1 bidang");
  assert.equal(nib.totalLuas([peta("00001"), peta("00002", { luas: 50.25 }), peta("00003", { luas: null })]), 150.25);
});

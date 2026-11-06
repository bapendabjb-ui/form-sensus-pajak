"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

/*
 * Lapisan NOP PBB (src/integrasi.js): NOP yang dicatat langsung pada bidang
 * dari tab NOP di Peta Sensus (tabel bidang_nop), digabung dengan pasangan
 * NIB-NOP dari data sensus (entri_nib). Pasangan yang sama di kedua sumber
 * dihitung sekali; polanya disimpulkan dari keduanya.
 */

const {
  susunBaris,
  susunNopBidang,
  bolehHapusNop,
  bacaKirimanNop,
  susunPasangan,
  tabelPasangan,
  teksGeojsonPbb,
  saringBaris,
  tabelLaporan,
} = require("../src/integrasi");

const NOP_A = "637201000100201230";
const NOP_B = "637201000100201240";
const NOP_C = "637201000100201250";
const K1 = "17117402|00001";
const K2 = "17117402|00002";
const K3 = "17117402|00003";

/** Satu data sensus seperti disusun susunLaporan. */
const data = (id, nop, kunci) => ({
  e: { id, kertasKerjaId: 1, kertasKerja: { nomor: "00001" }, formulir: { judul: "PBB-P2" }, createdAt: new Date(id) },
  jawaban: [{ tipe: "text", nilai: `WP ${id}` }],
  bidang: kunci.map((k) => {
    const [kode, nib] = k.split("|");
    return { kunci: k, kode, nib, sumber: "peta", diPeta: true, luas: 100, kelurahan: "Loktabat Utara" };
  }),
  status: "",
  nop,
});

/** Satu NOP dari peta seperti dibaca bacaNopPetaLengkap. */
const dariPeta = (id, kunci, nop, lebih = {}) => ({
  id,
  kunci,
  nop,
  keterangan: "",
  olehNama: "andi.saputra",
  createdAt: new Date(1000 + id),
  tipeHak: "Hak Milik",
  luas: 200,
  kelurahan: "Loktabat Utara",
  kecamatan: "Banjarbaru Utara",
  diPeta: true,
  ...lebih,
});

test("susunBaris: NOP dari peta yang belum ada di data sensus jadi baris sendiri, per NOP", () => {
  const { baris, ringkas } = susunBaris(
    [data(1, NOP_A, [K1])],
    [
      dariPeta(1, K1, NOP_A), // sama dengan data sensus: tidak jadi baris baru
      dariPeta(2, K2, NOP_B),
      dariPeta(3, K3, NOP_B), // NOP_B menempati dua bidang
    ]
  );
  assert.equal(baris.length, 2);
  const peta = baris.find((b) => b.jenis === "peta");
  assert.equal(peta.nop, NOP_B);
  assert.deepEqual(peta.bidang.map((b) => b.nib), ["17.11.74.02.00002", "17.11.74.02.00003"]);
  assert.equal(peta.pola, "banyak_nib");
  assert.equal(peta.oleh, "andi.saputra");
  assert.equal(peta.luasPeta, 400);
  assert.equal(baris.find((b) => b.jenis === "sensus").pola, "cocok");
  assert.equal(ringkas.data, 1);
  assert.equal(ringkas.peta, 3);
  assert.equal(ringkas.nop, 2);
  assert.equal(ringkas.bidang, 3);
  // K1: NOP_A saja, dan NOP_A hanya di K1 -> cocok. K2/K3: NOP_B di dua bidang -> tinjau.
  assert.equal(ringkas.bidangCocok, 1);
});

test("susunBaris: NOP dari peta yang berbeda di bidang data sensus membuat keduanya perlu ditinjau", () => {
  const { baris } = susunBaris([data(1, NOP_A, [K1])], [dariPeta(1, K1, NOP_C)]);
  const sensus = baris.find((b) => b.jenis === "sensus");
  const peta = baris.find((b) => b.jenis === "peta");
  assert.equal(sensus.pola, "banyak_nop");
  assert.deepEqual(sensus.nopLain, [NOP_C]);
  assert.equal(peta.pola, "banyak_nop");
  assert.deepEqual(peta.nopLain, [NOP_A]);
  // Baris peta bisa dicari dan diekspor; tautannya membuka Peta Sensus di bidangnya.
  assert.equal(saringBaris(baris, { cari: "andi" }).length, 1);
  const t = tabelLaporan([peta], { baseUrl: "https://sensus.contoh" });
  const sel = Object.fromEntries(t.header.map((h, i) => [h, t.baris[0][i]]));
  assert.equal(sel.Sumber.teks, "Peta Sensus (oleh andi.saputra)");
  assert.equal(sel["Tautan data"].teks, "https://sensus.contoh/peta?nib=17.11.74.02.00001");
});

test("susunNopBidang: tab NOP mengelompokkan kedua sumber per NOP, dengan jumlah bidang lain", () => {
  const admin = { role: "admin", id: 1 };
  const isi = susunNopBidang(K1, {
    sensus: [
      { entriId: 5, kkId: 2, nomor: "00002", nop: NOP_A, judul: "Rahmat" },
      { entriId: 6, kkId: 2, nomor: "00002", nop: "", judul: "Tanpa NOP" },
    ],
    peta: [
      { id: 9, nop: NOP_A, keterangan: "sebagian bidang", olehNama: "andi", olehPeran: "petugas", olehId: 4, createdAt: new Date(0) },
      { id: 10, nop: NOP_B, keterangan: "", olehNama: "admin", olehPeran: "admin", olehId: 1, createdAt: new Date(0) },
    ],
    kunciPerNop: new Map([
      [NOP_A, new Set([K1, K2])],
      [NOP_B, new Set([K1])],
    ]),
    pengguna: admin,
  });
  assert.deepEqual(isi.nop.map((g) => g.nop), [NOP_A, NOP_B]);
  assert.equal(isi.nop[0].sensus[0].nomor, "00002");
  assert.equal(isi.nop[0].peta[0].keterangan, "sebagian bidang");
  assert.equal(isi.nop[0].peta[0].bisaHapus, true);
  assert.equal(isi.nop[0].bidangLain, 1);
  assert.equal(isi.nop[1].bidangLain, 0);
  assert.deepEqual(isi.tanpaNop.map((d) => d.entriId), [6]);
});

test("bolehHapusNop: admin, atau petugas yang menambahkannya sendiri", () => {
  const baris = { olehPeran: "petugas", olehId: 4 };
  assert.equal(bolehHapusNop(baris, { role: "admin", id: 1 }), true);
  assert.equal(bolehHapusNop(baris, { role: "petugas", id: 4 }), true);
  assert.equal(bolehHapusNop(baris, { role: "petugas", id: 5 }), false);
  assert.equal(bolehHapusNop(baris, { role: "pejabat", id: 4 }), false);
  assert.equal(bolehHapusNop(baris, null), false);
  // Ditambahkan admin: petugas dengan id yang kebetulan sama tetap tidak boleh.
  assert.equal(bolehHapusNop({ olehPeran: "admin", olehId: 4 }, { role: "petugas", id: 4 }), false);
});

test("bacaKirimanNop: NOP bertitik dibersihkan; NOP pendek, bidang rusak, keterangan panjang ditolak", () => {
  assert.deepEqual(bacaKirimanNop({ kunci: K1, nop: "63.72.010.001.002-0123.0", keterangan: "  sebagian   bidang " }), {
    kode: "17117402",
    nib: "00001",
    nop: NOP_A,
    keterangan: "sebagian bidang",
  });
  assert.throws(() => bacaKirimanNop({ kunci: K1, nop: "6372" }), /18 digit/);
  assert.throws(() => bacaKirimanNop({ kunci: "tanpa-garis", nop: NOP_A }), /Bidang tidak dikenal/);
  assert.throws(() => bacaKirimanNop({ kunci: "17117402|", nop: NOP_A }), /Bidang tidak dikenal/);
  assert.throws(() => bacaKirimanNop({ kunci: "abc|00001", nop: NOP_A }), /Bidang tidak dikenal/);
  assert.throws(() => bacaKirimanNop({ kunci: K1, nop: NOP_A, keterangan: "x".repeat(201) }), /200 huruf/);
});

test("susunPasangan & tabelPasangan: satu baris per pasangan, sumber digabung, bidang tanpa NOP tetap tampil", () => {
  const pasangan = susunPasangan(
    [
      { entriId: 1, kkId: 1, nomor: "00001", kunci: K1, nop: NOP_A },
      { entriId: 2, kkId: 1, nomor: "00001", kunci: K3, nop: "" },
    ],
    [
      { kunci: K1, nop: NOP_A, keterangan: "rumah", olehNama: "andi" },
      { kunci: K2, nop: NOP_B, keterangan: "", olehNama: "budi" },
    ]
  );
  assert.deepEqual(
    pasangan.map((p) => [p.kunci, p.nop, p.status]),
    [
      [K1, NOP_A, "cocok"],
      [K2, NOP_B, "cocok"],
      [K3, "", "tanpa_nop"],
    ]
  );
  const t = tabelPasangan(pasangan, new Map([[K1, { tipeHak: "Hak Milik", luasPeta: 120, kelurahan: "Loktabat Utara", kecamatan: "Banjarbaru Utara" }]]), {
    baseUrl: "https://sensus.contoh",
  });
  const sel = Object.fromEntries(t.header.map((h, i) => [h, t.baris[0][i]]));
  assert.equal(sel.NIB.teks, "17.11.74.02.00001");
  assert.equal(sel.NOP.teks, "63.72.010.001.002-0123.0");
  assert.equal(sel.Sumber.teks, "Data sensus + peta");
  assert.equal(sel["Keterangan (peta)"].teks, "rumah");
  assert.equal(sel["Luas peta BPN (m²)"].angka, 120);
  assert.equal(sel["Tautan data"].teks, "https://sensus.contoh/kertas-kerja/1/data/1");
});

test("teksGeojsonPbb: satu Feature per bidang dengan NOP dan statusnya, tanpa data pribadi", () => {
  const pasangan = susunPasangan(
    [{ entriId: 1, kkId: 1, nomor: "00001", kunci: K1, nop: NOP_A }],
    [
      { kunci: K1, nop: NOP_B, keterangan: "", olehNama: "andi" },
      { kunci: K2, nop: NOP_C, keterangan: "", olehNama: "andi" },
    ]
  );
  const geometri = '{"type":"MultiPolygon","coordinates":[[[[114.8,-3.45],[114.801,-3.45],[114.801,-3.451],[114.8,-3.45]]]]}';
  const persil = new Map([
    [K1, { tipeHak: "Hak Milik", luasPeta: 120, kelurahan: "Loktabat Utara", kecamatan: "Banjarbaru Utara", geometri }],
    // K2 tidak ada di peta BPN aktif: dilewati, bukan Feature tanpa bentuk.
  ]);
  const g = JSON.parse(teksGeojsonPbb(pasangan, persil));
  assert.equal(g.type, "FeatureCollection");
  assert.equal(g.features.length, 1);
  const p = g.features[0].properties;
  assert.equal(p.nib, "17.11.74.02.00001");
  assert.equal(p.nop, "", "dua NOP: kolom nop tunggal dikosongkan");
  assert.equal(p.daftar_nop, "63.72.010.001.002-0123.0; 63.72.010.001.002-0124.0");
  assert.equal(p.jumlah_nop, 2);
  assert.equal(p.status, "tinjau");
  assert.equal(p.sumber, "Data sensus + peta");
  assert.equal(g.features[0].geometry.type, "MultiPolygon");
  assert.ok(!JSON.stringify(g).includes("andi"), "nama penambah tidak ikut ke GeoJSON");
});

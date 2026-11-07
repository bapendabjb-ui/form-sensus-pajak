"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

/*
 * Pemadanan NIB-NOP (lapisan Terintegrasi, src/integrasi.js): keputusan
 * petugas / admin untuk bidang yang punya beberapa NOP atau yang NOP-nya juga
 * tercatat di bidang lain, dan status setiap bidang sesudahnya.
 */

const {
  susunTerpadu,
  keputusanBerlaku,
  bacaKirimanPadanan,
  susunAntrean,
  susunTindakLanjut,
  tabelTindakLanjut,
  tabelPasangan,
  teksGeojsonPbb,
  susunPasangan,
} = require("../src/integrasi");

const A = "637203200300903540";
const B = "637203200300903550";
const C = "637203200300903560";
const K1 = "17117105|02141";
const K2 = "17117105|02142";
const K3 = "17117105|02143";

const padan = (kunci, nopUtama, lain = {}) => ({
  kunci,
  hasil: "padan",
  nopUtama,
  rincian: [{ nop: nopUtama, tindak: "utama" }, ...Object.entries(lain).map(([nop, tindak]) => ({ nop, tindak }))],
});

test("susunTerpadu: 1 NIB = 1 NOP padan dengan sendirinya, 1 NIB 2 NOP perlu dipadankan", () => {
  const t = susunTerpadu([
    { kunci: K1, nop: A },
    { kunci: K2, nop: A },
    { kunci: K2, nop: B },
    { kunci: K3, nop: C },
    { kunci: "17117105|09999", nop: "" },
  ]);
  assert.deepEqual(t.get(K3), { status: "padan", nop: C, alasan: "", berlaku: null, daftarNop: [C] });
  assert.equal(t.get(K2).status, "tinjau");
  assert.equal(t.get(K2).alasan, "banyak_nop");
  // K1 hanya NOP A, tetapi A juga tercatat di K2.
  assert.equal(t.get(K1).alasan, "nop_bidang_lain");
  assert.equal(t.get("17117105|09999").status, "tanpa_nop");
});

test("susunTerpadu: sesudah dipadankan - NOP ganda tidak lagi membuat bidang lain perlu dipadankan", () => {
  const pasangan = [
    { kunci: K1, nop: A },
    { kunci: K1, nop: B },
    { kunci: K2, nop: B },
  ];
  // K1: A benar, B terdaftar dua kali. B tidak lagi dipakai K1, jadi K2 (hanya B) padan.
  const t = susunTerpadu(pasangan, [padan(K1, A, { [B]: "ganda" })]);
  assert.equal(t.get(K1).status, "padan");
  assert.equal(t.get(K1).nop, A);
  assert.equal(t.get(K1).berlaku, true);
  assert.equal(t.get(K2).status, "padan");
  assert.equal(t.get(K2).nop, B);
});

test("susunTerpadu: NOP yang dipadankan ke bidang lain, bentrok, dan semua sah (perlu dipecah)", () => {
  const pasangan = [
    { kunci: K1, nop: A },
    { kunci: K2, nop: A },
  ];
  // K1 memadankan A; K2 belum - K1 padan, K2 perlu dipadankan.
  let t = susunTerpadu(pasangan, [padan(K1, A)]);
  assert.equal(t.get(K1).status, "padan");
  assert.equal(t.get(K2).alasan, "sudah_dipadankan");
  // Keduanya memadankan A: bentrok.
  t = susunTerpadu(pasangan, [padan(K1, A), padan(K2, A)]);
  assert.equal(t.get(K1).alasan, "bentrok");
  assert.equal(t.get(K2).alasan, "bentrok");
  // NOP A memang mencakup kedua bidang: perlu dipecah.
  const pecah = (kunci) => ({ kunci, hasil: "pecah", nopUtama: "", rincian: [{ nop: A, tindak: "sah" }] });
  t = susunTerpadu(pasangan, [pecah(K1), pecah(K2)]);
  assert.equal(t.get(K1).status, "pecah");
  assert.equal(t.get(K2).status, "pecah");
  // NOP-nya ternyata milik bidang lain: K2 belum ber-NOP, K1 padan.
  t = susunTerpadu(pasangan, [{ kunci: K2, hasil: "tanpa", nopUtama: "", rincian: [{ nop: A, tindak: "salah_bidang" }] }]);
  assert.equal(t.get(K2).status, "tanpa_nop");
  assert.equal(t.get(K1).status, "padan");
});

test("keputusanBerlaku: NOP baru sesudah dipadankan membatalkan keputusan; NOP yang dihapus tidak", () => {
  const d = padan(K1, A, { [B]: "ganda" });
  assert.equal(keputusanBerlaku(d, new Set([A, B])), true);
  assert.equal(keputusanBerlaku(d, new Set([A])), true);
  assert.equal(keputusanBerlaku(d, new Set([A, B, C])), false);
  assert.equal(keputusanBerlaku(d, new Set([B])), false);
  assert.equal(keputusanBerlaku(d, new Set()), false);
  const t = susunTerpadu(
    [
      { kunci: K1, nop: A },
      { kunci: K1, nop: B },
      { kunci: K1, nop: C },
    ],
    [d]
  );
  assert.equal(t.get(K1).status, "tinjau");
  assert.equal(t.get(K1).alasan, "berubah");
  assert.equal(t.get(K1).berlaku, false);
});

test("bacaKirimanPadanan: hasil disimpulkan dari tindak tiap NOP, NOP baru tidak boleh terlewat", () => {
  const kirim = (rincian, sekarang = [A, B], lain = {}) => bacaKirimanPadanan({ kunci: K1, rincian, ...lain }, new Set(sekarang));
  const p = kirim(
    [
      { nop: "63.72.032.003.009-0354.0", tindak: "utama", luasPbb: "150", luasBeda: true },
      { nop: B, tindak: "ganda", luasPbb: 160, luasBeda: true },
    ],
    [A, B],
    { catatan: "  rumah   pak Ahmad " }
  );
  assert.equal(p.hasil, "padan");
  assert.equal(p.nopUtama, A);
  assert.equal(p.catatan, "rumah pak Ahmad");
  assert.deepEqual(p.rincian, [
    { nop: A, tindak: "utama", luasPbb: 150, luasBeda: true },
    // Luas NOP ganda tidak perlu disesuaikan.
    { nop: B, tindak: "ganda", luasPbb: 160, luasBeda: false },
  ]);
  assert.equal(kirim([{ nop: A, tindak: "sah" }, { nop: B, tindak: "sah" }]).hasil, "pecah");
  assert.equal(kirim([{ nop: A, tindak: "salah_bidang" }], [A]).hasil, "tanpa");
  // NOP formulir yang belum tersimpan boleh ikut disebut.
  assert.equal(kirim([{ nop: C, tindak: "utama" }, { nop: A, tindak: "gabung" }, { nop: B, tindak: "ganda" }]).nopUtama, C);

  assert.throws(() => kirim([{ nop: A, tindak: "utama" }]), /NOP baru/);
  assert.throws(() => kirim([{ nop: A, tindak: "utama" }, { nop: B, tindak: "utama" }]), /satu NOP saja/);
  assert.throws(() => kirim([{ nop: A, tindak: "utama" }, { nop: B, tindak: "sah" }]), /semua NOP benar/);
  assert.throws(() => kirim([{ nop: A, tindak: "utama" }, { nop: B, tindak: "" }]), /kenapa/);
  assert.throws(() => kirim([{ nop: A, tindak: "ganda" }, { nop: B, tindak: "ganda" }]), /mana yang benar/);
  assert.throws(() => kirim([]), /Pilih dulu/);
  assert.throws(() => bacaKirimanPadanan({ kunci: "rusak", rincian: [{ nop: A, tindak: "utama" }] }), /Bidang tidak dikenal/);
});

test("susunAntrean: jumlah tiap status dan bidang yang perlu dipadankan, keputusan usang lebih dulu", () => {
  const t = susunTerpadu(
    [
      { kunci: K1, nop: A },
      { kunci: K1, nop: B },
      { kunci: K2, nop: C },
      { kunci: K2, nop: B },
      { kunci: K3, nop: "637203200300903570" },
    ],
    [padan(K2, C)]
  );
  const persil = new Map([[K1, { luasPeta: 160, tipeHak: "Hak Milik", kelurahan: "Loktabat Utara", kecamatan: "Banjarbaru Utara" }]]);
  const { ringkas, baris } = susunAntrean(t, persil);
  assert.deepEqual(ringkas, { padan: 1, tinjau: 2, pecah: 0, tanpa_nop: 0 });
  assert.deepEqual(
    baris.map((b) => [b.kunci, b.alasan]),
    [
      [K2, "berubah"],
      [K1, "banyak_nop"],
    ]
  );
  assert.equal(baris[1].nib, "17.11.71.05.02141");
  assert.equal(baris[1].luas, 160);
  assert.equal(baris[1].diPeta, true);
  assert.deepEqual(baris[1].nop, [A, B]);
});

test("tindak lanjut: NOP ganda, gabung, luas, pecah sertifikat, dan cek letak - hanya dari keputusan yang berlaku", () => {
  const pasangan = [
    { kunci: K1, nop: A },
    { kunci: K1, nop: B },
    { kunci: K1, nop: C },
    { kunci: K2, nop: A },
    { kunci: K2, nop: B },
    { kunci: K3, nop: "637203200300903570" },
  ];
  const waktu = new Date("2026-11-07T02:30:00Z");
  const keputusan = [
    {
      ...padan(K1, A),
      rincian: [
        { nop: A, tindak: "utama", luasPbb: 150, luasBeda: true },
        { nop: B, tindak: "ganda", luasPbb: 160 },
        { nop: C, tindak: "gabung", luasPbb: 20 },
      ],
      catatan: "",
      oleh: "Budi",
      waktu,
    },
    { kunci: K2, hasil: "pecah", nopUtama: "", rincian: [{ nop: A, tindak: "sah" }, { nop: B, tindak: "sah" }], catatan: "", oleh: "Sari", waktu },
    // Usang: K3 sekarang punya NOP lain.
    { ...padan(K3, C), catatan: "", oleh: "Budi", waktu },
  ];
  const t = susunTerpadu(pasangan, keputusan);
  const baris = susunTindakLanjut(keputusan, t);
  assert.deepEqual(
    baris.map((b) => [b.jenis, b.kunci, b.nop]),
    [
      ["hapus_ganda", K1, [B]],
      ["gabung", K1, [C]],
      ["luas", K1, [A]],
      ["pecah_sertifikat", K2, [A, B]],
    ]
  );
  const persil = new Map([[K1, { luasPeta: 160, tipeHak: "Hak Milik", kelurahan: "Loktabat Utara", kecamatan: "Banjarbaru Utara" }]]);
  const tabel = tabelTindakLanjut(baris, persil, { baseUrl: "https://sensus.contoh", timezone: "Asia/Makassar" });
  const luas = tabel.baris[2];
  const kolom = (nama) => tabel.header.indexOf(nama);
  assert.equal(luas[kolom("Tindak lanjut")].teks, "Sesuaikan luas bumi PBB dengan BPN");
  assert.equal(luas[kolom("NOP")].teks, "63.72.032.003.009-0354.0");
  assert.equal(luas[kolom("Luas PBB (m²)")].angka, 150);
  assert.equal(luas[kolom("Luas peta BPN (m²)")].angka, 160);
  assert.equal(luas[kolom("Selisih luas (m²)")].angka, -10);
  assert.equal(luas[kolom("Dipadankan oleh")].teks, "Budi");
  assert.match(luas[kolom("Waktu")].teks, /7 November 2026/);
  assert.equal(luas[kolom("Tautan peta")].teks, "https://sensus.contoh/peta?nib=17.11.71.05.02141");
  assert.equal(tabel.baris[3][kolom("Untuk")].teks, "BPN");
});

test("unduhan lapisan: status terintegrasi dan NOP padanan ikut di Excel pasangan dan GeoJSON", () => {
  const sensus = [];
  const peta = [
    { kunci: K1, nop: A, keterangan: "", olehNama: "Budi" },
    { kunci: K1, nop: B, keterangan: "", olehNama: "Budi" },
  ];
  const keputusan = [padan(K1, A, { [B]: "ganda" })];
  const terpadu = susunTerpadu([...sensus, ...peta], keputusan);
  const pasangan = susunPasangan(sensus, peta);
  const tabel = tabelPasangan(pasangan, new Map(), { terpadu, keputusan: new Map(keputusan.map((d) => [d.kunci, d])) });
  const i = tabel.header.indexOf("Status terintegrasi");
  const j = tabel.header.indexOf("Hasil padanan");
  assert.deepEqual(
    tabel.baris.map((b) => [b[i].teks, b[j].teks]),
    [
      ["Padan: 1 NIB = 1 NOP", "NOP bidang ini"],
      ["Padan: 1 NIB = 1 NOP", "Terdaftar dua kali"],
    ]
  );
  const persil = new Map([[K1, { geometri: '{"type":"Point","coordinates":[114.8,-3.4]}', tipeHak: "", luasPeta: 160, kelurahan: "", kecamatan: "" }]]);
  const f = JSON.parse(teksGeojsonPbb(pasangan, persil, terpadu)).features[0].properties;
  assert.equal(f.status, "tinjau");
  assert.equal(f.status_terpadu, "padan");
  assert.equal(f.nop_padan, "63.72.032.003.009-0354.0");
  assert.equal(f.daftar_nop, "63.72.032.003.009-0354.0; 63.72.032.003.009-0355.0");
});

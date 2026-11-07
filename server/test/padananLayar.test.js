"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

/*
 * Pemadanan di layar (client/src/lib/padanan.js): pilihan petugas menjadi
 * kiriman yang diterima server (src/integrasi.js bacaKirimanPadanan), petunjuk
 * dari luas, dan baris status di kotak NOP bidang.
 */

const { bacaKirimanPadanan } = require("../src/integrasi");

const muat = () => import(pathToFileURL(path.join(__dirname, "../../client/src/lib/padanan.js")).href);

const A = "637203200300903540";
const B = "637203200300903550";
const K = "17117105|02141";

test("petunjukLuas: terdaftar dua kali, tanah dibagi, atau luas PBB belum diperbarui", async () => {
  const { petunjukLuas, luasBeda } = await muat();
  assert.match(petunjukLuas(160, [158, 165]), /terdaftar dua kali/);
  assert.match(petunjukLuas(512, [300, 210]), /sudah dibagi/);
  assert.match(petunjukLuas(512, [120, 140]), /belum diperbarui/);
  assert.match(petunjukLuas(160, [120]), /belum diperbarui/);
  assert.equal(petunjukLuas(160, [158]), "");
  // Luas yang tidak diketahui: tidak ada petunjuk.
  assert.equal(petunjukLuas(160, [158, null]), "");
  assert.equal(petunjukLuas(null, [158, 160]), "");
  assert.equal(luasBeda(150, 160), false);
  assert.equal(luasBeda(120, 160), true);
  assert.equal(luasBeda(null, 160), false);
});

test("susunRincian: pilihan di layar diterima server; belum lengkap -> null", async () => {
  const { susunRincian, pilihanDari } = await muat();
  const luas = { [A]: 120, [B]: 160 };
  assert.equal(susunRincian([A, B], { pilihan: A }), null);
  const r = susunRincian([A, B], { pilihan: A, lain: { [B]: "ganda" }, luas, sesuaikan: { [A]: true, [B]: true } });
  assert.deepEqual(r, [
    { nop: A, tindak: "utama", luasPbb: 120, luasBeda: true },
    { nop: B, tindak: "ganda", luasPbb: 160, luasBeda: false },
  ]);
  const p = bacaKirimanPadanan({ kunci: K, rincian: r }, new Set([A, B]));
  assert.equal(p.hasil, "padan");
  assert.equal(p.nopUtama, A);
  assert.equal(bacaKirimanPadanan({ kunci: K, rincian: susunRincian([A, B], { pilihan: "pecah" }) }, new Set([A, B])).hasil, "pecah");
  assert.equal(bacaKirimanPadanan({ kunci: K, rincian: susunRincian([A], { pilihan: "tanpa" }) }, new Set([A])).hasil, "tanpa");
  // Keputusan tersimpan -> pilihan yang sama di layar.
  const kembali = pilihanDari({ hasil: "padan", nopUtama: A, rincian: p.rincian, catatan: "x" });
  assert.deepEqual(kembali, { pilihan: A, lain: { [B]: "ganda" }, sesuaikan: { [A]: true }, catatan: "x" });
});

test("ringkasPadanan: baris status kotak NOP bidang", async () => {
  const { ringkasPadanan } = await muat();
  const kep = { hasil: "padan", nopUtama: A, rincian: [{ nop: A, tindak: "utama" }, { nop: B, tindak: "ganda" }], oleh: "Budi" };
  // Dua NOP, belum dipadankan.
  assert.deepEqual(
    [ringkasPadanan({ daftarNop: [A, B] })].map((x) => [x.status, x.aksi, x.sub]),
    [["tinjau", "padankan", "Ada 2 NOP di bidang ini"]]
  );
  // Sudah dipadankan dan mencakup semua NOP.
  const sudah = ringkasPadanan({ daftarNop: [A, B], padan: { status: "padan", keputusan: kep } });
  assert.equal(sudah.status, "padan");
  assert.equal(sudah.aksi, "ubah");
  assert.equal(sudah.nop, A);
  // NOP formulir baru yang belum disebut keputusan: perlu dipadankan lagi.
  assert.equal(ringkasPadanan({ daftarNop: [A, B, "637203200300903560"], padan: { status: "padan", keputusan: kep } }).judul, "Perlu dipadankan lagi");
  // Satu NOP: padan dengan sendirinya - di formulir tidak perlu disebut.
  assert.equal(ringkasPadanan({ daftarNop: [A] }).status, "padan");
  assert.equal(ringkasPadanan({ daftarNop: [A], formulir: true }), null);
  assert.equal(ringkasPadanan({ daftarNop: [A], bidangLain: true }).aksi, "padankan");
  assert.equal(ringkasPadanan({ daftarNop: [] }), null);
});

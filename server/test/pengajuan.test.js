"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { bacaPengajuan, judulData, judulPengajuanData, bentukPengajuanTerakhir } = require("../src/pengajuan");

/*
 * Kiriman pengajuan hapus datang dari halaman lapangan yang terbuka tanpa
 * login, jadi yang dijaga bukan hanya jalur normalnya.
 */

const sah = { jenis: "entri", sasaranId: 12, petugasId: 3, alasan: "Data ganda" };

test("bacaPengajuan menerima kiriman yang sah", () => {
  assert.deepEqual(bacaPengajuan(sah), sah);
  assert.deepEqual(bacaPengajuan({ ...sah, jenis: "kertas_kerja", sasaranId: "7", petugasId: "2" }), {
    jenis: "kertas_kerja",
    sasaranId: 7,
    petugasId: 2,
    alasan: "Data ganda",
  });
});

test("bacaPengajuan merapikan spasi di tepi alasan", () => {
  assert.equal(bacaPengajuan({ ...sah, alasan: "  salah formulir \n" }).alasan, "salah formulir");
});

test("bacaPengajuan menolak jenis yang tidak dikenal", () => {
  for (const jenis of [undefined, "", "formulir", "KERTAS_KERJA"]) {
    assert.throws(() => bacaPengajuan({ ...sah, jenis }), { status: 400 });
  }
});

test("bacaPengajuan menolak sasaran & petugas yang tidak sah", () => {
  for (const nilai of [undefined, 0, -1, 1.5, "abc"]) {
    assert.throws(() => bacaPengajuan({ ...sah, sasaranId: nilai }), { status: 400 });
    assert.throws(() => bacaPengajuan({ ...sah, petugasId: nilai }), { status: 400 });
  }
});

test("bacaPengajuan mewajibkan alasan dan membatasi panjangnya", () => {
  assert.throws(() => bacaPengajuan({ ...sah, alasan: "" }), /alasan/i);
  assert.throws(() => bacaPengajuan({ ...sah, alasan: "   " }), /alasan/i);
  assert.throws(() => bacaPengajuan({ ...sah, alasan: undefined }), /alasan/i);
  assert.equal(bacaPengajuan({ ...sah, alasan: "a".repeat(500) }).alasan.length, 500);
  assert.throws(() => bacaPengajuan({ ...sah, alasan: "a".repeat(501) }), /500/);
});

test("bacaPengajuan tidak meledak pada body kosong", () => {
  assert.throws(() => bacaPengajuan(undefined), { status: 400 });
  assert.throws(() => bacaPengajuan(null), { status: 400 });
  assert.throws(() => bacaPengajuan("teks"), { status: 400 });
});

/* Judul data - harus sama dengan judulEntri di client/src/lib/ringkas.js. */

const pertanyaan = [
  { id: 1, tipe: "nop", wajib: true },
  { id: 2, tipe: "text", wajib: false },
  { id: 3, tipe: "text", wajib: true },
  { id: 4, tipe: "foto", wajib: true },
];

test("judulData mendahulukan jawaban teks dari pertanyaan wajib", () => {
  assert.equal(judulData(pertanyaan, { 1: "637203100400101020", 2: "Catatan", 3: " Toko Budi " }), "Toko Budi");
});

test("judulData jatuh ke jawaban teks mana pun bila yang wajib kosong", () => {
  assert.equal(judulData(pertanyaan, { 2: "Catatan", 3: "  " }), "Catatan");
});

test("judulData kosong bila tidak ada jawaban teks", () => {
  assert.equal(judulData(pertanyaan, { 1: "637203100400101020" }), "");
  assert.equal(judulData(), "");
});

test("judulPengajuanData menyertakan nama formulir dan dibatasi 300 karakter", () => {
  assert.equal(judulPengajuanData("Toko Budi", "PBJT Restoran"), "Toko Budi · PBJT Restoran");
  assert.equal(judulPengajuanData("", "PBJT Restoran"), "PBJT Restoran");
  assert.equal(judulPengajuanData("x".repeat(400), "PBJT Restoran").length, 300);
});

test("bentukPengajuanTerakhir mengambil baris pertama atau null", () => {
  assert.equal(bentukPengajuanTerakhir([]), null);
  assert.equal(bentukPengajuanTerakhir(), null);
  const p = bentukPengajuanTerakhir([{ id: 5, jenis: "entri", status: "menunggu", alasan: "x", extra: 1 }]);
  assert.equal(p.id, 5);
  assert.equal(p.status, "menunggu");
  assert.equal("extra" in p, false);
});

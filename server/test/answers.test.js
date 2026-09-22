"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeNilai,
  nilaiTerisi,
  pesanFormat,
  barisRincianTarif,
  PANJANG_NIK,
  PANJANG_NOP,
} = require("../src/answers");

/*
 * Aturan yang sama ditulis dua kali - di sini dan di client/src/lib/answers.js.
 * Tes ini mengunci sisi server sebagai acuan: kalau keduanya menyimpang, yang
 * menentukan adalah yang diuji.
 */

test("normalizeNilai merapikan teks & angka", () => {
  assert.equal(normalizeNilai("text", "  Budi  "), "Budi");
  assert.equal(normalizeNilai("text", null), "");
  assert.equal(normalizeNilai("number", "12,5"), "12.5");
  assert.equal(normalizeNilai("number", "bukan angka"), "");
  assert.equal(normalizeNilai("date", "2026-09-21"), "2026-09-21");
  assert.equal(normalizeNilai("date", "21/09/2026"), "", "format non-ISO dibuang");
});

test("normalizeNilai membuang isian kosong dari daftar", () => {
  assert.deepEqual(normalizeNilai("checkbox", ["a", "", "  ", "b"]), ["a", "b"]);
  assert.deepEqual(normalizeNilai("checkbox", "bukan array"), []);
  assert.deepEqual(
    normalizeNilai("linetariff", [{ layanan: "", jenis: "", harga_min: null, harga_max: null }]),
    [],
    "baris yang seluruhnya kosong tidak disimpan"
  );
});

test("normalizeNilai menolak luas negatif", () => {
  assert.deepEqual(normalizeNilai("luas", { tanah: 120.456, bangunan: -5 }), {
    tanah: 120.46,
    bangunan: null,
  });
  assert.deepEqual(normalizeNilai("luas", { tanah: 0, bangunan: 0 }), { tanah: 0, bangunan: 0 });
});

test("wilayah: di luar Banjarbaru hanya disimpan bila diketik manual", () => {
  assert.deepEqual(normalizeNilai("wilayah", { kecamatan: "Menteng", kelurahan: "Gondangdia", manual: true }), {
    kecamatan: "Menteng",
    kode_kecamatan: "",
    kelurahan: "Gondangdia",
    kode_kelurahan: "",
    manual: true,
  });
  assert.equal(
    normalizeNilai("wilayah", { kecamatan: "banjarmasin selatan", kelurahan: "KELAYAN", manual: true }).kecamatan,
    "Banjarmasin Selatan"
  );
  // Ketikan manual yang ternyata ada di data Banjarbaru disimpan lengkap dengan kodenya.
  const cocok = normalizeNilai("wilayah", { kecamatan: "banjarbaru utara", kelurahan: "loktabat utara", manual: true });
  assert.equal(cocok.kode_kelurahan, "001");
  assert.equal(cocok.manual, undefined);
  // Tanpa tanda manual, nama yang tidak dikenal tetap ditolak.
  assert.equal(normalizeNilai("wilayah", { kecamatan: "Menteng", kelurahan: "Gondangdia" }).kecamatan, "");
});

test("nilaiTerisi memahami arti 'kosong' tiap tipe", () => {
  // Bangunan 0 sah (tanah kosong), tetapi harus ada nilainya.
  assert.equal(nilaiTerisi("luas", { tanah: 120, bangunan: 0 }), true);
  assert.equal(nilaiTerisi("luas", { tanah: 120, bangunan: null }), false);

  // Badan usaha tidak punya NIK, perorangan belum tentu punya NPWP.
  assert.equal(nilaiTerisi("niknpwp", { nik: "", npwp: "123456789012345" }), true);
  assert.equal(nilaiTerisi("niknpwp", { nik: "", npwp: "" }), false);

  assert.equal(nilaiTerisi("wilayah", { kecamatan: "Cempaka", kelurahan: "" }), false);
  assert.equal(nilaiTerisi("lokasi", { lat: null, lon: null }), false);
  assert.equal(nilaiTerisi("lokasi", { lat: -3.4, lon: 114.8 }), true);
  assert.equal(nilaiTerisi("rtrw", { rt: "001", rw: "" }), false);
  assert.equal(nilaiTerisi("foto", []), false);
  assert.equal(nilaiTerisi("text", "   "), false);
});

test("pesanFormat memeriksa panjang digit kolom identitas", () => {
  assert.equal(pesanFormat("nik", "6371012345670001".slice(0, PANJANG_NIK)), "");
  assert.ok(pesanFormat("nik", "123").includes(String(PANJANG_NIK)));
  assert.equal(pesanFormat("nik", ""), "", "kolom kosong bukan urusan format");

  assert.equal(pesanFormat("nop", "6".repeat(PANJANG_NOP)), "");
  assert.ok(pesanFormat("nop", "6".repeat(PANJANG_NOP - 1)) !== "");

  assert.equal(pesanFormat("telepon", [{ keterangan: "Pemilik", nomor: "081234567890" }]), "");
  assert.ok(pesanFormat("telepon", [{ keterangan: "Pemilik", nomor: "" }]).includes("Pemilik"));
  assert.ok(pesanFormat("telepon", [{ nomor: "123" }]) !== "", "nomor terlalu pendek ditolak");
});

test("barisRincianTarif hanya menyimpan baris yang berisi", () => {
  const baris = barisRincianTarif([
    { layanan: "Kamar Standar", jenis: "Harian", harga_min: 250000, harga_max: 400000 },
    { layanan: "", jenis: "", harga_min: null, harga_max: null },
  ]);
  assert.equal(baris.length, 1);
  assert.equal(baris[0].layanan, "Kamar Standar");
});

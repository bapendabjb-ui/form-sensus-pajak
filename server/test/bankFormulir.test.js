"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JENIS_BERKAS, susunBerkasBank, bacaBerkasBank, kunciJudul } = require("../src/bankFormulir");

const formulirDb = {
  id: 7,
  judul: "Hotel",
  deskripsi: "Pendataan hotel",
  ikon: "bed",
  judulKolomKiri: "Subjek",
  judulKolomKanan: "Objek",
  urutan: 3,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  pertanyaan: [
    { id: 41, tipe: "text", label: "Nama usaha", keterangan: "", wajib: true, rangeHarga: false, isiEpbb: "", kolom: "kiri", urutan: 0, opsi: [] },
    { id: 42, tipe: "dropdown", label: "Kelas", keterangan: "Sesuai izin", wajib: false, rangeHarga: false, isiEpbb: "", kolom: "", urutan: 1, opsi: ["Melati", "Bintang"] },
  ],
};

const berkas = (formulir) => ({ jenis: JENIS_BERKAS, versi: 1, formulir });

test("susunBerkasBank membuang id dan menyertakan penanda berkas", () => {
  const isi = susunBerkasBank([formulirDb], new Date("2026-09-22T01:02:03Z"));
  assert.equal(isi.jenis, JENIS_BERKAS);
  assert.equal(isi.diekspor, "2026-09-22T01:02:03.000Z");
  assert.equal(isi.formulir.length, 1);
  assert.equal(isi.formulir[0].id, undefined);
  assert.equal(isi.formulir[0].pertanyaan[0].id, undefined);
  assert.deepEqual(isi.formulir[0].pertanyaan[1].opsi, ["Melati", "Bintang"]);
  assert.equal(isi.formulir[0].pertanyaan[0].kolom, "kiri");
});

test("hasil ekspor bisa diimpor kembali utuh ke server lain", () => {
  const isi = JSON.parse(JSON.stringify(susunBerkasBank([formulirDb])));
  const hasil = bacaBerkasBank(isi, []);
  assert.equal(hasil.dibaca, 1);
  assert.equal(hasil.tambah.length, 1);
  const f = hasil.tambah[0];
  assert.equal(f.judul, "Hotel");
  assert.equal(f.ikon, "bed");
  assert.equal(f.judulKolomKiri, "Subjek");
  assert.deepEqual(
    f.pertanyaan.map((q) => [q.id, q.tipe, q.label, q.wajib, q.urutan]),
    [
      [null, "text", "Nama usaha", true, 0],
      [null, "dropdown", "Kelas", false, 1],
    ]
  );
});

test("bacaBerkasBank tidak memakai id pertanyaan dari berkas", () => {
  const hasil = bacaBerkasBank(berkas([{ judul: "A", pertanyaan: [{ id: 5, tipe: "text", label: "X" }] }]));
  assert.equal(hasil.tambah[0].pertanyaan[0].id, null);
});

test("bacaBerkasBank melewati judul yang sudah ada, juga yang kembar di berkas", () => {
  const hasil = bacaBerkasBank(
    berkas([{ judul: "hotel " }, { judul: "Restoran" }, { judul: "restoran" }]),
    ["Hotel"]
  );
  assert.deepEqual(hasil.tambah.map((f) => f.judul), ["Restoran"]);
  assert.deepEqual(
    hasil.dilewati.map((m) => [m.baris, m.nama]),
    [
      [1, "hotel"],
      [3, "restoran"],
    ]
  );
});

test("bacaBerkasBank menolak formulir tidak sah tanpa menggagalkan sisanya", () => {
  const hasil = bacaBerkasBank(
    berkas([
      { judul: "" },
      { judul: "Parkir", pertanyaan: [{ tipe: "radio", label: "Jenis", opsi: [] }] },
      { judul: "Hiburan", pertanyaan: [{ tipe: "tidak-ada", label: "?" }] },
      { judul: "Reklame" },
    ])
  );
  assert.deepEqual(hasil.tambah.map((f) => f.judul), ["Reklame"]);
  assert.deepEqual(hasil.ditolak.map((m) => m.baris), [1, 2, 3]);
  assert.match(hasil.ditolak[1].alasan, /minimal satu opsi/);
});

test("bacaBerkasBank menolak berkas yang bukan bank formulir", () => {
  assert.ok(bacaBerkasBank(null).galat);
  assert.ok(bacaBerkasBank([{ judul: "A" }]).galat);
  assert.ok(bacaBerkasBank({ jenis: "lain", formulir: [] }).galat);
  assert.ok(bacaBerkasBank(berkas([])).galat);
  assert.match(bacaBerkasBank({ ...berkas([{ judul: "A" }]), versi: 99 }).galat, /versi/);
});

test("kunciJudul mengabaikan huruf besar dan spasi ganda", () => {
  assert.equal(kunciJudul("  Rumah   Makan "), "rumah makan");
});

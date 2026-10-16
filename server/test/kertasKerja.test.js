"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Semuanya memang diekspor routes/kertasKerja.js untuk diuji terpisah: murni,
// dan merekalah yang menentukan apa yang ikut terkirim ke klien.
const { bacaPaginasi, syaratCari, syaratSaring, susunNamaData } = require("../src/routes/kertasKerja");

/*
 * Paginasi daftar kertas kerja. Query string datang dari klien apa adanya, jadi
 * yang dijaga di sini bukan hanya jalur normalnya, tetapi juga bahwa nilai
 * ngawur tidak bisa membuat server menarik seluruh tabel.
 */

test("bacaPaginasi memakai bawaan bila query kosong", () => {
  assert.deepEqual(bacaPaginasi({}), { hal: 1, per: 20, saring: "semua" });
  assert.deepEqual(bacaPaginasi(), { hal: 1, per: 20, saring: "semua" });
});

test("bacaPaginasi membaca nilai yang wajar", () => {
  assert.deepEqual(bacaPaginasi({ hal: "3", per: "50", saring: "kurang" }), {
    hal: 3,
    per: 50,
    saring: "kurang",
  });
});

test("bacaPaginasi membulatkan nilai ngawur ke batasnya", () => {
  // Inti penjagaannya: `per` sebesar apa pun tidak boleh menarik seluruh tabel.
  assert.equal(bacaPaginasi({ per: "100000" }).per, 100);
  assert.equal(bacaPaginasi({ per: "0" }).per, 20);
  assert.equal(bacaPaginasi({ per: "-5" }).per, 20);
  assert.equal(bacaPaginasi({ per: "abc" }).per, 20);
  assert.equal(bacaPaginasi({ per: "12.9" }).per, 12);

  assert.equal(bacaPaginasi({ hal: "0" }).hal, 1);
  assert.equal(bacaPaginasi({ hal: "-3" }).hal, 1);
  assert.equal(bacaPaginasi({ hal: "abc" }).hal, 1);
});

test("bacaPaginasi hanya menerima saringan yang dikenal", () => {
  for (const s of ["semua", "draft", "selesai", "kurang"]) {
    assert.equal(bacaPaginasi({ saring: s }).saring, s);
  }
  assert.equal(bacaPaginasi({ saring: "dihapus" }).saring, "semua");
  assert.equal(bacaPaginasi({ saring: "" }).saring, "semua");
});

/*
 * Pencarian & penyaringan pindah dari klien ke server saat daftar dipaginasi.
 * Aturannya harus tetap sama persis, kalau tidak hasil pencarian berubah diam-diam.
 */

const cariNama = (kata) => ({ petugas: { some: { petugas: { nama: { contains: kata } } } } });

test("syaratCari mencocokkan angka ke nomor kertas kerja", () => {
  // Mengetik "4" harus menemukan "00004" tanpa perlu menghitung nolnya.
  assert.deepEqual(syaratCari("4"), { nomor: { contains: "4" } });
  assert.deepEqual(syaratCari(" 00012 "), { nomor: { contains: "00012" } });
  assert.deepEqual(syaratCari("#12"), { nomor: { contains: "12" } }, "tanda baca dibuang");
});

test("syaratCari mencocokkan kata berhuruf ke nama petugas di tim", () => {
  assert.deepEqual(syaratCari("budi"), cariNama("budi"));
  assert.deepEqual(syaratCari("  S.Kom "), cariNama("S.Kom"));
});

test("syaratCari mewajibkan setiap kata cocok", () => {
  assert.deepEqual(syaratCari("budi  ani"), { AND: [cariNama("budi"), cariNama("ani")] });
  assert.deepEqual(syaratCari("budi 12"), { AND: [cariNama("budi"), { nomor: { contains: "12" } }] });
});

test("syaratCari tidak menyaring apa pun bila kata kunci kosong", () => {
  assert.deepEqual(syaratCari(""), {});
  assert.deepEqual(syaratCari("   "), {});
  assert.deepEqual(syaratCari("- #"), {}, "tanda baca saja sama dengan tidak mencari");
  assert.deepEqual(syaratCari(undefined), {});
});

test("syaratCari memotong kata kunci yang terlalu panjang", () => {
  const syarat = syaratCari("a ".repeat(500));
  assert.equal(syarat.AND.length, 50);
});

test("syaratSaring memetakan saringan ke syarat database", () => {
  assert.deepEqual(syaratSaring("draft"), { status: "draft" });
  assert.deepEqual(syaratSaring("selesai"), { status: "selesai" });
  assert.deepEqual(syaratSaring("kosong"), { entri: { none: {} } });
  // "Berkas tidak lengkap" sifat entri di dalamnya, bukan kolom kertas kerja.
  assert.deepEqual(syaratSaring("kurang"), { entri: { some: { berkasLengkap: false } } });
  // Kertas kerja tanpa data belum punya apa pun untuk diperiksa lokasinya.
  assert.deepEqual(syaratSaring("lokasi"), {
    lokasiStatus: { in: ["tanpa", "kantor", "kasar"] },
    entri: { some: {} },
  });
  assert.deepEqual(syaratSaring("belumdicek"), { lokasiDicekAt: null, entri: { some: {} } });
  assert.deepEqual(syaratSaring("semua"), {});
  assert.deepEqual(syaratSaring("ngawur"), {});
});

/*
 * Nama-nama data di kartu daftar. Judulnya harus sama dengan judul di "Data
 * terkumpul" pada detail, kalau tidak kartu dan detail menyebut orang berbeda.
 */

const q = (id, tipe, urutan, wajib = false) => ({ id, tipe, urutan, wajib });
const jwb = (pertanyaan, nilai) => ({ pertanyaanId: pertanyaan.id, nilai, pertanyaan });

test("susunNamaData memakai judul data per kertas kerja, urut masuk", () => {
  const nama = q(1, "text", 0, true);
  const hasil = susunNamaData([
    { kertasKerjaId: 7, jawaban: [jwb(nama, "Ahmad Fauzi")] },
    { kertasKerjaId: 8, jawaban: [jwb(nama, "Budi")] },
    { kertasKerjaId: 7, jawaban: [jwb(nama, " Siti Aminah ")] },
  ]);
  assert.deepEqual(hasil.get(7), ["Ahmad Fauzi", "Siti Aminah"]);
  assert.deepEqual(hasil.get(8), ["Budi"]);
});

test("susunNamaData mendahulukan pertanyaan wajib, mengikuti urutan formulir", () => {
  // Jawaban datang tanpa urutan tertentu dari database.
  const catatan = q(10, "text", 0);
  const usaha = q(11, "text", 2, true);
  const pemilik = q(12, "text", 1, true);
  const hasil = susunNamaData([
    { kertasKerjaId: 1, jawaban: [jwb(usaha, "Warung Bu Siti"), jwb(catatan, "Tutup"), jwb(pemilik, "Siti")] },
  ]);
  assert.deepEqual(hasil.get(1), ["Siti"]);
});

test("susunNamaData menyebut nama yang sama sekali saja", () => {
  // Satu wajib pajak yang mengisi dua formulir.
  const nama = q(1, "text", 0, true);
  const lain = q(2, "text", 0, true);
  const hasil = susunNamaData([
    { kertasKerjaId: 3, jawaban: [jwb(nama, "Ahmad Fauzi")] },
    { kertasKerjaId: 3, jawaban: [jwb(lain, "AHMAD  FAUZI")] },
  ]);
  assert.deepEqual(hasil.get(3), ["Ahmad Fauzi"]);
});

test("susunNamaData melewati data tanpa judul", () => {
  const nama = q(1, "text", 0, true);
  const hasil = susunNamaData([
    { kertasKerjaId: 4, jawaban: [] },
    { kertasKerjaId: 4, jawaban: [jwb(nama, "   ")] },
  ]);
  assert.equal(hasil.has(4), false, "kartu tanpa nama tidak perlu baris nama");
  assert.equal(susunNamaData([]).size, 0);
});

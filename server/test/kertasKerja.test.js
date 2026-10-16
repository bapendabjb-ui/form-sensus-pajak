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
 * Nama orang di kartu daftar. Labelnya diambil dari formulir di server kantor:
 * pertanyaan wajib pertama di sana bukan nama (alamat, status WP, nama usaha),
 * jadi nama harus dikenali dari pertanyaannya sendiri.
 */

const q = (id, label, urutan, lain = {}) => ({ id, tipe: "text", label, urutan, isiEpbb: "", ...lain });
const jwb = (pertanyaan, nilai) => ({ nilai, pertanyaan });

test("susunNamaData mengambil nama orang, bukan alamat atau status", () => {
  // PBB-P2: alamat objek wajib dan lebih dulu; nama subjek bersumber EPBB "Nama WP".
  const alamat = q(9, "Alamat Objek Pajak", 1, { tipe: "paragraph" });
  const listrik = q(13, "Daya Listrik", 5);
  const subjek = q(52, "Nama Subjek Pajak", 7, { isiEpbb: "nama_wp" });
  // Identitas Wajib Pajak: status (radio) bernilai "Pemilik".
  const namaWp = q(53, "Nama Wajib Pajak", 1);
  const status = q(2, "Status Wajib Pajak", 2, { tipe: "radio" });

  const hasil = susunNamaData([
    { kertasKerjaId: 1, jawaban: [jwb(alamat, "JL HIMALAYA No 04"), jwb(listrik, "900"), jwb(subjek, "SUGIMAN")] },
    { kertasKerjaId: 2, jawaban: [jwb(status, "Pemilik"), jwb(namaWp, " Siti Aminah ")] },
  ]);
  assert.deepEqual(hasil.get(1), ["SUGIMAN"]);
  assert.deepEqual(hasil.get(2), ["Siti Aminah"]);
});

test("susunNamaData mendahulukan pemilik daripada nama usaha", () => {
  const usaha = q(23, "Nama Usaha", 0);
  const pemilik = q(24, "Nama Pemilik", 1);
  const kendaraan = q(19, "Tanda Nomor Kendaraan Bermotor", 0);
  const terakhir = q(20, "Pemilik Terakhir", 1);
  const hasil = susunNamaData([
    // Jawaban datang dari database tanpa urutan tertentu.
    { kertasKerjaId: 4, jawaban: [jwb(pemilik, "Budi"), jwb(usaha, "Warung Bu Siti")] },
    { kertasKerjaId: 4, jawaban: [jwb(kendaraan, "DA 1234 XY"), jwb(terakhir, "Ani")] },
  ]);
  assert.deepEqual(hasil.get(4), ["Budi", "Ani"]);
});

test("susunNamaData memakai pertanyaan nama pertama yang terisi", () => {
  const pertama = q(1, "Nama Wajib Pajak", 0);
  const kedua = q(2, "Nama Penanggung Jawab", 1);
  const hasil = susunNamaData([
    { kertasKerjaId: 5, jawaban: [jwb(kedua, "Cici"), jwb(pertama, "Ahmad")] },
    { kertasKerjaId: 6, jawaban: [jwb(kedua, "Cici"), jwb(pertama, "  ")] },
  ]);
  assert.deepEqual(hasil.get(5), ["Ahmad"]);
  assert.deepEqual(hasil.get(6), ["Cici"]);
});

test("susunNamaData menyebut nama yang sama sekali saja, urut masuk", () => {
  // Satu wajib pajak yang mengisi PBB-P2 lalu Identitas Wajib Pajak.
  const subjek = q(52, "Nama Subjek Pajak", 7, { isiEpbb: "nama_wp" });
  const namaWp = q(53, "Nama Wajib Pajak", 1);
  const hasil = susunNamaData([
    { kertasKerjaId: 3, jawaban: [jwb(subjek, "SUGIMAN")] },
    { kertasKerjaId: 3, jawaban: [jwb(namaWp, "Sugiman")] },
    { kertasKerjaId: 3, jawaban: [jwb(namaWp, "Budi  Santoso")] },
    { kertasKerjaId: 3, jawaban: [jwb(namaWp, "budi santoso")] },
  ]);
  assert.deepEqual(hasil.get(3), ["SUGIMAN", "Budi  Santoso"]);
});

test("susunNamaData melewati data tanpa nama orang", () => {
  const namaWp = q(53, "Nama Wajib Pajak", 1);
  const tempat = q(60, "Nama Tempat / Objek", 0);
  const alamatPemilik = q(61, "Alamat Pemilik", 2);
  const hasil = susunNamaData([
    { kertasKerjaId: 8, jawaban: [] },
    { kertasKerjaId: 8, jawaban: [jwb(namaWp, "   ")] },
    { kertasKerjaId: 8, jawaban: [jwb(tempat, "Kolam Renang Indah"), jwb(alamatPemilik, "Jl. Mawar 3")] },
  ]);
  assert.equal(hasil.has(8), false, "kartu tanpa nama orang tidak perlu baris nama");
  assert.equal(susunNamaData([]).size, 0);
});

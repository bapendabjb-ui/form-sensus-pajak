"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");

const {
  nomorRtRw,
  bacaPilihanSpj,
  susunBarisSpj,
  saringSpj,
  urutSpj,
  tabelSpj,
  ringkasSpj,
} = require("../src/eksporSpj");
const { keCsv, keXlsx } = require("../src/ekspor");

const TZ = "Asia/Makassar";

const palam = { kecamatan: "Cempaka", kode_kecamatan: "020", kelurahan: "Palam", kode_kelurahan: "001" };
const bangkal = { kecamatan: "Cempaka", kode_kecamatan: "020", kelurahan: "Bangkal", kode_kelurahan: "002" };
const guntung = {
  kecamatan: "Landasan Ulin",
  kode_kecamatan: "010",
  kelurahan: "Guntung Manggis",
  kode_kelurahan: "006",
};

const tim = (...nama) => nama.map((n, i) => ({ id: i + 1, urutan: i, petugas: { id: i + 1, nama: n, nip: "" } }));
const kk = (id, nomor, petugas, status = "draft") => ({ id, nomor, status, petugas });

/** Jawaban letak objek: `waktu` dalam jam sejak 1 Nov 2026 00.00 UTC. */
const letak = (kertasKerjaId, entriId, tipe, nilai, jam = entriId, urutan = tipe === "wilayah" ? 1 : 2) => ({
  kertasKerjaId,
  entriId,
  tipe,
  nilai,
  waktu: new Date(Date.UTC(2026, 10, 1, jam)),
  urutan,
});

/*
 * KK 1 (00003): Palam RW 2 RT 5, tim 2 orang, selesai.
 * KK 2 (00001): Bangkal RW 1 RT 3; wilayah & RT/RW di data yang sama.
 * KK 3 (00002): dua objek - Bangkal RW 1 RT 1 lalu Palam; yang dipakai data pertama.
 * KK 4 (00004): Guntung Manggis, RT/RW di formulir lain (data berbeda), tim 5 orang.
 * KK 5 (00005): belum punya wilayah objek.
 */
const contoh = () =>
  susunBarisSpj({
    kertasKerja: [
      kk(1, "00003", tim("Budi", "Ani"), "selesai"),
      kk(2, "00001", tim("Citra")),
      kk(3, "00002", tim("Dodi")),
      kk(4, "00004", tim("Eka", "Fajar", "Gita", "Hadi", "Indah")),
      kk(5, "00005", tim("Joko")),
    ],
    mulai: new Map([
      // 16.30 UTC = 00.30 WITA keesokan harinya: tanggalnya ikut zona waktu aplikasi.
      [1, new Date(Date.UTC(2026, 10, 3, 16, 30))],
      [2, new Date(Date.UTC(2026, 10, 2, 1))],
      [3, new Date(Date.UTC(2026, 10, 2, 2))],
      [4, new Date(Date.UTC(2026, 10, 2, 3))],
      [5, new Date(Date.UTC(2026, 10, 5, 3))],
    ]),
    jawaban: [
      letak(1, 10, "wilayah", palam),
      letak(1, 10, "rtrw", { rt: "005", rw: "002" }),
      letak(2, 20, "rtrw", { rt: "3", rw: "1" }),
      letak(2, 20, "wilayah", bangkal),
      letak(3, 31, "wilayah", palam, 40),
      letak(3, 31, "rtrw", { rt: "009", rw: "009" }, 40),
      letak(3, 30, "wilayah", bangkal, 30),
      letak(3, 30, "rtrw", { rt: "001", rw: "001" }, 30),
      letak(4, 41, "rtrw", { rt: "004", rw: "" }, 41),
      letak(4, 40, "wilayah", guntung, 40),
      letak(4, 40, "rtrw", { rt: "", rw: "" }, 40),
      letak(5, 50, "wilayah", { kecamatan: "", kode_kecamatan: "" }),
    ],
  });

const perNomor = (baris) => Object.fromEntries(baris.map((b) => [b.kk.nomor, b]));

test("nomorRtRw menyeragamkan jadi 3 digit", () => {
  assert.equal(nomorRtRw("1"), "001");
  assert.equal(nomorRtRw(" 12 "), "012");
  assert.equal(nomorRtRw("003"), "003");
  assert.equal(nomorRtRw(""), "");
  assert.equal(nomorRtRw(null), "");
  assert.equal(nomorRtRw("1A"), "1A", "isian lama yang bukan angka dibiarkan");
});

test("bacaPilihanSpj: kosong = semua, pilihan harus bertingkat", () => {
  assert.deepEqual(bacaPilihanSpj({}), { kecamatan: null, kelurahan: null, rw: "", rt: "" });
  const p = bacaPilihanSpj({ kecamatan: "020", kelurahan: "001", rw: "2", rt: "5" });
  assert.equal(p.kecamatan.nama, "Cempaka");
  assert.equal(p.kelurahan.nama, "Palam");
  assert.equal(p.rw, "002");
  assert.equal(p.rt, "005");
  assert.equal(bacaPilihanSpj({ kelurahan: "001" }), null, "kelurahan tanpa kecamatan");
  assert.equal(bacaPilihanSpj({ kecamatan: "020", rw: "001" }), null, "RW tanpa kelurahan");
  assert.equal(bacaPilihanSpj({ kecamatan: "020", kelurahan: "001", rt: "001" }), null, "RT tanpa RW");
  assert.equal(bacaPilihanSpj({ kecamatan: "999" }), null);
  assert.equal(bacaPilihanSpj({ kecamatan: "020", kelurahan: "001", rw: "1; DROP" }), null);
});

test("susunBarisSpj: satu baris per kertas kerja, letak dari data pertama", () => {
  const b = perNomor(contoh());
  assert.equal(Object.keys(b).length, 5);

  assert.deepEqual(
    [b["00003"].kecamatan, b["00003"].kelurahan, b["00003"].rw, b["00003"].rt],
    ["Cempaka", "Palam", "002", "005"]
  );
  assert.deepEqual(b["00003"].petugas, ["Budi", "Ani"]);
  assert.deepEqual([b["00001"].kelurahan, b["00001"].rw, b["00001"].rt], ["Bangkal", "001", "003"], "3 digit");

  // Dua objek: data pertama (Bangkal) yang dipakai, RT/RW ikut data yang sama.
  assert.deepEqual([b["00002"].kelurahan, b["00002"].rw, b["00002"].rt], ["Bangkal", "001", "001"]);

  // RT/RW kosong di data wilayahnya: diambil dari data lain yang mengisinya.
  assert.deepEqual([b["00004"].kelurahan, b["00004"].rw, b["00004"].rt], ["Guntung Manggis", "", "004"]);

  assert.deepEqual([b["00005"].kecamatan, b["00005"].rw], ["", ""], "belum berwilayah");
});

test("tabelSpj: kolom petugas sebanyak tim terbesar, tanggal di zona waktu aplikasi", () => {
  const t = tabelSpj(urutSpj(contoh(), false), { timezone: TZ });
  assert.deepEqual(t.header, [
    "Tanggal Sensus",
    "Nomor Kertas Kerja",
    "Status",
    "Nama Petugas 1",
    "Nama Petugas 2",
    "Nama Petugas 3",
    "Nama Petugas 4",
    "Nama Petugas 5",
    "Kecamatan",
    "Kelurahan",
    "RW",
    "RT",
  ]);
  const teks = t.baris.map((r) => r.map((c) => c.teks));
  assert.deepEqual(
    teks.map((r) => r[1]),
    ["00001", "00002", "00003", "00004", "00005"],
    "mentah: urut nomor kertas kerja"
  );
  assert.deepEqual(teks[2], [
    "04/11/2026",
    "00003",
    "Selesai",
    "Budi",
    "Ani",
    "",
    "",
    "",
    "Cempaka",
    "Palam",
    "002",
    "005",
  ]);
  assert.deepEqual(teks[3].slice(3, 8), ["Eka", "Fajar", "Gita", "Hadi", "Indah"]);
  assert.equal(teks[0][2], "Draft");

  // Sel tanggal membawa nomor seri Excel: 4 Nov 2026 = 46330.
  assert.equal(t.baris[2][0].angka, 46330);
  assert.equal(t.baris[2][0].format, "dd/mm/yyyy");

  // Tanpa satu pun petugas tetap ada satu kolom petugas.
  const kosong = tabelSpj([], { timezone: TZ });
  assert.deepEqual(kosong.header.filter((h) => h.startsWith("Nama Petugas")), ["Nama Petugas 1"]);
});

test("urutSpj per wilayah: kecamatan > kelurahan > RW > RT, yang kosong di belakang", () => {
  const nomor = urutSpj(contoh(), true).map((b) => b.kk.nomor);
  // Cempaka/Bangkal 001/001, Cempaka/Bangkal 001/003, Cempaka/Palam, Landasan Ulin, tanpa wilayah.
  assert.deepEqual(nomor, ["00002", "00001", "00003", "00004", "00005"]);
});

test("saringSpj mempersempit ke kecamatan / kelurahan / RW / RT", () => {
  const baris = contoh();
  const nomor = (q) =>
    saringSpj(baris, bacaPilihanSpj(q))
      .map((b) => b.kk.nomor)
      .sort();
  assert.deepEqual(nomor({}), ["00001", "00002", "00003", "00004", "00005"], "tanpa pilihan = semua");
  assert.deepEqual(nomor({ kecamatan: "020" }), ["00001", "00002", "00003"]);
  assert.deepEqual(nomor({ kecamatan: "020", kelurahan: "002" }), ["00001", "00002"]);
  assert.deepEqual(nomor({ kecamatan: "020", kelurahan: "002", rw: "1" }), ["00001", "00002"]);
  assert.deepEqual(nomor({ kecamatan: "020", kelurahan: "002", rw: "001", rt: "003" }), ["00001"]);
  assert.deepEqual(nomor({ kecamatan: "010", kelurahan: "006", rw: "004" }), [], "RT 004 tanpa RW");
});

test("ringkasSpj: jumlah baris, pilihan RW / RT yang ada datanya", () => {
  const baris = contoh();
  const semua = ringkasSpj(baris, bacaPilihanSpj({}));
  assert.equal(semua.kertasKerja, 5);
  assert.equal(semua.tanpaWilayah, 1);
  assert.deepEqual(semua.rw, [], "RW baru ditawarkan setelah kelurahan dipilih");

  const bangkal = ringkasSpj(baris, bacaPilihanSpj({ kecamatan: "020", kelurahan: "002" }));
  assert.deepEqual(bangkal.rw, [{ nilai: "001", jumlah: 2 }]);
  assert.deepEqual(bangkal.rt, []);

  const rw1 = ringkasSpj(baris, bacaPilihanSpj({ kecamatan: "020", kelurahan: "002", rw: "001" }));
  assert.deepEqual(rw1.rt, [
    { nilai: "001", jumlah: 1 },
    { nilai: "003", jumlah: 1 },
  ]);
  assert.equal(rw1.kertasKerja, 2);

  const guntungRingkas = ringkasSpj(baris, bacaPilihanSpj({ kecamatan: "010", kelurahan: "006" }));
  assert.equal(guntungRingkas.tanpaRtRw, 1);
});

test("berkas SPJ: RT/RW & nomor tetap teks, tanggal jadi tanggal Excel", async () => {
  const t = tabelSpj(urutSpj(contoh(), false), { timezone: TZ });
  const csv = keCsv(t).toString();
  assert.ok(csv.includes('"04/11/2026","00003","Selesai","Budi","Ani","","","","Cempaka","Palam","002","005"'));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await keXlsx(t, "SPJ"));
  const ws = wb.getWorksheet("SPJ");
  const baris = ws.getRow(4); // judul + 00001 + 00002 + 00003
  assert.equal(baris.getCell(2).value, "00003");
  assert.equal(baris.getCell(11).value, "002");
  assert.equal(baris.getCell(12).value, "005");
  const tanggal = baris.getCell(1);
  assert.equal(tanggal.numFmt, "dd/mm/yyyy");
  // ExcelJS membaca sel bertanggal sebagai Date (tengah malam UTC).
  assert.equal(tanggal.value.toISOString().slice(0, 10), "2026-11-04");
});

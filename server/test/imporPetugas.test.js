"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { bacaBerkasPetugas, kunciJudul, pecahBarisCsv, cariJudul } = require("../src/imporPetugas");

const csv = (teks) => Buffer.from(teks, "utf8");

test("kunciJudul menyamakan penulisan judul kolom", () => {
  assert.equal(kunciJudul(" Nama Petugas "), "namapetugas");
  assert.equal(kunciJudul("N.I.P."), "nip");
  assert.equal(kunciJudul(null), "");
});

test("pecahBarisCsv menghormati tanda kutip dan beberapa pemisah", () => {
  assert.deepEqual(pecahBarisCsv('Budi,19850101'), ["Budi", "19850101"]);
  assert.deepEqual(pecahBarisCsv('"Santoso, Budi";19850101'), ["Santoso, Budi", "19850101"]);
  assert.deepEqual(pecahBarisCsv('"Budi ""Bud"" S"\t123'), ['Budi "Bud" S', "123"]);
});

test("cariJudul menemukan judul walau didahului baris kop", () => {
  const baris = [
    { sel: ["DAFTAR PEGAWAI DINAS", "", ""], no: 1 },
    { sel: ["", "", ""], no: 2 },
    { sel: ["No", "Nama", "NIP"], no: 3 },
  ];
  assert.deepEqual(cariJudul(baris), { iJudul: 2, kNama: 1, kNip: 2 });
});

test("cariJudul menyerah bila kolom Nama tidak ada", () => {
  assert.equal(cariJudul([{ sel: ["No", "Jabatan"], no: 1 }]), null);
});

test("bacaBerkasPetugas membaca CSV ber-BOM dan menomori baris apa adanya", async () => {
  const { baris, galat } = await bacaBerkasPetugas(
    csv("\ufeffNama,NIP\r\nBudi Santoso,198501012010011001\r\n\r\nSiti Aminah,198702022011022002\r\n"),
    "petugas.csv"
  );
  assert.equal(galat, "");
  assert.deepEqual(baris, [
    { nama: "Budi Santoso", nip: "198501012010011001", baris: 2 },
    // Baris kosong di tengah tidak menggeser penomoran: Siti ada di baris 4 berkas.
    { nama: "Siti Aminah", nip: "198702022011022002", baris: 4 },
  ]);
});

test("bacaBerkasPetugas membuang apostrof penanda teks dari Excel", async () => {
  const { baris } = await bacaBerkasPetugas(csv("Nama,NIP\nBudi,'0198501012010011001\n"), "p.csv");
  assert.equal(baris[0].nip, "0198501012010011001");
});

test("bacaBerkasPetugas tetap jalan tanpa kolom NIP", async () => {
  const { baris, galat } = await bacaBerkasPetugas(csv("Nama\nBudi\n"), "p.csv");
  assert.equal(galat, "");
  assert.deepEqual(baris, [{ nama: "Budi", nip: "", baris: 2 }]);
});

test("bacaBerkasPetugas menjelaskan berkas yang tidak bisa dipakai", async () => {
  assert.match((await bacaBerkasPetugas(csv(""), "p.csv")).galat, /kosong/i);
  assert.match((await bacaBerkasPetugas(csv("No,Jabatan\n1,Staf\n"), "p.csv")).galat, /Nama/);
});

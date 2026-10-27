"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { pertanyaanObjek, bacaPilihanWilayah, cocokWilayah, saringWilayah } = require("../src/eksporWilayah");

const wilayah = (q) => ({ tipe: "wilayah", isiEpbb: "", ...q });

test("pertanyaanObjek mengenali wilayah objek, bukan alamat wajib pajak", () => {
  assert.equal(pertanyaanObjek(wilayah({ label: "Kecamatan dan Kelurahan Objek Pajak" })), true);
  assert.equal(pertanyaanObjek(wilayah({ label: "Kecamatan dan Kelurahan Subjek Pajak" })), false);
  assert.equal(pertanyaanObjek(wilayah({ label: "Alamat Wajib Pajak" })), false);
  assert.equal(pertanyaanObjek(wilayah({ label: "Kelurahan sesuai KTP" })), false);
  // Bersumber EPBB "wilayah objek" selalu dianggap objek, apa pun labelnya.
  assert.equal(pertanyaanObjek(wilayah({ label: "Wilayah", isiEpbb: "wilayah_op" })), true);
  // Label netral: yang disensus adalah objeknya.
  assert.equal(pertanyaanObjek(wilayah({ label: "Kecamatan dan Kelurahan" })), true);
  assert.equal(pertanyaanObjek({ tipe: "text", label: "Kelurahan Objek" }), false, "hanya tipe wilayah");
});

test("bacaPilihanWilayah membaca kode SISMIOP Banjarbaru", () => {
  const p = bacaPilihanWilayah({ kecamatan: "010", kelurahan: "006" });
  assert.equal(p.kecamatan.nama, "Landasan Ulin");
  assert.equal(p.kelurahan.nama, "Guntung Manggis");
  assert.equal(bacaPilihanWilayah({ kecamatan: "020" }).kelurahan, null, "kelurahan kosong = seluruh kecamatan");
  assert.equal(bacaPilihanWilayah({ kecamatan: "999" }), null);
  assert.equal(bacaPilihanWilayah({ kecamatan: "020", kelurahan: "999" }), null);
  assert.equal(bacaPilihanWilayah({}), null);
});

const CEMPAKA = bacaPilihanWilayah({ kecamatan: "020" });
const PALAM = bacaPilihanWilayah({ kecamatan: "020", kelurahan: "001" });
const nilaiPalam = { kecamatan: "Cempaka", kode_kecamatan: "020", kelurahan: "Palam", kode_kelurahan: "001" };
const nilaiBangkal = { kecamatan: "Cempaka", kode_kecamatan: "020", kelurahan: "Bangkal", kode_kelurahan: "002" };

test("cocokWilayah mencocokkan lewat kode SISMIOP", () => {
  assert.equal(cocokWilayah(nilaiPalam, PALAM), true);
  assert.equal(cocokWilayah(nilaiBangkal, PALAM), false);
  assert.equal(cocokWilayah(nilaiBangkal, CEMPAKA), true, "seluruh kecamatan");
  // Kode kelurahan berulang antar kecamatan: 001 di Liang Anggang bukan Palam.
  const lain = { kecamatan: "Liang Anggang", kode_kecamatan: "011", kelurahan: "Landasan Ulin Tengah", kode_kelurahan: "001" };
  assert.equal(cocokWilayah(lain, PALAM), false);
  assert.equal(cocokWilayah({ ...nilaiPalam, kelurahan: "", kode_kelurahan: "" }, PALAM), false, "kelurahan belum diisi");
});

test("cocokWilayah: jawaban lama tanpa kode dicocokkan lewat nama, kecuali di luar Banjarbaru", () => {
  assert.equal(cocokWilayah({ kecamatan: " cempaka ", kelurahan: "PALAM", manual: true }, PALAM), true);
  assert.equal(cocokWilayah({ kecamatan: "Cempaka", kelurahan: "Palam", kabupaten: "Kota Banjarbaru" }, PALAM), true);
  assert.equal(
    cocokWilayah({ kecamatan: "Cempaka", kelurahan: "Palam", kabupaten: "Kabupaten Lain", manual: true }, CEMPAKA),
    false
  );
  assert.equal(cocokWilayah({ kecamatan: "Cempaka", kelurahan: "X", kode_kemendagri: "11.01.01.2001" }, CEMPAKA), false);
});

test("cocokWilayah menolak jawaban kosong", () => {
  assert.equal(cocokWilayah(null, CEMPAKA), false);
  assert.equal(cocokWilayah({ kecamatan: "", kode_kecamatan: "", kelurahan: "", kode_kelurahan: "" }, CEMPAKA), false);
  assert.equal(cocokWilayah("Cempaka", CEMPAKA), false);
});

test("saringWilayah: data tanpa wilayah objek mengikuti kertas kerjanya", () => {
  // KK 1: PBB-P2 (entri 10) di Palam + Identitas WP (entri 11, tanpa wilayah objek).
  // KK 2: PBB-P2 di Bangkal (entri 20) + Identitas WP (entri 21).
  // KK 3: dua PBB-P2, satu di Palam (30) dan satu di Bangkal (31), + Identitas WP (32).
  // KK 4: belum diisi wilayah objeknya (jawaban kosong) - entri 40.
  const jawaban = [
    { entriId: 10, kertasKerjaId: 1, nilai: nilaiPalam },
    { entriId: 20, kertasKerjaId: 2, nilai: nilaiBangkal },
    { entriId: 30, kertasKerjaId: 3, nilai: nilaiPalam },
    { entriId: 31, kertasKerjaId: 3, nilai: nilaiBangkal },
    { entriId: 40, kertasKerjaId: 4, nilai: { kecamatan: "", kode_kecamatan: "" } },
  ];
  const s = saringWilayah(jawaban, PALAM);
  assert.deepEqual(s.kkIds.sort(), [1, 3]);
  assert.deepEqual([...s.kkBerwilayah].sort(), [1, 2, 3]);

  const ikut = (id, kk) => s.ikut({ id, kertasKerjaId: kk });
  assert.equal(ikut(10, 1), true);
  assert.equal(ikut(11, 1), true, "Identitas WP ikut kertas kerjanya");
  assert.equal(ikut(20, 2), false);
  assert.equal(ikut(21, 2), false);
  assert.equal(ikut(30, 3), true);
  assert.equal(ikut(31, 3), false, "objek di kelurahan lain tidak ikut walau sekertas kerja");
  assert.equal(ikut(32, 3), true);
  assert.equal(ikut(40, 4), false);

  // Seluruh kecamatan Cempaka: Palam dan Bangkal sama-sama ikut.
  const semua = saringWilayah(jawaban, CEMPAKA);
  assert.deepEqual(semua.kkIds.sort(), [1, 2, 3]);
  assert.equal(semua.ikut({ id: 31, kertasKerjaId: 3 }), true);
});

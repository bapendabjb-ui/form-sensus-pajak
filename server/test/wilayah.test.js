"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { cariWilayah, cariKode, cocokkanAlamat } = require("../src/wilayahIndonesia");
const { KECAMATAN, rincianWilayah } = require("../src/wilayah");
const { wilayahSubjek } = require("../src/epbb");
const { csvNilai } = require("../src/format");

/*
 * Data se-Indonesia dibaca dari server/data/wilayah-indonesia.tsv. Tes ini juga
 * menjaga berkas itu: bila diperbarui, kelurahan Banjarbaru harus tetap bernama
 * sama dengan daftar SISMIOP supaya bisa dikembalikan ke kode SISMIOP-nya.
 */

test("setiap kelurahan Banjarbaru ada di data Kemendagri dengan nama yang sama", () => {
  for (const kec of KECAMATAN) {
    for (const kel of kec.kelurahan) {
      const hasil = cariWilayah(`${kel.nama} ${kec.nama} banjarbaru`).hasil;
      assert.ok(
        hasil.some((h) => h.kode.startsWith("63.72.") && h.kelurahan === kel.nama && h.kecamatan === kec.nama),
        `${kel.nama}, ${kec.nama}`
      );
    }
  }
});

test("cariWilayah: nama persis didahulukan, Kalimantan Selatan lebih dulu", () => {
  const { hasil, total } = cariWilayah("kemuning");
  assert.ok(total > 20, "nama kelurahan Kemuning ada di banyak daerah");
  assert.equal(hasil.length, 20);
  assert.deepEqual(
    { kelurahan: hasil[0].kelurahan, kabupaten: hasil[0].kabupaten, provinsi: hasil[0].provinsi },
    { kelurahan: "Kemuning", kabupaten: "Kota Banjarbaru", provinsi: "Kalimantan Selatan" }
  );
});

test("cariWilayah: kata tambahan mempersempit lewat kecamatan/kabupaten", () => {
  const { hasil } = cariWilayah("sukamaju bogor");
  assert.ok(hasil.length > 0);
  assert.ok(hasil.every((h) => h.kelurahan === "Sukamaju" && h.kabupaten === "Kabupaten Bogor"));
});

test("cariWilayah: huruf besar, apostrof, dan ketikan terlalu pendek", () => {
  assert.equal(cariWilayah("GONDANGDIA").hasil[0].kecamatan, "Menteng");
  assert.equal(cariWilayah("pasi kuala bau").hasil[0].kelurahan, "Pasi Kuala Ba'u");
  assert.deepEqual(cariWilayah("ab"), { hasil: [], total: 0 });
  assert.deepEqual(cariWilayah("  "), { hasil: [], total: 0 });
  assert.deepEqual(cariWilayah(undefined), { hasil: [], total: 0 });
});

test("cariKode hanya mengenal kode kelurahan/desa yang lengkap", () => {
  assert.equal(cariKode("31.71.06.1004").kelurahan, "Gondangdia");
  assert.equal(cariKode("31.71.06"), null, "kode kecamatan bukan kelurahan");
  assert.equal(cariKode("99.99.99.9999"), null);
  assert.equal(cariKode(""), null);
});

test("cocokkanAlamat memakai kota untuk memilih kelurahan yang kembar", () => {
  assert.equal(cocokkanAlamat("KEL. KELAYAN SELATAN", "BANJARMASIN").kabupaten, "Kota Banjarmasin");
  assert.equal(cocokkanAlamat("JAWA", "MARTAPURA").kabupaten, "Kabupaten Banjar", "kota boleh nama kecamatan");
  assert.equal(cocokkanAlamat("SUKAMAJU", "KAB. BOGOR"), null, "masih kembar di Kabupaten Bogor");
  assert.equal(cocokkanAlamat("SUKAMAJU", ""), null, "tanpa kota, nama kembar tidak ditebak");
  assert.equal(cocokkanAlamat("KELAYAN SELATAN", "SURABAYA"), null, "kota tidak cocok");
  assert.equal(cocokkanAlamat("", "BANJARMASIN"), null);
});

test("wilayahSubjek EPBB: kelurahan Banjarbaru kembali ke kode SISMIOP", () => {
  assert.deepEqual(wilayahSubjek({ kelurahan: "LOKTABAT UTARA", kota: "BANJARBARU" }), {
    kecamatan: "Banjarbaru Utara",
    kode_kecamatan: "031",
    kelurahan: "Loktabat Utara",
    kode_kelurahan: "001",
  });
  assert.equal(wilayahSubjek({ kelurahan: "KELAYAN SELATAN", kota: "BANJARMASIN" }).kode_kemendagri, "63.71.01.1002");
  assert.equal(wilayahSubjek({ kelurahan: "SUKAMAJU" }), null);
  assert.equal(wilayahSubjek(undefined), null);
});

test("rincianWilayah melengkapi kabupaten & provinsi nilai Banjarbaru", () => {
  assert.deepEqual(rincianWilayah({ kecamatan: "Cempaka", kode_kecamatan: "020", kelurahan: "Palam", kode_kelurahan: "001" }), {
    kelurahan: "Palam",
    kecamatan: "Cempaka",
    kabupaten: "Kota Banjarbaru",
    provinsi: "Kalimantan Selatan",
  });
  // Ketikan manual lama belum punya kabupaten/provinsi: dibiarkan kosong, bukan ditebak.
  assert.deepEqual(rincianWilayah({ kecamatan: "Menteng", kelurahan: "Gondangdia", manual: true }), {
    kelurahan: "Gondangdia",
    kecamatan: "Menteng",
    kabupaten: "",
    provinsi: "",
  });
  assert.deepEqual(rincianWilayah(null), { kelurahan: "", kecamatan: "", kabupaten: "", provinsi: "" });
});

test("csvNilai wilayah menyertakan kabupaten & provinsi bila tersimpan", () => {
  assert.equal(
    csvNilai("wilayah", { kecamatan: "Menteng", kelurahan: "Gondangdia", kabupaten: "Kota Administrasi Jakarta Pusat", provinsi: "Daerah Khusus Ibukota Jakarta" }),
    "Kel. Gondangdia, Kec. Menteng, Kota Administrasi Jakarta Pusat, Daerah Khusus Ibukota Jakarta"
  );
});

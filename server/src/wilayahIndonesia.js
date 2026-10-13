"use strict";

/**
 * Data kelurahan/desa seluruh Indonesia (kode & nama Kemendagri) untuk alamat di luar
 * Kota Banjarbaru. Sumber: server/data/wilayah-indonesia.tsv.
 *
 * Dimuat ke memori saat pertama dibutuhkan, lalu dipakai bersama oleh pencarian
 * GET /api/wilayah/cari, pemeriksaan jawaban, dan cek NOP. Jauh lebih ringan daripada
 * mengirim seluruh daftar ke browser: tiap pencarian hanya membalas beberapa baris.
 */

const fs = require("fs");
const path = require("path");

const BERKAS = path.join(__dirname, "..", "data", "wilayah-indonesia.tsv");

/** Pencarian lebih pendek dari ini terlalu umum untuk berguna. */
const CARI_MIN_HURUF = 3;
const CARI_MAKS_HASIL = 20;
/** Provinsi Kalimantan Selatan: alamat di luar Banjarbaru paling sering dari sini, jadi didahulukan. */
const KODE_PROVINSI_DEKAT = "63";

/** Huruf kecil, apostrof dibuang ("Ba'u" -> "bau"), tanda baca lain jadi spasi. */
const normal = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

let data = null;

/**
 * Satu objek per kelurahan/desa, terurut menurut kode. Nama kecamatan ke atas dipakai
 * bersama lewat objek kecamatannya, dan `cari` berisi nama yang sudah dinormalkan.
 */
function muat() {
  if (data) return data;
  const nama = new Map();
  const kecamatan = new Map();
  const desa = [];

  for (const baris of fs.readFileSync(BERKAS, "utf8").split("\n")) {
    if (!baris || baris[0] === "#") continue;
    const tab = baris.indexOf("\t");
    const kode = baris.slice(0, tab);
    const n = baris.slice(tab + 1);

    if (kode.length < 13) {
      nama.set(kode, n);
      continue;
    }
    const kodeKec = kode.slice(0, 8);
    let kec = kecamatan.get(kodeKec);
    if (!kec) {
      const kabupaten = nama.get(kode.slice(0, 5));
      const provinsi = nama.get(kode.slice(0, 2));
      const namaKec = nama.get(kodeKec);
      kec = { nama: namaKec, kabupaten, provinsi, cari: normal(`${namaKec} ${kabupaten} ${provinsi}`) };
      kecamatan.set(kodeKec, kec);
    }
    desa.push({ kode, nama: n, cari: normal(n), kec });
  }

  data = desa;
  return data;
}

const bentuk = (d) => ({
  kode: d.kode,
  kelurahan: d.nama,
  kecamatan: d.kec.nama,
  kabupaten: d.kec.kabupaten,
  provinsi: d.kec.provinsi,
});

/** Kelurahan/desa berkode Kemendagri lengkap ("63.72.04.1001"), atau null. */
function cariKode(kode) {
  const k = String(kode ?? "");
  const desa = muat();
  let bawah = 0;
  let atas = desa.length - 1;
  while (bawah <= atas) {
    const tengah = (bawah + atas) >> 1;
    const kodeTengah = desa[tengah].kode;
    if (kodeTengah === k) return bentuk(desa[tengah]);
    if (kodeTengah < k) bawah = tengah + 1;
    else atas = tengah - 1;
  }
  return null;
}

/**
 * Cari kelurahan/desa dari ketikan petugas. Setiap kata harus ada di nama kelurahan/desa
 * atau di nama kecamatan/kabupaten/provinsinya, jadi "sukamaju bogor" mempersempit hasil.
 *
 * Urutan: nama persis sama, nama berawalan ketikan, nama berawalan kata pertama, kata
 * pertama di awal salah satu kata nama, sisanya; lalu Kalimantan Selatan dulu, nama
 * terpendek, dan kode.
 *
 * @returns {{ hasil: object[], total: number }} paling banyak CARI_MAKS_HASIL baris
 */
function cariWilayah(ketikan, batas = CARI_MAKS_HASIL) {
  const utuh = normal(ketikan).slice(0, 100);
  if (utuh.replace(/ /g, "").length < CARI_MIN_HURUF) return { hasil: [], total: 0 };
  const kata = utuh.split(" ");
  const pertama = kata[0];

  const peringkat = (d) => {
    if (d.cari === utuh) return 0;
    if (d.cari.startsWith(utuh)) return 1;
    if (d.cari === pertama) return 2;
    if (d.cari.startsWith(pertama)) return 3;
    if (` ${d.cari}`.includes(` ${pertama}`)) return 4;
    return 5;
  };

  const cocok = [];
  for (const d of muat()) {
    if (kata.every((k) => d.cari.includes(k) || d.kec.cari.includes(k))) {
      cocok.push({ d, skor: peringkat(d), jauh: d.kode.startsWith(KODE_PROVINSI_DEKAT) ? 0 : 1 });
    }
  }
  cocok.sort(
    (a, b) =>
      a.skor - b.skor ||
      a.jauh - b.jauh ||
      a.d.cari.length - b.d.cari.length ||
      (a.d.kode < b.d.kode ? -1 : 1)
  );
  return { hasil: cocok.slice(0, batas).map((c) => bentuk(c.d)), total: cocok.length };
}

/** Kata depan nama kota di SISMIOP yang bukan bagian nama: "KAB. BANJAR", "KOTA ADM. JAKARTA". */
const AWALAN_KOTA = new Set(["kota", "kab", "kabupaten", "kotamadya", "kodya", "adm", "administrasi"]);

/**
 * Cocokkan alamat subjek pajak dari EPBB (nama kelurahan & kota, teks bebas) ke satu
 * kelurahan/desa. Hanya mengembalikan hasil bila cocoknya tunggal - nama kelurahan yang
 * kembar di banyak daerah dan kotanya kosong/tidak cocok dibiarkan untuk diisi petugas.
 */
function cocokkanAlamat(kelurahan, kota) {
  const kel = normal(String(kelurahan ?? "").replace(/^\s*(kel(urahan)?\.?|desa)\s+/i, ""));
  if (!kel) return null;
  const kataKota = normal(kota).split(" ").filter(Boolean);
  while (kataKota.length && AWALAN_KOTA.has(kataKota[0])) kataKota.shift();
  const intiKota = kataKota.join(" ");

  const cocok = muat().filter((d) => d.cari === kel && (!intiKota || d.kec.cari.includes(intiKota)));
  return cocok.length === 1 ? bentuk(cocok[0]) : null;
}

module.exports = { cariWilayah, cariKode, cocokkanAlamat, CARI_MIN_HURUF };

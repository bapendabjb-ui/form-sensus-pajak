"use strict";

/**
 * Data wilayah Kota Banjarbaru: kecamatan beserta kelurahannya, berkode SISMIOP.
 * Sumber: "Ref Kecamatan dan Kelurahan.txt". Dipakai pertanyaan bertipe "wilayah"
 * dan disajikan ke klien lewat GET /api/wilayah. Alamat di luar Banjarbaru dicari
 * dari data se-Indonesia (src/wilayahIndonesia.js).
 */

const KECAMATAN = [
  {
    kode: "010",
    nama: "Landasan Ulin",
    kelurahan: [
      { kode: "003", nama: "Landasan Ulin Timur" },
      { kode: "004", nama: "Guntung Payung" },
      { kode: "005", nama: "Syamsudin Noor" },
      { kode: "006", nama: "Guntung Manggis" },
    ],
  },
  {
    kode: "011",
    nama: "Liang Anggang",
    kelurahan: [
      { kode: "001", nama: "Landasan Ulin Tengah" },
      { kode: "002", nama: "Landasan Ulin Utara" },
      { kode: "003", nama: "Landasan Ulin Barat" },
      { kode: "004", nama: "Landasan Ulin Selatan" },
    ],
  },
  {
    kode: "020",
    nama: "Cempaka",
    kelurahan: [
      { kode: "001", nama: "Palam" },
      { kode: "002", nama: "Bangkal" },
      { kode: "003", nama: "Sungai Tiung" },
      { kode: "004", nama: "Cempaka" },
    ],
  },
  {
    kode: "031",
    nama: "Banjarbaru Utara",
    kelurahan: [
      { kode: "001", nama: "Loktabat Utara" },
      { kode: "002", nama: "Mentaos" },
      { kode: "003", nama: "Komet" },
      { kode: "004", nama: "Sungai Ulin" },
    ],
  },
  {
    kode: "032",
    nama: "Banjarbaru Selatan",
    kelurahan: [
      { kode: "001", nama: "Loktabat Selatan" },
      { kode: "002", nama: "Kemuning" },
      { kode: "003", nama: "Guntung Paikat" },
      { kode: "004", nama: "Sungai Besar" },
    ],
  },
];

const { kapitalTiapKata } = require("./nama");
const { cariKode } = require("./wilayahIndonesia");

/** Kota Banjarbaru dalam kode wilayah Kemendagri. */
const KODE_BANJARBARU = "63.72.";
const KABUPATEN_BANJARBARU = "Kota Banjarbaru";
const PROVINSI_BANJARBARU = "Kalimantan Selatan";

const MAKS_NAMA = 100;

const sama = (a, b) => a.toLowerCase() === b.toLowerCase();
const teks = (v) => (typeof v === "string" ? v.trim() : "");
const ketikan = (v) => kapitalTiapKata(teks(v).slice(0, MAKS_NAMA));

/**
 * Cocokkan nama kecamatan/kelurahan ke daftar Banjarbaru.
 *   - kecamatan tidak dikenal          -> kosong seluruhnya
 *   - kelurahan bukan milik kecamatan  -> kelurahan dikosongkan
 *   - hanya kelurahan yang dikirim     -> kecamatan diisi otomatis
 */
function wilayahBanjarbaru(namaKecamatan, namaKelurahan) {
  const kosong = { kecamatan: "", kode_kecamatan: "", kelurahan: "", kode_kelurahan: "" };
  let kec = namaKecamatan ? KECAMATAN.find((k) => sama(k.nama, namaKecamatan)) || null : null;
  let kel = null;

  if (namaKelurahan) {
    if (kec) {
      kel = kec.kelurahan.find((l) => sama(l.nama, namaKelurahan)) || null;
    } else if (!namaKecamatan) {
      for (const k of KECAMATAN) {
        const cocok = k.kelurahan.find((l) => sama(l.nama, namaKelurahan));
        if (cocok) {
          kec = k;
          kel = cocok;
          break;
        }
      }
    }
  }

  if (!kec) return kosong;
  return {
    kecamatan: kec.nama,
    kode_kecamatan: kec.kode,
    kelurahan: kel ? kel.nama : "",
    kode_kelurahan: kel ? kel.kode : "",
  };
}

/**
 * Bentuk nilai wilayah yang sah dari kiriman klien. Ada tiga asal:
 *   1. Daftar Banjarbaru (lihat wilayahBanjarbaru), berkode SISMIOP - dipakai NOP & EPBB.
 *   2. Pencarian se-Indonesia (`kode_kemendagri`): semua nama diambil dari data Kemendagri,
 *      bukan dari kiriman klien. Kelurahan Banjarbaru dikembalikan ke bentuk (1).
 *   3. `manual` (tidak ketemu di data mana pun): nama disimpan apa adanya, tanpa kode.
 *      Ketikan yang ternyata ada di daftar Banjarbaru tetap disimpan dalam bentuk (1).
 */
function normalWilayah(w = {}) {
  const kecamatan = teks(w.kecamatan);
  const kelurahan = teks(w.kelurahan);

  if (teks(w.kode_kemendagri)) {
    const d = cariKode(teks(w.kode_kemendagri));
    // Kode yang tidak dikenal lagi (mis. setelah data wilayah diperbarui): namanya tetap disimpan.
    if (!d) return normalWilayah({ ...w, kode_kemendagri: "", manual: true });
    if (d.kode.startsWith(KODE_BANJARBARU)) {
      const lokal = wilayahBanjarbaru(d.kecamatan, d.kelurahan);
      if (lokal.kelurahan) return lokal;
    }
    return {
      kecamatan: d.kecamatan,
      kode_kecamatan: "",
      kelurahan: d.kelurahan,
      kode_kelurahan: "",
      kabupaten: d.kabupaten,
      provinsi: d.provinsi,
      kode_kemendagri: d.kode,
    };
  }

  if (w.manual === true) {
    const cocok = wilayahBanjarbaru(kecamatan, kelurahan);
    if (cocok.kecamatan && cocok.kelurahan) return cocok;
    return {
      kecamatan: ketikan(kecamatan),
      kode_kecamatan: "",
      kelurahan: ketikan(kelurahan),
      kode_kelurahan: "",
      kabupaten: ketikan(w.kabupaten),
      provinsi: ketikan(w.provinsi),
      manual: true,
    };
  }

  return wilayahBanjarbaru(kecamatan, kelurahan);
}

/**
 * Keempat tingkat wilayah sebuah jawaban tersimpan. Nilai dari daftar Banjarbaru tidak
 * menyimpan kabupaten & provinsi - kode SISMIOP-nya sudah pasti Kota Banjarbaru.
 */
function rincianWilayah(v) {
  const o = v && typeof v === "object" ? v : {};
  const banjarbaru = !!o.kode_kecamatan;
  return {
    kelurahan: teks(o.kelurahan),
    kecamatan: teks(o.kecamatan),
    kabupaten: banjarbaru ? KABUPATEN_BANJARBARU : teks(o.kabupaten),
    provinsi: banjarbaru ? PROVINSI_BANJARBARU : teks(o.provinsi),
  };
}

module.exports = { KECAMATAN, normalWilayah, rincianWilayah };

"use strict";

/**
 * Data wilayah Kota Banjarbaru: kecamatan beserta kelurahannya.
 * Sumber: "Ref Kecamatan dan Kelurahan.txt". Dipakai pertanyaan bertipe "wilayah"
 * dan disajikan ke klien lewat GET /api/wilayah.
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

const MAKS_NAMA = 100;

const sama = (a, b) => a.toLowerCase() === b.toLowerCase();

/**
 * Bentuk nilai wilayah yang sah dari nama kecamatan/kelurahan kiriman klien.
 *   - kecamatan tidak dikenal          -> kosong seluruhnya
 *   - kelurahan bukan milik kecamatan  -> kelurahan dikosongkan
 *   - hanya kelurahan yang dikirim     -> kecamatan diisi otomatis
 *   - `manual` (alamat di luar Banjarbaru, mis. subjek pajak ber-KTP daerah lain):
 *     nama yang tidak cocok dengan data disimpan apa adanya, tanpa kode.
 */
function normalWilayah(namaKecamatan, namaKelurahan, manual = false) {
  if (manual) {
    const cocok = normalWilayah(namaKecamatan, namaKelurahan);
    if (cocok.kecamatan && cocok.kelurahan) return cocok;
    return {
      kecamatan: kapitalTiapKata(namaKecamatan.slice(0, MAKS_NAMA)),
      kode_kecamatan: "",
      kelurahan: kapitalTiapKata(namaKelurahan.slice(0, MAKS_NAMA)),
      kode_kelurahan: "",
      manual: true,
    };
  }

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

module.exports = { KECAMATAN, normalWilayah };

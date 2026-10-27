"use strict";

/**
 * Ekspor per kecamatan / kelurahan - aturan pemilihan datanya, murni tanpa
 * database (query-nya di routes/ekspor.js).
 *
 * Patokannya letak OBJEK pajak, bukan alamat wajib pajak. Satu kertas kerja =
 * satu objek, sehingga:
 *   - data yang punya jawaban wilayah objek sendiri (mis. PBB-P2) ikut bila
 *     jawabannya berada di wilayah terpilih;
 *   - data tanpa jawaban itu (mis. Identitas Wajib Pajak) mengikuti kertas
 *     kerjanya: ikut bila kertas kerja itu punya data lain yang objeknya cocok.
 * Kertas kerja yang belum punya wilayah objek sama sekali tidak masuk ekspor
 * wilayah mana pun; jumlahnya dilaporkan ke layar ekspor.
 */

const { KECAMATAN } = require("./wilayah");

const LABEL_OBJEK = /\bobjek\b/i;
const LABEL_SUBJEK = /\b(subjek|wajib\s*pajak|wp|ktp|domisili|pemilik)\b/i;

/**
 * Pertanyaan wilayah yang menunjuk letak objek pajak: bersumber EPBB "wilayah
 * objek", atau labelnya menyebut "objek". Label netral ("Kecamatan dan
 * Kelurahan") juga dianggap objek - yang disensus adalah objeknya - kecuali
 * jelas menunjuk alamat subjek / wajib pajak.
 */
function pertanyaanObjek(q) {
  if (q.tipe !== "wilayah") return false;
  const label = q.label || "";
  if (q.isiEpbb === "wilayah_op" || LABEL_OBJEK.test(label)) return true;
  return !LABEL_SUBJEK.test(label);
}

/**
 * ?kecamatan=<kode>&kelurahan=<kode> (kode SISMIOP Banjarbaru) -> wilayah
 * terpilih. Kelurahan kosong = seluruh kecamatan. Null bila tidak dikenal.
 */
function bacaPilihanWilayah(query = {}) {
  const kec = KECAMATAN.find((k) => k.kode === String(query.kecamatan || ""));
  if (!kec) return null;
  const kodeKel = String(query.kelurahan || "");
  if (!kodeKel) return { kecamatan: kec, kelurahan: null };
  const kel = kec.kelurahan.find((l) => l.kode === kodeKel);
  return kel ? { kecamatan: kec, kelurahan: kel } : null;
}

const kunci = (s) =>
  String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

/** Jawaban wilayah yang sudah diisi (minimal kecamatannya). */
const wilayahTerisi = (v) => !!v && typeof v === "object" && kunci(v.kode_kecamatan || v.kecamatan) !== "";

/**
 * Apakah jawaban wilayah tersimpan `v` berada di wilayah terpilih. Dicocokkan
 * lewat kode SISMIOP; jawaban lama tanpa kode dicocokkan lewat nama, asal
 * bukan wilayah di luar Banjarbaru (nama kecamatan seperti "Cempaka" ada juga
 * di daerah lain).
 */
function cocokWilayah(v, { kecamatan, kelurahan }) {
  if (!wilayahTerisi(v)) return false;
  let kecCocok;
  if (v.kode_kecamatan) {
    kecCocok = v.kode_kecamatan === kecamatan.kode;
  } else {
    const luar = Boolean(v.kode_kemendagri) || (kunci(v.kabupaten) !== "" && !/banjarbaru/i.test(v.kabupaten));
    kecCocok = !luar && kunci(v.kecamatan) === kunci(kecamatan.nama);
  }
  if (!kecCocok || !kelurahan) return kecCocok;
  return v.kode_kelurahan ? v.kode_kelurahan === kelurahan.kode : kunci(v.kelurahan) === kunci(kelurahan.nama);
}

/**
 * Saringan data untuk satu wilayah.
 *
 * @param {{ entriId: number, kertasKerjaId: number, nilai: any }[]} jawabanObjek
 *        jawaban seluruh pertanyaan wilayah objek
 * @returns {{ kkIds: number[], kkBerwilayah: Set<number>, ikut: (e: { id, kertasKerjaId }) => boolean }}
 *   kkIds        : kertas kerja yang objeknya berada di wilayah itu
 *   kkBerwilayah : kertas kerja yang sudah punya wilayah objek (wilayah apa pun)
 *   ikut         : apakah sebuah data (dari kertas kerja di kkIds) ikut diekspor
 */
function saringWilayah(jawabanObjek, pilihan) {
  const berwilayah = new Set(); // entri
  const cocok = new Set(); // entri
  const kkCocok = new Set();
  const kkBerwilayah = new Set();
  for (const j of jawabanObjek) {
    if (!wilayahTerisi(j.nilai)) continue;
    berwilayah.add(j.entriId);
    kkBerwilayah.add(j.kertasKerjaId);
    if (cocokWilayah(j.nilai, pilihan)) {
      cocok.add(j.entriId);
      kkCocok.add(j.kertasKerjaId);
    }
  }
  return {
    kkIds: [...kkCocok],
    kkBerwilayah,
    ikut: (e) => kkCocok.has(e.kertasKerjaId) && (cocok.has(e.id) || !berwilayah.has(e.id)),
  };
}

module.exports = { pertanyaanObjek, bacaPilihanWilayah, cocokWilayah, saringWilayah };

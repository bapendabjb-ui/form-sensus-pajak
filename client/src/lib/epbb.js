/**
 * Isi otomatis pertanyaan dari data EPBB (hasil cek NOP).
 *
 * Admin memilih sumber per pertanyaan di editor formulir (kolom `isiEpbb`).
 * Petugas yang menekan "Isi ke Formulir" pada modal cek NOP mengisi semua
 * pertanyaan bersumber itu sekaligus. Daftar kunci & tipe yang sama dijaga
 * server di server/src/epbb.js (SUMBER_EPBB).
 */

import { PANJANG_RTRW } from "./format.js";

export const SUMBER_EPBB = [
  { kunci: "nama_wp", label: "Nama WP", tipe: ["text", "paragraph"] },
  { kunci: "letak_op", label: "Letak Objek Pajak (alamat lengkap)", tipe: ["text", "paragraph"] },
  { kunci: "jalan_op", label: "Alamat Objek Pajak (jalan & nomor)", tipe: ["text", "paragraph"] },
  { kunci: "rtrw_op", label: "RT & RW Objek Pajak", tipe: ["rtrw"] },
  { kunci: "wilayah_op", label: "Kecamatan & kelurahan Objek Pajak", tipe: ["wilayah"] },
  { kunci: "letak_sp", label: "Letak Subjek Pajak (alamat lengkap)", tipe: ["text", "paragraph"] },
  { kunci: "jalan_sp", label: "Alamat Subjek Pajak (jalan & nomor)", tipe: ["text", "paragraph"] },
  { kunci: "rtrw_sp", label: "RT & RW Subjek Pajak", tipe: ["rtrw"] },
  { kunci: "wilayah_sp", label: "Kecamatan & kelurahan Subjek Pajak", tipe: ["wilayah"] },
  { kunci: "kelurahan_sp", label: "Kelurahan & kota Subjek Pajak", tipe: ["text", "paragraph"] },
  { kunci: "luas_op", label: "Luas tanah & bangunan", tipe: ["luas"] },
  { kunci: "luas_tanah", label: "Luas tanah (m²)", tipe: ["number"] },
  { kunci: "luas_bangunan", label: "Luas bangunan (m²)", tipe: ["number"] },
  { kunci: "status_bayar", label: "Status bayar", tipe: ["text", "paragraph"] },
];

/** Sumber yang cocok untuk sebuah tipe pertanyaan. */
export const sumberUntukTipe = (tipe) => SUMBER_EPBB.filter((s) => s.tipe.includes(tipe));

export const labelSumber = (kunci) => SUMBER_EPBB.find((s) => s.kunci === kunci)?.label || "";

/** Nilai kosong / tidak ada isinya: tidak dipakai supaya isian petugas tidak terhapus. */
const kosong = (v) =>
  v === undefined ||
  v === null ||
  v === "" ||
  (typeof v === "object" && Object.values(v).every((x) => x === "" || x === null));

const rtRw = (s) => {
  const d = String(s ?? "").replace(/\D/g, "").slice(-PANJANG_RTRW);
  return d === "" ? "" : d.padStart(PANJANG_RTRW, "0");
};

/** Nama kelurahan untuk dicocokkan: huruf kecil, tanpa awalan "KEL." / "KELURAHAN", spasi rapi. */
const namaKelurahan = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/^\s*(kel(urahan)?\.?|desa)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Angka untuk NumberInput: desimal memakai koma seperti ketikan petugas ("250,5"). */
const angka = (n) => (Number(n) > 0 ? String(Number(n)).replace(".", ",") : "");

/**
 * Nilai state UI untuk satu pertanyaan dari data cek NOP.
 * @param {string} sumber   kunci SUMBER_EPBB
 * @param {object} data     balasan GET /api/nop/:nop
 * @param {Array}  wilayah  data GET /api/wilayah (dibutuhkan sumber wilayah_op)
 * @returns nilai, atau undefined bila EPBB tidak punya datanya
 */
export function nilaiDariEpbb(sumber, data, wilayah = []) {
  const rinci = data.rinciOp || {};
  const rinciSp = data.rinciSp || {};
  let v;
  switch (sumber) {
    case "nama_wp":
      v = data.namaWp;
      break;
    case "letak_op":
      v = data.letakOp;
      break;
    case "jalan_op":
      v = rinci.jalan;
      break;
    case "letak_sp":
      v = data.letakSp;
      break;
    case "wilayah_op": {
      const kec = wilayah.find((k) => k.kode === rinci.kodeKecamatan);
      const kel = kec?.kelurahan.find((l) => l.kode === rinci.kodeKelurahan);
      v = kec ? { kecamatan: kec.nama, kelurahan: kel ? kel.nama : "" } : undefined;
      break;
    }
    case "rtrw_op":
      v = { rt: rtRw(rinci.rt), rw: rtRw(rinci.rw) };
      break;
    case "jalan_sp":
      v = rinciSp.jalan;
      break;
    case "rtrw_sp":
      v = { rt: rtRw(rinciSp.rt), rw: rtRw(rinciSp.rw) };
      break;
    case "wilayah_sp": {
      // Subjek pajak hanya punya nama kelurahan: kecamatan dicari dari data wilayah Banjarbaru.
      // Kelurahan di luar Banjarbaru tidak bisa dipilih, jadi dilewati.
      const cari = namaKelurahan(rinciSp.kelurahan);
      let hasil;
      for (const k of cari ? wilayah : []) {
        const kel = k.kelurahan.find((l) => namaKelurahan(l.nama) === cari);
        if (kel) {
          hasil = { kecamatan: k.nama, kelurahan: kel.nama };
          break;
        }
      }
      v = hasil;
      break;
    }
    case "kelurahan_sp":
      v = [rinciSp.kelurahan && `KEL. ${rinciSp.kelurahan}`, rinciSp.kota].filter(Boolean).join(", ");
      break;
    case "luas_op": {
      // Bangunan 0 tetap diisi "0": tanah kosong adalah data yang sah.
      const isi = (n) => (Number.isFinite(Number(n)) && Number(n) >= 0 ? String(Number(n)).replace(".", ",") : "");
      v = Number(data.luasTanah) > 0 || Number(data.luasBangunan) > 0
        ? { tanah: isi(data.luasTanah), bangunan: isi(data.luasBangunan) }
        : undefined;
      break;
    }
    case "luas_tanah":
      v = angka(data.luasTanah);
      break;
    case "luas_bangunan":
      v = angka(data.luasBangunan);
      break;
    case "status_bayar":
      v = data.belumBayar?.length ? `Belum bayar: ${data.belumBayar.join(", ")}` : "Lunas";
      break;
    default:
      v = undefined;
  }
  return kosong(v) ? undefined : v;
}

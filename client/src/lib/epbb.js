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
  { kunci: "letak_op", label: "Letak OP (alamat lengkap)", tipe: ["text", "paragraph"] },
  { kunci: "jalan_op", label: "Jalan OP (tanpa RT/RW & wilayah)", tipe: ["text", "paragraph"] },
  { kunci: "letak_sp", label: "Letak SP (alamat wajib pajak)", tipe: ["text", "paragraph"] },
  { kunci: "wilayah_op", label: "Kecamatan & kelurahan OP", tipe: ["wilayah"] },
  { kunci: "rtrw_op", label: "RT & RW OP", tipe: ["rtrw"] },
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

/* Ringkasan satu entri untuk daftar "Data terkumpul". */

import {
  formatDateID,
  groupNum,
  formatRange,
  formatLokasi,
  formatNik,
  formatNpwp,
  formatNop,
  formatRtRw,
  formatNikNpwp,
  formatTelepon,
} from "./format.js";

const TIPE_JUDUL = ["text", "dropdown", "radio", "paragraph"];

/** Nilai jawaban -> teks pendek untuk ditampilkan. */
export function formatNilai(q, nilai) {
  if (nilai === null || nilai === undefined) return "";
  switch (q.tipe) {
    case "date":
      return formatDateID(nilai);
    case "number":
      return nilai === "" ? "" : groupNum(nilai);
    case "range":
      return formatRange(nilai);
    case "checkbox":
      return Array.isArray(nilai) ? nilai.join(", ") : "";
    case "linetariff": {
      const baris = Array.isArray(nilai) ? nilai.filter((r) => (r?.layanan || "").trim()) : [];
      return baris.length ? `${baris.length} tarif layanan` : "";
    }
    case "foto":
      return Array.isArray(nilai) && nilai.length ? `${nilai.length} foto` : "";
    case "wilayah":
      if (!nilai || typeof nilai !== "object" || !nilai.kecamatan) return "";
      return nilai.kelurahan ? `${nilai.kelurahan}, ${nilai.kecamatan}` : nilai.kecamatan;
    case "lokasi":
      return formatLokasi(nilai, { ringkas: true });
    case "rtrw":
      return formatRtRw(nilai);
    case "nik":
      return formatNik(nilai);
    case "npwp":
      return formatNpwp(nilai);
    case "niknpwp":
      return formatNikNpwp(nilai);
    case "telepon":
      return formatTelepon(nilai, { ringkas: true });
    case "nop":
      return formatNop(nilai);
    default:
      return typeof nilai === "string" ? nilai.trim() : "";
  }
}

/** Judul entri: jawaban teks wajib pertama yang terisi, lalu jawaban teks apa pun. */
export function judulEntri(pertanyaan, jawaban) {
  const cari = (syarat) =>
    pertanyaan.find(
      (q) =>
        syarat(q) &&
        TIPE_JUDUL.includes(q.tipe) &&
        typeof jawaban[q.id] === "string" &&
        jawaban[q.id].trim() !== ""
    );
  const q = cari((x) => x.wajib) || cari(() => true);
  return q ? jawaban[q.id].trim() : "(tanpa keterangan)";
}

/** Beberapa nilai lain sebagai keterangan di bawah judul. */
export function ringkasEntri(pertanyaan, jawaban, maks = 3) {
  const judul = judulEntri(pertanyaan, jawaban);
  const hasil = [];
  for (const q of pertanyaan) {
    if (q.tipe === "foto" || q.tipe === "paragraph") continue;
    const teks = formatNilai(q, jawaban[q.id]);
    if (!teks || teks === judul) continue;
    hasil.push(teks);
    if (hasil.length >= maks) break;
  }
  return hasil;
}

/** Seluruh foto sebuah entri, urut sesuai pertanyaan. */
export function fotoEntri(pertanyaan, jawaban) {
  return pertanyaan
    .filter((q) => q.tipe === "foto" && Array.isArray(jawaban[q.id]))
    .flatMap((q) => jawaban[q.id].filter((f) => f && f.id));
}

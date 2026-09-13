/**
 * Jembatan antara state form di UI dan bentuk JSON yang dipakai API.
 *
 * Di UI semua nominal disimpan sebagai string digit ("100000") supaya bisa
 * ditampilkan berformat ribuan tanpa kehilangan apa yang sedang diketik.
 * Saat dikirim ke server, string itu diubah menjadi angka (atau null).
 *
 * Nilai foto di UI berupa array item. Item yang sudah terunggah punya `id`;
 * item yang masih diunggah / gagal punya `status` ("unggah" | "gagal") dan
 * tidak ikut dikirim.
 */

import { unformatNumber } from "./format.js";

const asString = (v) => (v === null || v === undefined ? "" : String(v));

const toNumberOrNull = (v) => {
  const s = unformatNumber(asString(v));
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const numToInput = (v) => (v === null || v === undefined || v === "" ? "" : String(v));

const fotoTerunggah = (v) => (Array.isArray(v) ? v.filter((f) => f && f.id) : []);

/** Nilai awal kosong untuk sebuah tipe pertanyaan. */
export function emptyValue(tipe) {
  switch (tipe) {
    case "checkbox":
    case "linetariff":
    case "foto":
      return [];
    case "range":
      return { min: "", max: "" };
    default:
      return "";
  }
}

/** JSON dari server -> nilai untuk state UI. */
export function fromApi(tipe, nilai) {
  if (nilai === null || nilai === undefined) return emptyValue(tipe);

  switch (tipe) {
    case "checkbox":
      return Array.isArray(nilai) ? nilai.map(asString) : [];

    case "foto":
      return fotoTerunggah(nilai).map((f) => ({ id: Number(f.id), nama: asString(f.nama) }));

    case "range": {
      const o = typeof nilai === "object" ? nilai : {};
      return { min: numToInput(o.min), max: numToInput(o.max) };
    }

    case "linetariff":
      return (Array.isArray(nilai) ? nilai : []).map((r) => ({
        layanan: asString(r?.layanan),
        jenis: asString(r?.jenis),
        harga_min: numToInput(r?.harga_min),
        harga_max: numToInput(r?.harga_max),
        // Baris yang punya harga_max tersimpan berarti memakai mode rentang.
        isRange: r?.harga_max !== null && r?.harga_max !== undefined && r?.harga_max !== "",
      }));

    default:
      return asString(nilai);
  }
}

/** Nilai state UI -> JSON untuk dikirim ke server. */
export function toApi(tipe, v) {
  switch (tipe) {
    case "checkbox":
      return Array.isArray(v) ? v.map(asString) : [];

    case "foto":
      return fotoTerunggah(v).map((f) => ({ id: f.id, nama: asString(f.nama) }));

    case "number": {
      const n = toNumberOrNull(v);
      return n === null ? "" : String(n);
    }

    case "range": {
      const o = v && typeof v === "object" ? v : {};
      return { min: toNumberOrNull(o.min), max: toNumberOrNull(o.max) };
    }

    case "linetariff":
      return (Array.isArray(v) ? v : []).map((r) => ({
        layanan: asString(r?.layanan).trim(),
        jenis: asString(r?.jenis),
        harga_min: toNumberOrNull(r?.harga_min),
        // Mode harga tunggal: harga_max selalu null.
        harga_max: r?.isRange ? toNumberOrNull(r?.harga_max) : null,
      }));

    default:
      return asString(v).trim();
  }
}

/** Validasi "wajib diisi" di sisi klien (server tetap memvalidasi ulang). */
export function isFilled(tipe, v) {
  switch (tipe) {
    case "checkbox":
      return Array.isArray(v) && v.length > 0;
    case "foto":
      return fotoTerunggah(v).length > 0;
    case "range":
      return !!v && asString(v.min).trim() !== "" && asString(v.max).trim() !== "";
    case "linetariff":
      return Array.isArray(v) && v.some((r) => asString(r?.layanan).trim() !== "");
    default:
      return asString(v).trim() !== "";
  }
}

/** Bangun payload { [pertanyaanId]: nilai } dari seluruh pertanyaan formulir. */
export function buildPayload(pertanyaan, answers) {
  const out = {};
  for (const q of pertanyaan) {
    out[q.id] = toApi(q.tipe, answers[q.id] !== undefined ? answers[q.id] : emptyValue(q.tipe));
  }
  return out;
}

/** Cari pertanyaan wajib yang masih kosong -> { [pertanyaanId]: pesan }. */
export function validateRequired(pertanyaan, answers) {
  const errors = {};
  for (const q of pertanyaan) {
    if (!q.wajib) continue;
    const v = answers[q.id] !== undefined ? answers[q.id] : emptyValue(q.tipe);
    if (!isFilled(q.tipe, v)) {
      errors[q.id] = q.tipe === "foto" ? "Tambahkan minimal satu foto." : "Kolom ini wajib diisi.";
    }
  }
  return errors;
}

/** Hitung foto yang masih diunggah / gagal diunggah di seluruh jawaban. */
export function statusFoto(pertanyaan, answers) {
  let unggah = 0;
  let gagal = 0;
  for (const q of pertanyaan) {
    if (q.tipe !== "foto" || !Array.isArray(answers[q.id])) continue;
    for (const f of answers[q.id]) {
      if (f?.status === "unggah") unggah++;
      if (f?.status === "gagal") gagal++;
    }
  }
  return { unggah, gagal };
}

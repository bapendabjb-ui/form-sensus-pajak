"use strict";

/**
 * Normalisasi & validasi nilai jawaban per tipe pertanyaan.
 *
 * Bentuk JSON yang disimpan di kolom jawaban.nilai:
 *   text/paragraph/number/date/dropdown/radio : string
 *   checkbox                                  : array string
 *   range                                     : { min: number|null, max: number|null }
 *   linetariff                                : array { layanan, jenis, harga_min, harga_max }
 *                                               (harga_max null = harga tunggal)
 */

const { normalWilayah } = require("./wilayah");

const TIPE = [
  "text",
  "paragraph",
  "number",
  "date",
  "dropdown",
  "radio",
  "checkbox",
  "range",
  "linetariff",
  "foto",
  "wilayah",
];

/** Tipe yang menyimpan daftar opsi di tabel pertanyaan_opsi. */
const BERTIPE_OPSI = ["dropdown", "radio", "checkbox", "linetariff"];

/** Ubah apa pun menjadi angka, atau null bila kosong / bukan angka. */
function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  let s = v;
  if (typeof s === "string") {
    // Terima "1.250.000" maupun "1250000,50" (format Indonesia).
    s = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const toTrimmedString = (v) => (v === null || v === undefined ? "" : String(v).trim());

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Bentuk nilai kosong per tipe, dipakai sebagai fallback. */
function nilaiKosong(tipe) {
  if (tipe === "checkbox" || tipe === "linetariff" || tipe === "foto") return [];
  if (tipe === "range") return { min: null, max: null };
  if (tipe === "wilayah") return normalWilayah("", "");
  return "";
}

/** Normalisasi nilai mentah dari klien menjadi bentuk kanonik untuk disimpan. */
function normalizeNilai(tipe, raw) {
  switch (tipe) {
    case "text":
    case "paragraph":
    case "dropdown":
    case "radio":
      return toTrimmedString(raw);

    case "number": {
      const n = toNumberOrNull(raw);
      return n === null ? "" : String(n);
    }

    case "date": {
      const s = toTrimmedString(raw);
      return ISO_DATE.test(s) ? s : "";
    }

    case "checkbox": {
      if (!Array.isArray(raw)) return [];
      return raw.map(toTrimmedString).filter((s) => s !== "");
    }

    case "range": {
      const obj = raw && typeof raw === "object" ? raw : {};
      return { min: toNumberOrNull(obj.min), max: toNumberOrNull(obj.max) };
    }

    case "linetariff": {
      if (!Array.isArray(raw)) return [];
      return raw
        .map((row) => {
          const r = row && typeof row === "object" ? row : {};
          return {
            layanan: toTrimmedString(r.layanan),
            jenis: toTrimmedString(r.jenis),
            harga_min: toNumberOrNull(r.harga_min !== undefined ? r.harga_min : r.hargaMin),
            harga_max: toNumberOrNull(r.harga_max !== undefined ? r.harga_max : r.hargaMax),
          };
        })
        .filter(
          (r) => r.layanan !== "" || r.jenis !== "" || r.harga_min !== null || r.harga_max !== null
        );
    }

    case "wilayah": {
      // { kecamatan, kode_kecamatan, kelurahan, kode_kelurahan } — dicocokkan ke data wilayah.
      const obj = raw && typeof raw === "object" ? raw : {};
      return normalWilayah(toTrimmedString(obj.kecamatan), toTrimmedString(obj.kelurahan));
    }

    case "foto": {
      // Array { id, nama }. Keberadaan & kepemilikan foto diperiksa di src/entri.js.
      if (!Array.isArray(raw)) return [];
      const dilihat = new Set();
      const hasil = [];
      for (const item of raw) {
        const obj = item && typeof item === "object" ? item : { id: item };
        const id = Number(obj.id);
        if (!Number.isInteger(id) || id <= 0 || dilihat.has(id)) continue;
        dilihat.add(id);
        hasil.push({ id, nama: toTrimmedString(obj.nama).slice(0, 200) });
      }
      return hasil;
    }

    default:
      return toTrimmedString(raw);
  }
}

/** true bila nilai dianggap terisi (dipakai validasi "wajib diisi"). */
function nilaiTerisi(tipe, nilai) {
  switch (tipe) {
    case "checkbox":
    case "foto":
      return Array.isArray(nilai) && nilai.length > 0;
    case "range":
      return !!nilai && typeof nilai === "object" && nilai.min !== null && nilai.max !== null;
    case "wilayah":
      return !!nilai && typeof nilai === "object" && !!nilai.kecamatan && !!nilai.kelurahan;
    case "linetariff":
      return Array.isArray(nilai) && nilai.some((r) => toTrimmedString(r.layanan) !== "");
    default:
      return toTrimmedString(nilai) !== "";
  }
}

/** Baris untuk tabel ternormalisasi rincian_tarif dari sebuah nilai linetariff. */
function barisRincianTarif(nilai) {
  if (!Array.isArray(nilai)) return [];
  return nilai
    .filter((r) => toTrimmedString(r.layanan) !== "" || r.harga_min !== null || r.harga_max !== null)
    .map((r, i) => ({
      layanan: r.layanan || "",
      jenis: r.jenis || "",
      hargaMin: r.harga_min,
      hargaMax: r.harga_max,
      urutan: i,
    }));
}

module.exports = {
  TIPE,
  BERTIPE_OPSI,
  toNumberOrNull,
  toTrimmedString,
  nilaiKosong,
  normalizeNilai,
  nilaiTerisi,
  barisRincianTarif,
};

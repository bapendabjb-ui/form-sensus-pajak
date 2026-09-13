"use strict";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** 100000 -> "100.000" (format ribuan Indonesia). */
function groupNum(v) {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

/** "2026-03-07" -> "7 Maret 2026". */
function formatDateID(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return String(iso);
  return Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1];
}

/** { min, max } -> "Rp 10.000 - Rp 25.000". */
function formatRange(r) {
  if (!r || typeof r !== "object") return "";
  const a = r.min === null || r.min === undefined || r.min === "" ? "" : groupNum(r.min);
  const b = r.max === null || r.max === undefined || r.max === "" ? "" : groupNum(r.max);
  if (a && b) return "Rp " + a + " - Rp " + b;
  if (a) return "Rp " + a;
  if (b) return "Rp " + b;
  return "";
}

/** Harga satu baris rincian tarif (tunggal atau rentang). */
function formatHargaBaris(row) {
  const a = row.harga_min === null || row.harga_min === undefined ? "" : groupNum(row.harga_min);
  const b = row.harga_max === null || row.harga_max === undefined ? "" : groupNum(row.harga_max);
  if (a && b) return "Rp " + a + " - Rp " + b;
  if (a) return "Rp " + a;
  if (b) return "Rp " + b;
  return "";
}

/** Tanggal + jam dalam zona waktu tertentu -> "13 September 2026 14.05". */
function formatWaktuID(value, timeZone) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Representasi satu sel CSV untuk sebuah jawaban.
 * @param {object} [opsi] { baseUrl } dipakai untuk menulis tautan foto lengkap.
 */
function csvNilai(tipe, nilai, opsi = {}) {
  if (nilai === null || nilai === undefined) return "";
  switch (tipe) {
    case "wilayah":
      if (!nilai || typeof nilai !== "object" || !nilai.kecamatan) return "";
      return nilai.kelurahan ? `Kel. ${nilai.kelurahan}, Kec. ${nilai.kecamatan}` : `Kec. ${nilai.kecamatan}`;
    case "foto":
      if (!Array.isArray(nilai)) return "";
      return nilai.map((f) => `${opsi.baseUrl || ""}/api/foto/${f.id}`).join(" ; ");
    case "date":
      return formatDateID(nilai);
    case "range":
      return formatRange(nilai);
    case "checkbox":
      return Array.isArray(nilai) ? nilai.join("; ") : "";
    case "number":
      return groupNum(nilai);
    case "linetariff": {
      if (!Array.isArray(nilai)) return "";
      return nilai
        .filter((r) => (r.layanan || "").trim() !== "" || r.harga_min !== null || r.harga_max !== null)
        .map((r) => {
          const harga = formatHargaBaris(r);
          const kepala = (r.layanan || "-") + " (" + (r.jenis || "-") + ")";
          return harga ? kepala + ": " + harga : kepala;
        })
        .join("; ");
    }
    default:
      return typeof nilai === "object" ? JSON.stringify(nilai) : String(nilai);
  }
}

/** Susun CSV dengan BOM UTF-8 agar rapi saat dibuka di Excel. */
function buildCsv(rows) {
  const esc = (s) => {
    const str = s === null || s === undefined ? "" : String(s);
    return '"' + str.replace(/"/g, '""') + '"';
  };
  const body = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  return "﻿" + body + "\r\n";
}

module.exports = {
  MONTHS,
  groupNum,
  formatDateID,
  formatWaktuID,
  formatRange,
  formatHargaBaris,
  csvNilai,
  buildCsv,
};

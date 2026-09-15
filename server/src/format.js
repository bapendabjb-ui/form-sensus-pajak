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

/**
 * NPWP 15 digit -> "00.000.000.0-000.000" (format lama yang masih banyak dipakai).
 * NPWP 16 digit (NIK) & 17 digit (NITKU) ditulis apa adanya.
 */
function formatNpwp(digit) {
  const d = String(digit === null || digit === undefined ? "" : digit).replace(/\D/g, "");
  if (d.length !== 15) return d;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}.${d.slice(8, 9)}-${d.slice(9, 12)}.${d.slice(12)}`;
}

/**
 * NOP PBB 18 digit -> "63.72.010.001.002-0123.0".
 *
 * Kelompoknya mengikuti susunan resmi: provinsi 2, kabupaten/kota 2,
 * kecamatan 3, kelurahan 3, blok 3, nomor urut objek 4, kode khusus 1.
 */
function formatNop(digit) {
  const d = String(digit === null || digit === undefined ? "" : digit).replace(/\D/g, "");
  if (d.length !== 18) return d;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 7)}.${d.slice(7, 10)}.${d.slice(10, 13)}-${d.slice(13, 17)}.${d.slice(17)}`;
}

/**
 * Nomor telepon tersimpan -> "+62 812-3456-7890" / "0812-3456-7890".
 * Samakan dengan formatNomorTelepon() di client/src/lib/format.js.
 */
function formatNomorTelepon(nomor) {
  const s = String(nomor === null || nomor === undefined ? "" : nomor);
  const plus = s.startsWith("+");
  const d = s.replace(/\D/g, "");
  if (!d) return plus ? "+" : "";

  const kelompok = (x, pertama) => {
    const bagian = [];
    while (x.length) {
      let n = bagian.length === 0 ? pertama : 4;
      if (bagian.length >= 2 && x.length <= 5) n = x.length;
      bagian.push(x.slice(0, n));
      x = x.slice(n);
    }
    return bagian.join("-");
  };

  if (plus && d.startsWith("62")) {
    const sisa = d.slice(2);
    return sisa ? `+62 ${kelompok(sisa, 3)}` : "+62";
  }
  if (plus) return `+${d}`;
  return kelompok(d, 4);
}

/** { rt, rw } -> "RT 003 / RW 005". */
function formatRtRw(v) {
  if (!v || typeof v !== "object") return "";
  const rt = String(v.rt || "").trim();
  const rw = String(v.rw || "").trim();
  if (!rt && !rw) return "";
  if (rt && rw) return `RT ${rt} / RW ${rw}`;
  return rt ? `RT ${rt}` : `RW ${rw}`;
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
    case "lokasi": {
      // Koordinat desimal — bisa langsung ditempel ke Google Maps / aplikasi peta.
      if (!nilai || typeof nilai !== "object" || nilai.lat === null || nilai.lat === undefined) return "";
      const titik = `${nilai.lat}, ${nilai.lon}`;
      if (nilai.sumber === "peta") return `${titik} (dipilih di peta)`;
      return nilai.akurasi === null || nilai.akurasi === undefined
        ? titik
        : `${titik} (±${Math.round(nilai.akurasi)} m)`;
    }
    case "foto":
      if (!Array.isArray(nilai)) return "";
      return nilai.map((f) => `${opsi.baseUrl || ""}/api/foto/${f.id}`).join(" ; ");
    case "rtrw":
      return formatRtRw(nilai);
    case "telepon":
      // "Pemilik - 0812-3456-7890; Kantor - 0511-4777-123"
      if (!Array.isArray(nilai)) return "";
      return nilai
        .filter((r) => r && r.nomor)
        .map((r) => (r.keterangan ? `${r.keterangan} - ${formatNomorTelepon(r.nomor)}` : formatNomorTelepon(r.nomor)))
        .join("; ");
    case "nik":
      // Sengaja tanpa pemisah: NIK adalah deret digit, bukan angka hitung.
      return String(nilai);
    case "npwp":
      return formatNpwp(nilai);
    case "nop":
      return formatNop(nilai);
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
  formatNpwp,
  formatNop,
  formatRtRw,
  formatNomorTelepon,
  csvNilai,
  buildCsv,
};

"use strict";

/**
 * Ekspor data ke CSV dan Excel (.xlsx) - per kertas kerja (semua formulir atau
 * satu formulir) maupun per formulir (seluruh kertas kerja).
 *
 * Semua memakai susunan yang sama: satu baris per data, kolom pertanyaan
 * dikelompokkan per formulir, sel milik formulir lain dibiarkan kosong.
 * Tiap sel berbentuk { teks, angka? }: CSV memakai teks, Excel memakai angka
 * bila ada supaya bisa dijumlah dan difilter.
 */

const ExcelJS = require("exceljs");
const { csvNilai, buildCsv, formatNpwp, formatWaktuID, groupNum } = require("./format");
const { bentukTim, petaJawaban } = require("./bentuk");

const FORMAT_RIBUAN = "#,##0.##";
const KOLOM_NO_DATA = 5;

const teks = (s) => ({ teks: s === null || s === undefined ? "" : String(s) });

/**
 * Kolom per pertanyaan. NIK / NPWP dan luas tanah / bangunan dipecah jadi dua kolom
 * supaya bisa difilter (dan luasnya dijumlah) sendiri-sendiri.
 */
function kolomPertanyaan(formulir, baseUrl) {
  return formulir.flatMap((f) =>
    f.pertanyaan.flatMap((q) => {
      const judul = `${f.judul} - ${q.label || "(tanpa judul)"}`;

      if (q.tipe === "niknpwp") {
        const bagian = (j) => (j[q.id] && typeof j[q.id] === "object" ? j[q.id] : {});
        return [
          { f, judul: `${judul} (NIK)`, sel: (j) => teks(bagian(j).nik) },
          { f, judul: `${judul} (NPWP)`, sel: (j) => teks(formatNpwp(bagian(j).npwp)) },
        ];
      }

      if (q.tipe === "luas") {
        const luas = (k) => (j) => {
          const n = j[q.id] && typeof j[q.id] === "object" ? j[q.id][k] : null;
          return n === null || n === undefined || !Number.isFinite(Number(n))
            ? teks("")
            : { ...teks(groupNum(n)), angka: Number(n) };
        };
        return [
          { f, judul: `${judul} (Tanah m²)`, sel: luas("tanah") },
          { f, judul: `${judul} (Bangunan m²)`, sel: luas("bangunan") },
        ];
      }

      const sel = (j) => {
        const hasil = teks(csvNilai(q.tipe, j[q.id], { baseUrl }));
        if (q.tipe === "number" && hasil.teks !== "") {
          const n = Number(j[q.id]);
          if (Number.isFinite(n)) hasil.angka = n;
        }
        return hasil;
      };
      return [{ f, judul, sel }];
    })
  );
}

/** Kolom identitas kertas kerja: nomor, status, tim petugas. */
function kolomKertasKerja(kk) {
  const tim = bentukTim(kk.petugas);
  return [
    teks(kk.nomor),
    teks(kk.status === "selesai" ? "Selesai" : "Draft"),
    teks(tim.map((p) => p.nama).join("; ")),
    teks(tim.map((p) => p.nip || "-").join("; ")),
  ];
}

/**
 * Susun tabel ekspor.
 *
 * @param {{ kk: object, e: object }[]} data  entri (+ jawaban) beserta kertas kerjanya
 *        (+ petugas), SUDAH terurut sesuai keinginan pemanggil
 * @param {object[]} formulir  formulir (+ pertanyaan) yang kolomnya ditampilkan, urut
 * @returns {{ header: string[], baris: object[][] }}
 */
function susunEkspor(data, formulir, { baseUrl, timezone }) {
  const kolom = kolomPertanyaan(formulir, baseUrl);
  const header = ["Nomor", "Status", "Petugas", "NIP", "Formulir", "No. data", "Waktu input", ...kolom.map((k) => k.judul)];
  const judulForm = new Map(formulir.map((f) => [f.id, f.judul]));

  // "No. data" dihitung per kertas kerja per formulir.
  const nomorKe = new Map();
  const identitasKk = new Map();
  const baris = data.map(({ kk, e }) => {
    const kunci = `${kk.id}:${e.formulirId}`;
    const ke = (nomorKe.get(kunci) || 0) + 1;
    nomorKe.set(kunci, ke);
    if (!identitasKk.has(kk.id)) identitasKk.set(kk.id, kolomKertasKerja(kk));

    const jawaban = petaJawaban(e.jawaban);
    return [
      ...identitasKk.get(kk.id),
      teks(judulForm.get(e.formulirId)),
      { teks: String(ke), angka: ke },
      teks(formatWaktuID(e.createdAt, timezone)),
      ...kolom.map((k) => (k.f.id === e.formulirId ? k.sel(jawaban) : teks(""))),
    ];
  });

  return { header, baris };
}

/** Baris pengganti untuk kertas kerja yang belum punya data. */
const barisTanpaData = (kk) => kolomKertasKerja(kk);

/** Judul -> potongan nama berkas yang aman: "Identitas Wajib Pajak" -> "identitas-wajib-pajak". */
function namaBerkas(s, cadangan = "data") {
  const bersih = String(s || "")
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 50);
  return bersih || cadangan;
}

/** CSV dengan BOM UTF-8. */
function keCsv({ header, baris }) {
  return buildCsv([header, ...baris.map((r) => r.map((c) => c.teks))]);
}

/** Buffer .xlsx: judul kolom tebal & dibekukan, filter otomatis, lebar kolom menyesuaikan isi. */
async function keXlsx({ header, baris }, namaSheet) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sensus Pajak";
  wb.created = new Date();

  // Nama sheet Excel: maks. 31 karakter, tanpa \ / ? * [ ] :
  const sheet = String(namaSheet || "Data").replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Data";
  const ws = wb.addWorksheet(sheet, { views: [{ state: "frozen", ySplit: 1 }] });

  const kepala = ws.addRow(header);
  kepala.font = { bold: true };
  kepala.alignment = { vertical: "middle", wrapText: true };
  kepala.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2F1EF" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFB7C4CC" } } };
  });

  for (const r of baris) {
    const row = ws.addRow(r.map((c) => (c.angka !== undefined ? c.angka : c.teks)));
    r.forEach((c, i) => {
      // NIK, NPWP, NOP tetap teks sehingga Excel tidak mengubahnya jadi 3,17E+15.
      if (c.angka !== undefined && i !== KOLOM_NO_DATA) row.getCell(i + 1).numFmt = FORMAT_RIBUAN;
    });
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };

  header.forEach((h, i) => {
    const terpanjang = baris.reduce((m, r) => Math.max(m, (r[i]?.teks || "").length), 0);
    ws.getColumn(i + 1).width = Math.min(Math.max(Math.min(h.length, 30), terpanjang, 8) + 2, 60);
  });

  return wb.xlsx.writeBuffer();
}

/** Kirim tabel sebagai unduhan CSV. */
function kirimCsv(res, { nama, tabel }) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nama}.csv"`);
  res.send(keCsv(tabel));
}

/** Kirim tabel sebagai unduhan Excel. */
async function kirimXlsx(res, { nama, sheet, tabel }) {
  const buffer = await keXlsx(tabel, sheet);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nama}.xlsx"`);
  res.send(Buffer.from(buffer));
}

module.exports = { susunEkspor, barisTanpaData, namaBerkas, keCsv, keXlsx, kirimCsv, kirimXlsx };

"use strict";

/**
 * Ekspor satu kertas kerja ke CSV dan Excel (.xlsx).
 *
 * Kedua format memakai susunan yang sama: satu baris per data, kolom pertanyaan
 * dikelompokkan per formulir, sel milik formulir lain dibiarkan kosong.
 * Tiap sel berbentuk { teks, angka? }: CSV memakai teks, Excel memakai angka
 * bila ada supaya bisa dijumlah dan difilter.
 */

const ExcelJS = require("exceljs");
const { csvNilai, buildCsv, formatNpwp, formatWaktuID } = require("./format");
const { bentukTim, petaJawaban } = require("./bentuk");

const FORMAT_RIBUAN = "#,##0.##";

const teks = (s) => ({ teks: s === null || s === undefined ? "" : String(s) });

/** Kolom per pertanyaan. NIK / NPWP dipecah jadi dua kolom supaya bisa difilter sendiri-sendiri. */
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

/**
 * @param {object} kk        kertas kerja Prisma dengan petugas & entri (+ jawaban)
 * @param {object[]} formulir formulir terbentuk (bentukFormulir) yang dipakai kertas kerja
 * @returns {{ header: string[], baris: object[][] }}
 */
function susunEkspor(kk, formulir, { baseUrl, timezone }) {
  const tim = bentukTim(kk.petugas);
  const namaTim = tim.map((p) => p.nama).join("; ");
  const nipTim = tim.map((p) => p.nip || "-").join("; ");
  const status = kk.status === "selesai" ? "Selesai" : "Draft";

  const kolom = kolomPertanyaan(formulir, baseUrl);
  const header = ["Nomor", "Status", "Petugas", "NIP", "Formulir", "No. data", "Waktu input", ...kolom.map((k) => k.judul)];

  const urutForm = new Map(formulir.map((f, i) => [f.id, i]));
  const entri = kk.entri
    .slice()
    .sort(
      (a, b) =>
        urutForm.get(a.formulirId) - urutForm.get(b.formulirId) || a.createdAt - b.createdAt || a.id - b.id
    );

  const nomorPerForm = new Map();
  const baris = entri.map((e) => {
    const ke = (nomorPerForm.get(e.formulirId) || 0) + 1;
    nomorPerForm.set(e.formulirId, ke);
    const jawaban = petaJawaban(e.jawaban);
    const f = formulir[urutForm.get(e.formulirId)];
    return [
      teks(kk.nomor),
      teks(status),
      teks(namaTim),
      teks(nipTim),
      teks(f.judul),
      { teks: String(ke), angka: ke },
      teks(formatWaktuID(e.createdAt, timezone)),
      ...kolom.map((k) => (k.f.id === e.formulirId ? k.sel(jawaban) : teks(""))),
    ];
  });

  if (baris.length === 0) baris.push([kk.nomor, status, namaTim, nipTim].map(teks));

  return { header, baris };
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

  const ws = wb.addWorksheet(namaSheet, { views: [{ state: "frozen", ySplit: 1 }] });

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
      if (c.angka !== undefined && i !== 5) row.getCell(i + 1).numFmt = FORMAT_RIBUAN;
    });
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };

  header.forEach((h, i) => {
    const terpanjang = baris.reduce((m, r) => Math.max(m, (r[i]?.teks || "").length), 0);
    ws.getColumn(i + 1).width = Math.min(Math.max(Math.min(h.length, 30), terpanjang, 8) + 2, 60);
  });

  return wb.xlsx.writeBuffer();
}

module.exports = { susunEkspor, keCsv, keXlsx };

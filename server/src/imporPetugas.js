"use strict";

/**
 * Pembacaan berkas daftar petugas untuk impor (.xlsx / .csv).
 *
 * Kolom dikenali dari judulnya, bukan posisinya - daftar pegawai datang dengan
 * urutan kolom yang bermacam-macam, dan memaksa satu urutan hanya akan membuat
 * impor gagal tanpa sebab yang jelas bagi penggunanya.
 */

const ExcelJS = require("exceljs");

/** Judul kolom yang diterima, disamakan lebih dulu oleh kunciJudul(). */
const JUDUL_NAMA = ["nama", "namapetugas", "namalengkap", "petugas"];
const JUDUL_NIP = ["nip", "nomorindukpegawai", "nippetugas"];

/** Samakan judul kolom: huruf kecil, tanpa spasi/tanda baca. */
const kunciJudul = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Rapikan teks sel. Apostrof pembuka ikut dibuang: Excel memakainya sebagai
 * penanda "perlakukan sebagai teks" dan sebagian berkas membawanya serta,
 * sehingga NIP bisa terbaca sebagai "'198503..." bila tidak dibersihkan.
 */
const bersih = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/^'/, "");

/**
 * Nilai sel Excel bisa berupa objek (rumus, teks kaya, hyperlink), bukan hanya
 * teks. Ambil bentuk tampilannya supaya NIP hasil rumus tetap terbaca.
 */
function selKeTeks(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.text !== undefined) return bersih(v.text);
    if (v.result !== undefined) return bersih(v.result);
    if (Array.isArray(v.richText)) return bersih(v.richText.map((t) => t.text).join(""));
    return "";
  }
  return bersih(v);
}

/**
 * Pecah satu baris CSV dengan menghormati tanda kutip ganda.
 * Ditulis sendiri, bukan memakai pustaka: berkasnya hanya dua kolom teks.
 */
function pecahBarisCsv(baris) {
  const sel = [];
  let kini = "";
  let dalamKutip = false;
  for (let i = 0; i < baris.length; i++) {
    const c = baris[i];
    if (dalamKutip) {
      if (c === '"') {
        if (baris[i + 1] === '"') {
          kini += '"';
          i++;
        } else {
          dalamKutip = false;
        }
      } else {
        kini += c;
      }
    } else if (c === '"') {
      dalamKutip = true;
    } else if (c === "," || c === ";" || c === "\t") {
      sel.push(kini);
      kini = "";
    } else {
      kini += c;
    }
  }
  sel.push(kini);
  return sel.map(bersih);
}

/**
 * Baris dari .csv (dengan/atau tanpa BOM), sebagai { sel, no }.
 *
 * `no` adalah nomor baris sebenarnya di berkas, dihitung SEBELUM baris kosong
 * dibuang - kalau dinomori setelahnya, pesan galat akan menunjuk baris yang
 * meleset begitu berkasnya punya baris kosong di tengah.
 */
function barisDariCsv(buffer) {
  const teks = buffer.toString("utf8").replace(/^\uFEFF/, "");
  return teks
    .split(/\r\n|\n|\r/)
    .map((mentah, i) => ({ mentah, no: i + 1 }))
    .filter((b) => b.mentah.trim() !== "")
    .map((b) => ({ sel: pecahBarisCsv(b.mentah), no: b.no }));
}

/**
 * Baris dari lembar pertama .xlsx, sebagai { sel, no }.
 * `no` diambil dari row.number, yaitu nomor baris yang tampak di Excel.
 */
async function barisDariXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];

  const baris = [];
  sheet.eachRow((row) => {
    const sel = [];
    // row.values berindeks 1; pakai eachCell agar sel kosong di tengah tetap terhitung.
    row.eachCell({ includeEmpty: true }, (cell, kolom) => {
      sel[kolom - 1] = selKeTeks(cell.value);
    });
    for (let i = 0; i < sel.length; i++) if (sel[i] === undefined) sel[i] = "";
    if (sel.some((s) => s !== "")) baris.push({ sel, no: row.number });
  });
  return baris;
}

/**
 * Cari baris judul dan posisi kolom Nama & NIP.
 *
 * Judul tidak selalu di baris pertama - berkas dari instansi sering diawali
 * baris kop. Ditelusuri sampai 10 baris pertama.
 *
 * @returns {{ iJudul: number, kNama: number, kNip: number } | null}
 */
function cariJudul(baris) {
  const batas = Math.min(baris.length, 10);
  for (let i = 0; i < batas; i++) {
    const kunci = baris[i].sel.map(kunciJudul);
    const kNama = kunci.findIndex((k) => JUDUL_NAMA.includes(k));
    if (kNama === -1) continue;
    const kNip = kunci.findIndex((k) => JUDUL_NIP.includes(k));
    return { iJudul: i, kNama, kNip };
  }
  return null;
}

/**
 * Baca berkas jadi daftar { nama, nip, baris }.
 *
 * `baris` adalah nomor baris di berkas asli (1-based), supaya pesan galat bisa
 * menunjuk tempat yang benar-benar dilihat pengguna di Excel.
 *
 * @param {Buffer} buffer
 * @param {string} namaBerkas dipakai untuk menebak format dari ekstensinya
 * @returns {Promise<{ baris: Array<{nama:string,nip:string,baris:number}>, galat: string }>}
 *   `galat` terisi bila berkasnya sendiri tidak bisa dipakai.
 */
async function bacaBerkasPetugas(buffer, namaBerkas = "") {
  const xlsx = /\.xlsx$/i.test(namaBerkas) || (buffer[0] === 0x50 && buffer[1] === 0x4b); // "PK" = zip
  let mentah;
  try {
    mentah = xlsx ? await barisDariXlsx(buffer) : barisDariCsv(buffer);
  } catch {
    return { baris: [], galat: "Berkas tidak bisa dibaca. Pastikan formatnya .xlsx atau .csv yang utuh." };
  }

  if (mentah.length === 0) return { baris: [], galat: "Berkas kosong." };

  const judul = cariJudul(mentah);
  if (!judul) {
    return {
      baris: [],
      galat: 'Kolom "Nama" tidak ditemukan. Beri judul kolom "Nama" (dan "NIP" bila ada) di baris pertama.',
    };
  }

  const hasil = [];
  for (let i = judul.iJudul + 1; i < mentah.length; i++) {
    const { sel, no } = mentah[i];
    const nama = bersih(sel[judul.kNama]);
    const nip = judul.kNip === -1 ? "" : bersih(sel[judul.kNip]);
    if (!nama && !nip) continue; // baris kosong
    hasil.push({ nama, nip, baris: no });
  }
  return { baris: hasil, galat: "" };
}

module.exports = { bacaBerkasPetugas, kunciJudul, pecahBarisCsv, cariJudul };

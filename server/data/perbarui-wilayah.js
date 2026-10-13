"use strict";

/**
 * Bangun ulang server/data/wilayah-indonesia.tsv dari db/wilayah.sql milik
 * github.com/cahyadsn/wilayah (kode & nama wilayah Kemendagri, lisensi MIT).
 *
 *   node server/data/perbarui-wilayah.js path/ke/wilayah.sql "Kepmendagri No ... Tahun ..."
 *
 * Jalankan bila Kemendagri menerbitkan kode wilayah baru, lalu commit berkas TSV-nya.
 */

const fs = require("fs");
const path = require("path");

const [sumber, keputusan] = process.argv.slice(2);
if (!sumber || !keputusan) {
  console.error('Pakai: node server/data/perbarui-wilayah.js path/ke/wilayah.sql "Kepmendagri No ... Tahun ..."');
  process.exit(1);
}

const KODE_SAH = /^\d{2}(\.\d{2}(\.\d{2}(\.\d{4})?)?)?$/;
const sql = fs.readFileSync(sumber, "utf8");
const baris = new Map();

for (const [, kode, namaSql] of sql.matchAll(/\('([\d.]+)','((?:[^'\\]|\\.|'')*)'\)/g)) {
  const nama = namaSql.replace(/''/g, "'").replace(/\\(.)/g, "$1").replace(/\s+/g, " ").trim();
  if (!KODE_SAH.test(kode) || !nama) throw new Error(`Baris tidak sah: ${kode} ${nama}`);
  baris.set(kode, nama);
}

const jumlah = [0, 0, 0, 0];
for (const kode of baris.keys()) jumlah[kode.split(".").length - 1] += 1;

const kepala = [
  "# Kode & nama wilayah administrasi pemerintahan Indonesia (provinsi, kabupaten/kota, kecamatan, kelurahan/desa).",
  `# Sesuai ${keputusan}.`,
  "# Sumber: github.com/cahyadsn/wilayah (db/wilayah.sql), copyright (c) 2025 cahya dsn, lisensi MIT.",
  `# ${jumlah[0]} provinsi, ${jumlah[1]} kabupaten/kota, ${jumlah[2]} kecamatan, ${jumlah[3]} kelurahan/desa.`,
  "# Dibangun dengan server/data/perbarui-wilayah.js - jangan disunting manual.",
];
const isi = [...baris].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, n]) => `${k}\t${n}`);

const tujuan = path.join(__dirname, "wilayah-indonesia.tsv");
fs.writeFileSync(tujuan, [...kepala, ...isi, ""].join("\n"));
console.log(`${tujuan}: ${kepala[3].slice(2)}`);

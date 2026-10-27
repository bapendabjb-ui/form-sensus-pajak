"use strict";

/**
 * Cadangan manual yang diunduh admin dari halaman Ekspor, untuk disimpan di
 * luar server (harddisk / flashdisk kantor). Cadangan terjadwal di server
 * ikut hilang bila servernya yang rusak.
 *
 *   - database : mysqldump seluruh database, dikompres gzip (.sql.gz).
 *   - foto     : satu arsip .tar per bulan (folder UPLOAD_DIR/YYYY/MM). Bulan
 *                yang sudah lewat cukup diunduh sekali.
 *
 * Unduhan dialirkan langsung ke browser lewat tautan biasa supaya berkas
 * berukuran GB tersimpan ke disk, bukan ditampung di memori halaman. Tautan
 * biasa tidak membawa header Authorization, jadi admin lebih dulu meminta
 * tiket sekali pakai (POST /api/cadangan/tiket), dan tiket itulah izinnya.
 *
 * .env tidak ikut: isinya rahasia server (JWT, password database, kunci API),
 * disimpan terpisah oleh pengelola server.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { spawn } = require("child_process");

/* ---------- database ---------- */

/** DATABASE_URL mysql://user:pass@host:port/db -> bagian-bagiannya, atau null. */
function bacaDatabaseUrl(url) {
  let u;
  try {
    u = new URL(String(url || ""));
  } catch {
    return null;
  }
  if (!/^mysql:$/.test(u.protocol)) return null;
  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!database) return null;
  return {
    host: u.hostname || "localhost",
    port: u.port || "3306",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
  };
}

/** Nilai berkas opsi MySQL dalam tanda kutip: \ dan " di-escape. */
const kutip = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * Isi berkas --defaults-extra-file. Password lewat berkas (izin 600), bukan
 * argumen, supaya tidak terlihat di daftar proses server.
 */
const isiOpsiMysql = (db) =>
  ["[client]", `host=${kutip(db.host)}`, `port=${db.port}`, `user=${kutip(db.user)}`, `password=${kutip(db.password)}`, ""].join(
    "\n"
  );

/**
 * Argumen mysqldump. --single-transaction: salinan konsisten tanpa mengunci
 * tabel, jadi petugas tetap bisa menyimpan selama cadangan dibuat.
 * --no-tablespaces: user database biasa tidak punya hak PROCESS di MySQL 8.
 * Tanpa --databases, supaya bisa diimpor ke database dengan nama apa pun.
 */
const argumenMysqldump = (berkasOpsi, database) => [
  `--defaults-extra-file=${berkasOpsi}`,
  "--single-transaction",
  "--quick",
  "--no-tablespaces",
  "--routines",
  "--triggers",
  "--hex-blob",
  "--default-character-set=utf8mb4",
  database,
];

/** Lokasi mysqldump yang biasa (aaPanel menaruhnya di /www/server/mysql/bin). */
const KANDIDAT_MYSQLDUMP = [
  "/www/server/mysql/bin/mysqldump",
  "/usr/bin/mysqldump",
  "/usr/local/bin/mysqldump",
  "/usr/local/mysql/bin/mysqldump",
];

const bisaDijalankan = (p) => {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Path mysqldump: MYSQLDUMP_PATH, lokasi biasa, lalu PATH. Null bila tidak ada. */
function cariMysqldump() {
  const dariPath = String(process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((d) => [path.join(d, "mysqldump"), path.join(d, "mysqldump.exe")]);
  return [process.env.MYSQLDUMP_PATH, ...KANDIDAT_MYSQLDUMP, ...dariPath].filter(Boolean).find(bisaDijalankan) || null;
}

/* ---------- foto ---------- */

/** "2026-10" -> "2026/10" (folder di UPLOAD_DIR), atau null bila bentuknya salah. */
function folderBulan(bulan) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(bulan || ""));
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * Ringkasan foto per bulan dari baris tabel foto: [{ bulan, jumlah, ukuran }],
 * terbaru di atas. Bulan diambil dari awal path berkas ("2026/10/...").
 */
function ringkasFotoPerBulan(baris) {
  const per = new Map();
  for (const { berkas, ukuran } of baris) {
    const m = /^(\d{4})\/(\d{2})\//.exec(berkas || "");
    if (!m) continue;
    const bulan = `${m[1]}-${m[2]}`;
    const r = per.get(bulan) || { bulan, jumlah: 0, ukuran: 0 };
    r.jumlah += 1;
    r.ukuran += Number(ukuran) || 0;
    per.set(bulan, r);
  }
  return [...per.values()].sort((a, b) => b.bulan.localeCompare(a.bulan));
}

/* ---------- tiket unduh ---------- */

const UMUR_TIKET_MS = 2 * 60 * 1000;
const tiket = new Map(); // kode -> { isi, sampai }

/**
 * Tiket sekali pakai untuk satu unduhan. Disimpan di memori proses - tepat
 * selama aplikasi berjalan pada satu instance, sama seperti src/laju.js.
 */
function buatTiket(isi, kini = Date.now()) {
  for (const [kode, t] of tiket) if (t.sampai <= kini) tiket.delete(kode);
  const kode = crypto.randomBytes(24).toString("base64url");
  tiket.set(kode, { isi, sampai: kini + UMUR_TIKET_MS });
  return kode;
}

/** Ambil isi tiket lalu hapus tiketnya. Null bila tidak ada atau kedaluwarsa. */
function pakaiTiket(kode, kini = Date.now()) {
  const t = tiket.get(String(kode || ""));
  if (!t) return null;
  tiket.delete(String(kode));
  return t.sampai > kini ? t.isi : null;
}

/* ---------- pengaliran ---------- */

/**
 * Alirkan keluaran proses `anak` ke respons sebagai berkas unduhan.
 *
 * Respons hanya ditutup normal bila prosesnya selesai dengan kode 0. Bila
 * gagal di tengah jalan, sambungan diputus supaya browser menandai unduhannya
 * gagal - lebih baik daripada berkas terpotong yang tampak utuh. Bila admin
 * membatalkan unduhan, prosesnya ikut dihentikan.
 */
function alirkan(res, anak, { nama, jenis, gzip = false, label }) {
  res.setHeader("Content-Type", jenis);
  res.setHeader("Content-Disposition", `attachment; filename="${nama}"`);
  // no-transform: middleware compression tidak memampatkan ulang arsip besar.
  res.setHeader("Cache-Control", "no-store, no-transform");
  // Nginx (aaPanel) tidak perlu menampung unduhan besar dulu sebelum diteruskan.
  res.setHeader("X-Accel-Buffering", "no");

  let galat = "";
  anak.stderr.on("data", (b) => {
    if (galat.length < 2000) galat += b.toString();
  });

  const sumber = gzip ? anak.stdout.pipe(zlib.createGzip()) : anak.stdout;
  sumber.pipe(res, { end: false });

  let kode = null;
  let habis = false;
  let beres = false;
  const tutup = () => {
    if (beres || kode === null || !habis) return;
    beres = true;
    if (kode === 0) {
      res.end();
    } else {
      console.error(`[Sensus Pajak] cadangan ${label} gagal (kode ${kode}): ${galat.trim().slice(0, 500)}`);
      res.destroy();
    }
  };
  sumber.on("end", () => {
    habis = true;
    tutup();
  });
  anak.on("close", (k) => {
    kode = k ?? 1;
    tutup();
  });
  res.on("close", () => {
    if (beres) return;
    // Dibatalkan admin: hentikan prosesnya dan buang sisa keluarannya.
    if (anak.exitCode === null) anak.kill();
    sumber.resume();
  });
}

/** Jalankan proses dan tunggu sampai benar-benar mulai (atau gagal dimulai). */
function mulai(perintah, argumen, opsi) {
  const anak = spawn(perintah, argumen, { ...opsi, windowsHide: true });
  return new Promise((ok, gagal) => {
    anak.once("spawn", () => ok(anak));
    anak.once("error", gagal);
  });
}

/** Tulis berkas opsi MySQL sementara (izin 600); kembalikan path-nya. */
function tulisOpsiSementara(db) {
  const berkas = path.join(os.tmpdir(), `sensus-cadangan-${crypto.randomBytes(8).toString("hex")}.cnf`);
  fs.writeFileSync(berkas, isiOpsiMysql(db), { mode: 0o600 });
  return berkas;
}

module.exports = {
  bacaDatabaseUrl,
  isiOpsiMysql,
  argumenMysqldump,
  cariMysqldump,
  folderBulan,
  ringkasFotoPerBulan,
  buatTiket,
  pakaiTiket,
  alirkan,
  mulai,
  tulisOpsiSementara,
  UMUR_TIKET_MS,
};

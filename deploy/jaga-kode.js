"use strict";

/**
 * Kembalikan kode aplikasi ke versi Git bila ada yang menyuntingnya langsung di
 * server, misalnya lewat menu Files aaPanel. Suntingan seperti itu pernah membuat
 * aplikasi gagal start sehingga situs 502: kode yang dijalankan harus selalu kode
 * yang ada di GitHub.
 *
 * Suntingannya tidak dibuang, tetapi disimpan sebagai patch di
 * ~/sensus-pajak-suntingan/ (untuk root: /root/sensus-pajak-suntingan/) supaya bisa
 * diperiksa dan, bila memang perlu, dimasukkan lewat Git.
 *
 * Hanya berkas yang dilacak Git yang disentuh. .env, uploads/, dan client/dist/
 * diabaikan Git sehingga tetap apa adanya.
 *
 * Dipakai di dua tempat:
 *   - deploy/mulai.js, setiap kali PM2 menyalakan atau me-restart aplikasi;
 *   - deploy/perbarui.sh, sebelum `git pull` (node deploy/jaga-kode.js).
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FOLDER = path.join(os.homedir(), "sensus-pajak-suntingan");

const git = (...args) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** Waktu setempat untuk nama berkas, mis. 2026-10-15_085326. */
function cap(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/**
 * @returns {{ berkas: string[], patch: string } | null} berkas yang dikembalikan dan
 *   letak patch suntingannya, atau null bila kode sudah sama dengan Git.
 */
function pulihkanKode() {
  const berkas = git("diff", "--name-only", "HEAD").split("\n").filter(Boolean);
  if (!berkas.length) return null;

  const commit = git("rev-parse", "--short", "HEAD").trim();
  const patch = path.join(FOLDER, `${cap()}.patch`);
  fs.mkdirSync(FOLDER, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    patch,
    `# Suntingan langsung di server, dikembalikan ke versi Git (${commit}).\n` +
      `# Lihat isinya: less ${patch}\n\n` +
      git("diff", "--binary", "HEAD"),
    { mode: 0o600 }
  );

  // Hanya berkas yang dilacak Git; berkas yang tidak dilacak (.env, uploads/) tidak tersentuh.
  git("reset", "--quiet", "--hard", "HEAD");
  return { berkas, patch };
}

/** Cetak peringatan ke log PM2 / terminal bila ada berkas yang dikembalikan. */
function laporkan(hasil) {
  if (!hasil) return;
  console.warn(
    "[Sensus Pajak] PERINGATAN: kode disunting langsung di server dan sudah dikembalikan ke versi Git:\n" +
      hasil.berkas.map((b) => `  - ${b}\n`).join("") +
      `  Salinan suntingannya: ${hasil.patch}\n` +
      "  Perubahan kode harus lewat Git lalu dipasang dengan bash deploy/perbarui.sh."
  );
}

if (require.main === module) {
  laporkan(pulihkanKode());
}

module.exports = { pulihkanKode, laporkan };

"use strict";

/**
 * Tarik berkas foto dari server lama (mis. Railway) ke UPLOAD_DIR server ini.
 *
 *   node server/scripts/tarik-foto.js --dari=https://sensus-pajak.up.railway.app
 *
 * Dipakai saat pindah server, SETELAH database lama diimpor ke server ini:
 * daftar foto dibaca dari database lokal, lalu setiap berkas yang belum ada di
 * disk diunduh lewat GET {dari}/api/foto/:id dan disimpan di path yang sama
 * (kolom `berkas`). Berkas yang sudah ada dilewati, jadi skrip aman diulang bila
 * terputus di tengah jalan. Tidak ada yang dihapus.
 */

const fsp = require("fs").promises;
const path = require("path");
const config = require("../src/config");
const prisma = require("../src/prisma");
const { kenaliMime, pathBerkas } = require("../src/foto");

const PARALEL = 4;
const BATCH = 500;

const ada = (p) => fsp.access(p).then(() => true, () => false);

async function tarikSatu(dari, foto) {
  const tujuan = pathBerkas(foto.berkas);
  if (await ada(tujuan)) return "ada";

  const res = await fetch(`${dari}/api/foto/${foto.id}`, { signal: AbortSignal.timeout(60000) });
  if (res.status === 404) return "hilang";
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (!kenaliMime(buf)) throw new Error("isi unduhan bukan gambar");

  // Tulis ke berkas sementara dulu agar unduhan yang terputus tidak tertinggal setengah jadi.
  await fsp.mkdir(path.dirname(tujuan), { recursive: true });
  await fsp.writeFile(`${tujuan}.part`, buf);
  await fsp.rename(`${tujuan}.part`, tujuan);
  return "diunduh";
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--dari="));
  const dari = (arg ? arg.slice("--dari=".length) : "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(dari)) {
    console.error("Pakai: node server/scripts/tarik-foto.js --dari=https://alamat-server-lama");
    process.exit(1);
  }

  const total = await prisma.foto.count();
  console.log(`Sumber  : ${dari}`);
  console.log(`Tujuan  : ${config.uploadDir}`);
  console.log(`Foto tercatat di database: ${total}`);

  const hitung = { ada: 0, diunduh: 0, hilang: 0, gagal: 0 };
  const gagal = [];
  let selesai = 0;
  let setelahId = 0;

  for (;;) {
    const daftar = await prisma.foto.findMany({
      where: { id: { gt: setelahId } },
      orderBy: { id: "asc" },
      select: { id: true, berkas: true },
      take: BATCH,
    });
    if (daftar.length === 0) break;
    setelahId = daftar[daftar.length - 1].id;

    for (let i = 0; i < daftar.length; i += PARALEL) {
      await Promise.all(
        daftar.slice(i, i + PARALEL).map(async (foto) => {
          try {
            hitung[await tarikSatu(dari, foto)]++;
          } catch (e) {
            hitung.gagal++;
            gagal.push(`#${foto.id} ${foto.berkas}: ${e.message}`);
          }
          selesai++;
        })
      );
      process.stdout.write(`\r${selesai}/${total} diperiksa`);
    }
  }

  console.log("");
  console.log(`Diunduh             : ${hitung.diunduh}`);
  console.log(`Sudah ada           : ${hitung.ada}`);
  console.log(`Tidak ada di sumber : ${hitung.hilang}`);
  console.log(`Gagal               : ${hitung.gagal}`);
  if (gagal.length) {
    console.log("\nYang gagal (jalankan ulang skrip ini untuk mencoba lagi):");
    gagal.slice(0, 50).forEach((g) => console.log(`  ${g}`));
    if (gagal.length > 50) console.log(`  ... dan ${gagal.length - 50} lainnya`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("Gagal:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

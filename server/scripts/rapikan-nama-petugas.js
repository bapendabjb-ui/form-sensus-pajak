"use strict";

/**
 * Rapikan nama petugas yang sudah tersimpan jadi kapital tiap kata
 * ("RECKY AMIN NOOR RAHIM" -> "Recky Amin Noor Rahim").
 *
 *   node server/scripts/rapikan-nama-petugas.js           -> hanya pratinjau
 *   node server/scripts/rapikan-nama-petugas.js --simpan  -> simpan ke database
 */

const prisma = require("../src/prisma");
const { kapitalTiapKata } = require("../src/nama");

async function main() {
  const simpan = process.argv.includes("--simpan");
  const list = await prisma.petugas.findMany({ orderBy: { nama: "asc" } });
  const berubah = list
    .map((p) => ({ ...p, baru: kapitalTiapKata(p.nama.trim()) }))
    .filter((p) => p.baru !== p.nama);

  for (const p of berubah) console.log(`${p.nama}  ->  ${p.baru}`);
  console.log(`${berubah.length} dari ${list.length} nama perlu dirapikan.`);

  if (!simpan) {
    if (berubah.length) console.log("Pratinjau saja. Jalankan dengan --simpan untuk menyimpan.");
    return;
  }
  await prisma.$transaction(berubah.map((p) => prisma.petugas.update({ where: { id: p.id }, data: { nama: p.baru } })));
  console.log("Tersimpan.");
}

main()
  .catch((e) => {
    console.error("Gagal:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

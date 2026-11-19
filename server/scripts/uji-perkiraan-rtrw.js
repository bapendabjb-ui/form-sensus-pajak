"use strict";

/**
 * Uji ketepatan perkiraan RT/RW laporan SPJ (src/eksporSpj.js, tebakRtRw)
 * terhadap data sungguhan. BACA-SAJA: tidak ada yang ditulis ke database.
 *
 *   node server/scripts/uji-perkiraan-rtrw.js
 *
 * Caranya "tinggalkan satu": setiap kertas kerja yang RT/RW-nya diisi petugas
 * dianggap kosong, ditebak dari kertas kerja lain (hari, tim, kelurahan sama),
 * lalu tebakannya dibandingkan dengan isian aslinya. Hasilnya per aturan:
 * berapa yang tertebak, berapa RW-nya tepat, berapa RT-nya tepat.
 *
 * Bagian kedua: berapa kertas kerja yang sekarang RT/RW-nya kosong dan berapa
 * yang akan terisi bila SPJ_PERKIRAAN_RTRW=1 dinyalakan.
 */

const config = require("../src/config");
const prisma = require("../src/prisma");
const { muatSpj } = require("../src/routes/ekspor");
const { pengindeksKandidat, tebakRtRw } = require("../src/eksporSpj");

const ATURAN = ["sepakat", "terdekat", "rw-sepakat"];

const persen = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");
const kanan = (s, n) => String(s).padStart(n);

function bucketKandidat(n) {
  if (n === 1) return "1 kandidat";
  if (n <= 3) return "2-3 kandidat";
  return ">= 4 kandidat";
}

async function main() {
  const { baris, titik } = await muatSpj({ titikSemua: true });
  const kandidatUntuk = pengindeksKandidat(baris, config.timezone);

  /* ---------- 1. tinggalkan satu ---------- */
  const uji = baris.filter((b) => b.sumberRtRw === "isian" && b.rw);
  const perAturan = new Map(ATURAN.map((a) => [a, { n: 0, rwTepat: 0, rtDitebak: 0, rtTepat: 0 }]));
  const perJumlah = new Map();
  const meleset = [];
  let tanpaTebakan = 0;
  let tanpaKandidat = 0;

  for (const b of uji) {
    const kandidat = kandidatUntuk(b);
    if (kandidat.length === 0) tanpaKandidat++;
    const t = tebakRtRw(b, kandidat, titik);
    if (!t) {
      tanpaTebakan++;
      continue;
    }
    const rwTepat = t.rw === b.rw;
    const rtTepat = t.rt !== "" && rwTepat && t.rt === b.rt;
    for (const s of [perAturan.get(t.aturan), getOrInit(perJumlah, `${t.aturan}, ${bucketKandidat(kandidat.length)}`)]) {
      s.n++;
      if (rwTepat) s.rwTepat++;
      if (t.rt !== "") {
        s.rtDitebak++;
        if (rtTepat) s.rtTepat++;
      }
    }
    if (!rwTepat || (t.rt !== "" && !rtTepat))
      meleset.push(
        `  KK ${b.kk.nomor}: asli RW ${b.rw} RT ${b.rt || "-"}, tebakan RW ${t.rw} RT ${t.rt || "-"} ` +
          `(${t.aturan} dari KK ${t.dari.kk.nomor}` +
          (t.jarak !== null ? `, ${Math.round(t.jarak)} m` : t.menit !== null ? `, selisih ${Math.round(t.menit)} menit` : "") +
          ")"
      );
  }

  const tertebak = uji.length - tanpaTebakan;
  console.log("=== Uji ketepatan (RT/RW isian petugas dianggap kosong lalu ditebak) ===");
  console.log(`Kertas kerja ber-RT/RW isian : ${uji.length}`);
  console.log(`Tertebak                     : ${tertebak} (${persen(tertebak, uji.length)})`);
  console.log(`Tidak tertebak               : ${tanpaTebakan} (tanpa kandidat sehari: ${tanpaKandidat})`);
  console.log("");
  const kepala = `${"Aturan".padEnd(34)}${kanan("Jumlah", 8)}${kanan("RW tepat", 16)}${kanan("RT ditebak", 12)}${kanan("RT tepat", 16)}`;
  const tulis = (nama, s) =>
    console.log(
      `${nama.padEnd(34)}${kanan(s.n, 8)}${kanan(`${s.rwTepat} (${persen(s.rwTepat, s.n)})`, 16)}` +
        `${kanan(s.rtDitebak, 12)}${kanan(`${s.rtTepat} (${persen(s.rtTepat, s.rtDitebak)})`, 16)}`
    );
  console.log(kepala);
  const total = { n: 0, rwTepat: 0, rtDitebak: 0, rtTepat: 0 };
  for (const [a, s] of perAturan) {
    tulis(a, s);
    for (const k of Object.keys(total)) total[k] += s[k];
  }
  tulis("SEMUA", total);
  console.log("");
  console.log(kepala.replace("Aturan".padEnd(34), "Aturan, jumlah kandidat".padEnd(34)));
  for (const [nama, s] of [...perJumlah].sort(([a], [b]) => a.localeCompare(b))) tulis(nama, s);

  if (meleset.length) {
    console.log("");
    console.log(`Tebakan yang meleset (${meleset.length}${meleset.length > 30 ? ", 30 pertama" : ""}):`);
    for (const m of meleset.slice(0, 30)) console.log(m);
  }

  /* ---------- 2. yang akan terisi ---------- */
  const kosong = baris.filter((b) => !b.rw && !b.rt);
  const akan = new Map(ATURAN.map((a) => [a, 0]));
  let tanpaKelurahan = 0;
  for (const b of kosong) {
    if (!b.kecamatan || !b.kelurahan) {
      tanpaKelurahan++;
      continue;
    }
    const t = tebakRtRw(b, kandidatUntuk(b), titik);
    if (t) akan.set(t.aturan, akan.get(t.aturan) + 1);
  }
  const terisi = [...akan.values()].reduce((a, b) => a + b, 0);
  console.log("");
  console.log("=== Bila SPJ_PERKIRAAN_RTRW=1 dinyalakan ===");
  console.log(`Kertas kerja di laporan SPJ          : ${baris.length}`);
  console.log(`RT/RW kosong sekarang                : ${kosong.length}`);
  console.log(`  tanpa kelurahan (tidak bisa ditebak): ${tanpaKelurahan}`);
  console.log(`  akan terisi                        : ${terisi} (${persen(terisi, kosong.length)})`);
  for (const [a, n] of akan) console.log(`    ${a.padEnd(33)}: ${n}`);
  console.log(`  tetap kosong                       : ${kosong.length - terisi}`);
}

function getOrInit(map, key) {
  if (!map.has(key)) map.set(key, { n: 0, rwTepat: 0, rtDitebak: 0, rtTepat: 0 });
  return map.get(key);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

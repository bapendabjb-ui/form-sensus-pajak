"use strict";

const prisma = require("./prisma");
const config = require("./config");

const HARI_MS = 24 * 60 * 60 * 1000;

/**
 * Selisih zona waktu terhadap UTC dalam menit, mis. Asia/Makassar -> 480.
 * Dihitung sendiri karena tabel zona waktu MySQL (CONVERT_TZ dengan nama
 * zona) belum tentu terpasang di server.
 */
function selisihMenit(timeZone, waktu = new Date()) {
  const bagian = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(waktu)
      .map((p) => [p.type, p.value])
  );
  const lokal = Date.UTC(+bagian.year, +bagian.month - 1, +bagian.day, +bagian.hour, +bagian.minute);
  const utc = Math.floor(waktu.getTime() / 60000) * 60000;
  return Math.round((lokal - utc) / 60000);
}

/** Tanggal "YYYY-MM-DD" di zona waktu tertentu. */
function tanggalDi(timeZone, waktu = new Date()) {
  return new Date(waktu.getTime() + selisihMenit(timeZone, waktu) * 60000).toISOString().slice(0, 10);
}

/**
 * Lengkapi hitungan per tanggal menjadi deret harian tanpa bolong, dari hari
 * pertama ada kertas kerja sampai hari ini, beserta jumlah kumulatifnya.
 *
 * @param {{ tanggal: string, jumlah: number }[]} baris Hanya tanggal yang ada isinya.
 * @param {string} hariIni "YYYY-MM-DD"
 * @returns {{ tanggal: string, jumlah: number, kumulatif: number }[]}
 */
function susunHarian(baris, hariIni) {
  if (baris.length === 0) return [];
  const perTanggal = new Map(baris.map((b) => [b.tanggal, b.jumlah]));
  const awal = baris.reduce((min, b) => (b.tanggal < min ? b.tanggal : min), baris[0].tanggal);
  // Jam server yang sedikit mundur jangan sampai membuang data terbaru.
  const akhir = baris.reduce((maks, b) => (b.tanggal > maks ? b.tanggal : maks), hariIni);

  const deret = [];
  let kumulatif = 0;
  for (let t = Date.parse(awal); t <= Date.parse(akhir); t += HARI_MS) {
    const tanggal = new Date(t).toISOString().slice(0, 10);
    const jumlah = perTanggal.get(tanggal) || 0;
    kumulatif += jumlah;
    deret.push({ tanggal, jumlah, kumulatif });
  }
  return deret;
}

/**
 * Realisasi kertas kerja terhadap target: jumlah kertas kerja yang dibuat per
 * hari (menurut zona waktu aplikasi) beserta kumulatifnya.
 */
async function realisasiKertasKerja() {
  const sekarang = new Date();
  const menit = selisihMenit(config.timezone, sekarang);
  const baris = await prisma.$queryRaw`
    SELECT DATE_FORMAT(created_at + INTERVAL ${menit} MINUTE, '%Y-%m-%d') AS tanggal, COUNT(*) AS jumlah
    FROM kertas_kerja
    GROUP BY tanggal
    ORDER BY tanggal`;
  const hariIni = tanggalDi(config.timezone, sekarang);

  return {
    target: config.targetKertasKerja,
    hariIni,
    harian: susunHarian(
      baris.map((b) => ({ tanggal: b.tanggal, jumlah: Number(b.jumlah) })),
      hariIni
    ),
  };
}

module.exports = { selisihMenit, tanggalDi, susunHarian, realisasiKertasKerja };

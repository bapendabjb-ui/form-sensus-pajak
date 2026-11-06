"use strict";

/**
 * Integrasi NIB BPN dengan NOP PBB.
 *
 * Petugas mencatat bidang BPN yang ditempati objek pajak lewat pertanyaan
 * bertipe "nib" (Bidang Tanah BPN), di formulir yang juga punya pertanyaan NOP.
 * Hubungannya sengaja dicatat apa adanya, boleh banyak-ke-banyak: satu NOP bisa
 * menempati beberapa bidang, satu bidang bisa berisi beberapa NOP. Penyatuan
 * menjadi 1 NIB = 1 NOP dikerjakan sesudahnya, dari daftar yang disusun di sini.
 *
 * Pola tidak diisi petugas, tetapi disimpulkan dari seluruh data (analisis):
 *   cocok       1 NIB = 1 NOP
 *   banyak_nib  NOP ini menempati beberapa bidang (tiap bidangnya hanya NOP ini)
 *   banyak_nop  bidang ini berisi beberapa NOP
 *   campuran    keduanya
 *   tanpa_nop   bidang tercatat, NOP-nya kosong (calon objek baru)
 *   tanpa_nib   NOP tanpa bidang (belum bersertifikat / NIB belum diketahui / belum diisi)
 *   kosong      keduanya belum diisi
 *
 * Sumbernya tabel entri_nib (bentuk ternormalisasi jawaban "nib", ditulis
 * ulang setiap data disimpan - src/entri.js) dan jawaban pertanyaan NOP.
 */

const prisma = require("./prisma");
const { kunciBidang, STATUS_TANAH, PANJANG_NOP } = require("./answers");
const { formatNop, nibLengkap } = require("./format");

const POLA = {
  campuran: "Campuran: beberapa NIB dan beberapa NOP",
  banyak_nop: "1 NIB, beberapa NOP",
  banyak_nib: "Beberapa NIB, 1 NOP",
  tanpa_nop: "NIB tanpa NOP",
  tanpa_nib: "NOP tanpa NIB",
  kosong: "NIB dan NOP belum diisi",
  cocok: "1 NIB = 1 NOP",
};

/** Urutan tampil: yang perlu ditindaklanjuti lebih dulu. */
const URUTAN_POLA = Object.keys(POLA);

/** Status bidang di peta: cocok | tinjau (beberapa NOP / NOP-nya beberapa bidang) | tanpa_nop. */
const STATUS_BIDANG = ["cocok", "tinjau", "tanpa_nop"];

const nopSah = (v) => (typeof v === "string" && v.length === PANJANG_NOP ? v : "");

/* ---------- analisis (murni) ---------- */

/**
 * Hubungan NIB-NOP dari seluruh bidang tercatat.
 *
 * @param {{ kunci: string, nop: string }[]} baris  satu per bidang per data
 * @returns {{
 *   nopDi: (kunci) => Set<string>,      NOP yang tercatat di bidang ini
 *   bidangDari: (nop) => Set<string>,   bidang yang tercatat untuk NOP ini
 *   statusBidang: (kunci) => "cocok" | "tinjau" | "tanpa_nop",
 *   pola: ({ nop, kunci: string[] }) => string   kunci POLA
 * }}
 */
function analisis(baris) {
  const nopPerKunci = new Map();
  const kunciPerNop = new Map();
  for (const b of baris) {
    if (!nopPerKunci.has(b.kunci)) nopPerKunci.set(b.kunci, new Set());
    if (!b.nop) continue;
    nopPerKunci.get(b.kunci).add(b.nop);
    if (!kunciPerNop.has(b.nop)) kunciPerNop.set(b.nop, new Set());
    kunciPerNop.get(b.nop).add(b.kunci);
  }
  const kosong = new Set();
  const nopDi = (k) => nopPerKunci.get(k) || kosong;
  const bidangDari = (nop) => kunciPerNop.get(nop) || kosong;

  const statusBidang = (k) => {
    const nop = nopDi(k);
    if (nop.size === 0) return "tanpa_nop";
    if (nop.size === 1 && bidangDari([...nop][0]).size === 1) return "cocok";
    return "tinjau";
  };

  const pola = ({ nop, kunci = [] }) => {
    if (!kunci.length) return nop ? "tanpa_nib" : "kosong";
    if (!nop) return "tanpa_nop";
    const banyakNib = bidangDari(nop).size > 1;
    const banyakNop = kunci.some((k) => nopDi(k).size > 1);
    if (banyakNib && banyakNop) return "campuran";
    if (banyakNib) return "banyak_nib";
    if (banyakNop) return "banyak_nop";
    return "cocok";
  };

  return { nopDi, bidangDari, statusBidang, pola };
}

/** Daftar id urut -> selisih berurutan (id pertama apa adanya), supaya kiriman ke peta ringkas. */
function selisihUrut(ids) {
  const urut = [...new Set(ids)].sort((a, b) => a - b);
  return urut.map((v, i) => (i ? v - urut[i - 1] : v));
}

/* ---------- jawaban -> bidang ---------- */

/** NOP pertama yang lengkap dari jawaban sebuah data ({ tipe, nilai }[]), atau "". */
function nopEntri(jawaban) {
  for (const j of jawaban) if (j.tipe === "nop" && nopSah(j.nilai)) return j.nilai;
  return "";
}

/** Bidang dan status tanah dari jawaban "nib" sebuah data. Beberapa pertanyaan NIB digabung. */
function bidangEntri(jawaban) {
  const bidang = [];
  const dilihat = new Set();
  let status = "";
  for (const j of jawaban) {
    if (j.tipe !== "nib" || !j.nilai || typeof j.nilai !== "object") continue;
    for (const b of Array.isArray(j.nilai.bidang) ? j.nilai.bidang : []) {
      const kunci = kunciBidang(b.kode, b.nib);
      if (!b.nib || dilihat.has(kunci)) continue;
      dilihat.add(kunci);
      bidang.push({ ...b, kunci });
    }
    if (!status && STATUS_TANAH[j.nilai.status]) status = j.nilai.status;
  }
  return { bidang, status: bidang.length ? "" : status };
}

/** Judul data: jawaban teks pertama (mis. nama wajib pajak), sama dengan Peta Sensus. */
const TIPE_JUDUL = ["text", "dropdown", "radio", "paragraph"];
function judulDari(jawaban) {
  for (const j of jawaban) {
    if (TIPE_JUDUL.includes(j.tipe) && typeof j.nilai === "string" && j.nilai.trim()) return j.nilai.trim();
  }
  return "";
}

/** Luas tanah isian petugas (pertanyaan Luas Tanah & Bangunan pertama), atau null. */
function luasTanahDari(jawaban) {
  for (const j of jawaban) {
    const n = j.tipe === "luas" && j.nilai && typeof j.nilai === "object" ? j.nilai.tanah : null;
    if (n !== null && n !== undefined && Number.isFinite(Number(n))) return Number(n);
  }
  return null;
}

/** Jawaban Prisma (+ pertanyaan { tipe, urutan }) -> [{ tipe, nilai }] urut pertanyaan. */
const urutJawaban = (jawaban = []) =>
  jawaban
    .slice()
    .sort((a, b) => a.pertanyaan.urutan - b.pertanyaan.urutan)
    .map((j) => ({ tipe: j.pertanyaan.tipe, nilai: j.nilai }));

/* ---------- penyimpanan ---------- */

/**
 * Lengkapi bidang jawaban NIB dari tabel persil: tipe hak, luas peta, kelurahan,
 * dan kecamatan disalin dari data BPN saat disimpan (diPeta = ada di peta BPN).
 * Bidang yang tidak ada di peta (NIB dari sertifikat, atau bidangnya hilang
 * setelah impor ulang) tetap dicatat dengan salinan terakhirnya.
 *
 * @param {{ bidang: object[], status: string }} nilai  hasil normalNib
 */
async function lengkapiBidang(nilai) {
  if (!nilai.bidang.length) return nilai;
  const daftar = await prisma.persil.findMany({
    where: { aktif: true, OR: nilai.bidang.map((b) => ({ kodeWilayah: b.kode, nib: b.nib })) },
    select: { kodeWilayah: true, nib: true, tipeHak: true, luasPeta: true, kelurahan: true, kecamatan: true },
    orderBy: { id: "asc" },
  });
  const peta = new Map();
  for (const p of daftar) {
    const k = kunciBidang(p.kodeWilayah, p.nib);
    if (!peta.has(k)) peta.set(k, p);
  }
  return {
    ...nilai,
    bidang: nilai.bidang.map((b) => {
      const p = peta.get(kunciBidang(b.kode, b.nib));
      if (!p) return { ...b, diPeta: false };
      return { ...b, diPeta: true, tipeHak: p.tipeHak, luas: p.luasPeta, kelurahan: p.kelurahan, kecamatan: p.kecamatan };
    }),
  };
}

/**
 * Baris entri_nib dari jawaban yang sudah disiapkan (src/entri.js siapkanJawaban).
 * @param {{ q: { id, tipe }, nilai }[]} normal
 */
function barisEntriNib(normal) {
  const nop = nopEntri(normal.map((n) => ({ tipe: n.q.tipe, nilai: n.nilai })));
  const baris = [];
  for (const { q, nilai } of normal) {
    if (q.tipe !== "nib") continue;
    nilai.bidang.forEach((b, urutan) =>
      baris.push({
        pertanyaanId: q.id,
        kodeWilayah: b.kode,
        nib: b.nib,
        nop,
        sumber: b.sumber,
        luasPeta: Number.isFinite(b.luas) ? b.luas : null,
        urutan,
      })
    );
  }
  return baris;
}

/* ---------- pembacaan ---------- */

/** Seluruh bidang tercatat: [{ entriId, kunci, nop }]. */
async function bacaBidangTercatat() {
  const rows = await prisma.entriNib.findMany({ select: { entriId: true, kodeWilayah: true, nib: true, nop: true } });
  return rows.map((r) => ({ entriId: r.entriId, kunci: kunciBidang(r.kodeWilayah, r.nib), nop: r.nop }));
}

/**
 * Status bidang persil untuk Peta Sensus (mode warna "Status sensus"):
 * { cocok: [id], tinjau: [id], tanpa_nop: [id] } - id persil yang sedang aktif,
 * ditulis sebagai selisih berurutan (selisihUrut). Bidang yang tidak tercantum
 * belum tercatat di sensus.
 */
async function statusBidangPeta() {
  const baris = await bacaBidangTercatat();
  const hasil = Object.fromEntries(STATUS_BIDANG.map((s) => [s, []]));
  if (!baris.length) return hasil;
  const a = analisis(baris);
  const persil = await prisma.$queryRaw`
    SELECT p.id AS id, p.kode_wilayah AS kode, p.nib AS nib
    FROM persil p
    JOIN (SELECT DISTINCT kode_wilayah, nib FROM entri_nib) b ON b.kode_wilayah = p.kode_wilayah AND b.nib = p.nib
    WHERE p.aktif = 1`;
  for (const p of persil) hasil[a.statusBidang(kunciBidang(p.kode, p.nib))].push(Number(p.id));
  for (const s of STATUS_BIDANG) hasil[s] = selisihUrut(hasil[s]);
  return hasil;
}

/** Pilihan Prisma: data beserta jawaban yang dibaca integrasi. */
const PILIH_DATA = {
  id: true,
  kertasKerjaId: true,
  formulirId: true,
  createdAt: true,
  kertasKerja: { select: { nomor: true } },
  formulir: { select: { judul: true } },
  jawaban: {
    where: { pertanyaan: { tipe: { in: [...TIPE_JUDUL, "nop", "nib", "luas"] } } },
    select: { nilai: true, pertanyaan: { select: { tipe: true, urutan: true } } },
  },
};

/**
 * Data lain yang mencatat bidang-bidang ini: { [kunci]: [{ entriId, kkId, nomor, nop, judul }] }.
 * Untuk peringatan di layar isi data dan balon bidang di Peta Sensus.
 *
 * @param {string[]} kunci       kunciBidang
 * @param {number|null} kecuali  id data yang sedang dibuka (tidak ikut disebut)
 * @param {number} maks          data paling banyak per bidang
 */
async function sensusBidang(kunci, { kecuali = null, maks = 10 } = {}) {
  const pasangan = [...new Set(kunci)]
    .map((k) => {
      const i = k.indexOf("|");
      return i < 0 ? null : { kodeWilayah: k.slice(0, i), nib: k.slice(i + 1) };
    })
    .filter((p) => p && p.nib);
  if (!pasangan.length) return {};
  const rows = await prisma.entriNib.findMany({
    where: { OR: pasangan, ...(kecuali ? { entriId: { not: kecuali } } : {}) },
    select: { kodeWilayah: true, nib: true, nop: true, entri: { select: PILIH_DATA } },
    orderBy: { entriId: "asc" },
    take: 500,
  });
  const hasil = {};
  for (const r of rows) {
    const k = kunciBidang(r.kodeWilayah, r.nib);
    const daftar = (hasil[k] ||= []);
    if (daftar.length >= maks || daftar.some((d) => d.entriId === r.entri.id)) continue;
    daftar.push({
      entriId: r.entri.id,
      kkId: r.entri.kertasKerjaId,
      nomor: r.entri.kertasKerja.nomor,
      nop: r.nop,
      judul: judulDari(urutJawaban(r.entri.jawaban)),
    });
  }
  return hasil;
}

/* ---------- laporan ---------- */

const bulat2 = (n) => Math.round(n * 100) / 100;

/**
 * Laporan integrasi seluruh data dari formulir yang punya pertanyaan NIB:
 *   ringkas : { data, pola: { [kunci]: jumlah }, bidang, bidangDiPeta, nop }
 *   cakupan : [{ kunci, kecamatan, kelurahan, bidangBpn, tersensus }] - bidang BPN
 *             per kelurahan yang sudah tercatat di sensus
 *   baris   : satu per data, urut pola (yang perlu ditindaklanjuti dulu)
 */
async function susunLaporan() {
  const formNib = await prisma.pertanyaan.findMany({ where: { tipe: "nib" }, select: { formulirId: true }, distinct: ["formulirId"] });
  const idForm = formNib.map((f) => f.formulirId);
  const entri = idForm.length
    ? await prisma.entri.findMany({ where: { formulirId: { in: idForm } }, select: PILIH_DATA, orderBy: { id: "asc" } })
    : [];

  const data = entri.map((e) => {
    const jawaban = urutJawaban(e.jawaban);
    const { bidang, status } = bidangEntri(jawaban);
    return { e, jawaban, bidang, status, nop: nopEntri(jawaban) };
  });
  const a = analisis(data.flatMap((d) => d.bidang.map((b) => ({ kunci: b.kunci, nop: d.nop }))));

  const pola = Object.fromEntries(URUTAN_POLA.map((p) => [p, 0]));
  const semuaBidang = new Set();
  const bidangDiPeta = new Set();
  const semuaNop = new Set();
  const baris = data.map((d) => {
    const p = a.pola({ nop: d.nop, kunci: d.bidang.map((b) => b.kunci) });
    pola[p] += 1;
    if (d.nop) semuaNop.add(d.nop);
    const nopLain = new Set();
    for (const b of d.bidang) {
      semuaBidang.add(b.kunci);
      if (b.diPeta) bidangDiPeta.add(b.kunci);
      for (const n of a.nopDi(b.kunci)) if (n !== d.nop) nopLain.add(n);
    }
    const nibLain = d.nop ? [...a.bidangDari(d.nop)].filter((k) => !d.bidang.some((b) => b.kunci === k)) : [];
    const luasPeta = d.bidang.reduce((n, b) => (Number.isFinite(b.luas) ? n + b.luas : n), 0);
    return {
      entriId: d.e.id,
      kkId: d.e.kertasKerjaId,
      nomor: d.e.kertasKerja.nomor,
      formulir: d.e.formulir.judul,
      judul: judulDari(d.jawaban),
      nop: d.nop,
      pola: p,
      status: d.status,
      bidang: d.bidang.map((b) => ({
        kunci: b.kunci,
        nib: nibLengkap(b.kode, b.nib),
        sumber: b.sumber,
        diPeta: b.diPeta,
        tipeHak: b.tipeHak,
        luas: b.luas,
        kelurahan: b.kelurahan,
        kecamatan: b.kecamatan,
      })),
      luasPeta: d.bidang.some((b) => Number.isFinite(b.luas)) ? bulat2(luasPeta) : null,
      luasTanah: luasTanahDari(d.jawaban),
      nopLain: [...nopLain],
      nibLain: nibLain.map((k) => {
        const [kode, nib] = k.split("|");
        return nibLengkap(kode, nib);
      }),
      kelurahan: d.bidang.find((b) => b.kelurahan)?.kelurahan || "",
      createdAt: d.e.createdAt,
    };
  });

  const urutPola = new Map(URUTAN_POLA.map((p, i) => [p, i]));
  baris.sort(
    (x, y) =>
      urutPola.get(x.pola) - urutPola.get(y.pola) ||
      (x.nop || "~").localeCompare(y.nop || "~") ||
      x.nomor.localeCompare(y.nomor) ||
      x.entriId - y.entriId
  );

  return {
    ringkas: {
      formulir: idForm.length,
      data: data.length,
      pola,
      bidang: semuaBidang.size,
      bidangDiPeta: bidangDiPeta.size,
      nop: semuaNop.size,
    },
    cakupan: await cakupanKelurahan(),
    baris,
  };
}

/**
 * Bidang BPN per kelurahan dan yang sudah tercatat di sensus:
 * [{ kunci, kodeWilayah, kecamatan, kelurahan, bidangBpn, tersensus }], urut kecamatan & kelurahan.
 */
async function cakupanKelurahan() {
  const [total, tercatat] = await Promise.all([
    prisma.persil.groupBy({ by: ["kunciWilayah"], where: { aktif: true }, _count: { _all: true }, _max: { id: true } }),
    prisma.$queryRaw`
      SELECT p.kunci_wilayah AS kunci, COUNT(DISTINCT p.id) AS n
      FROM persil p
      JOIN (SELECT DISTINCT kode_wilayah, nib FROM entri_nib) b ON b.kode_wilayah = p.kode_wilayah AND b.nib = p.nib
      WHERE p.aktif = 1
      GROUP BY p.kunci_wilayah`,
  ]);
  if (!total.length) return [];
  const contoh = new Map(
    (
      await prisma.persil.findMany({
        where: { id: { in: total.map((t) => t._max.id) } },
        select: { id: true, kodeWilayah: true, kecamatan: true, kelurahan: true },
      })
    ).map((p) => [p.id, p])
  );
  const n = new Map(tercatat.map((t) => [t.kunci, Number(t.n)]));
  return total
    .map((t) => {
      const p = contoh.get(t._max.id) || {};
      return {
        kunci: t.kunciWilayah,
        kodeWilayah: p.kodeWilayah || "",
        kecamatan: p.kecamatan || "",
        kelurahan: p.kelurahan || "",
        bidangBpn: t._count._all,
        tersensus: n.get(t.kunciWilayah) || 0,
      };
    })
    .sort((x, y) => x.kecamatan.localeCompare(y.kecamatan) || x.kelurahan.localeCompare(y.kelurahan));
}

/**
 * Saring baris laporan: `pola` (kunci POLA, atau "" = semua) dan `cari` (NOP,
 * NIB, nama, atau nomor kertas kerja; tanda baca diabaikan untuk angka).
 */
function saringBaris(baris, { pola = "", cari = "" } = {}) {
  const kata = String(cari || "").trim().toLowerCase();
  const angka = kata.replace(/\D/g, "");
  return baris.filter((b) => {
    if (pola && b.pola !== pola) return false;
    if (!kata) return true;
    if (b.judul.toLowerCase().includes(kata) || b.kelurahan.toLowerCase().includes(kata)) return true;
    if (!angka) return false;
    return (
      b.nop.includes(angka) ||
      b.nomor.includes(angka) ||
      b.bidang.some((x) => x.nib.replace(/\D/g, "").includes(angka))
    );
  });
}

/** Tabel Excel daftar kerja integrasi (src/ekspor.js keXlsx): { header, baris }. */
function tabelLaporan(baris, { baseUrl = "" } = {}) {
  const teks = (s) => ({ teks: s === null || s === undefined ? "" : String(s) });
  const angka = (n) => (Number.isFinite(n) ? { teks: String(n), angka: n } : teks(""));
  const header = [
    "Pola",
    "NOP",
    "NIB",
    "Jumlah bidang",
    "Luas peta BPN (m²)",
    "Luas tanah isian (m²)",
    "Selisih luas (m²)",
    "Tipe hak",
    "Kelurahan (BPN)",
    "Status tanah",
    "NOP lain di bidang yang sama",
    "NIB lain milik NOP ini",
    "Nama / keterangan",
    "Kertas kerja",
    "Formulir",
    "Tautan data",
  ];
  return {
    header,
    baris: baris.map((b) => [
      teks(POLA[b.pola]),
      teks(b.nop && formatNop(b.nop)),
      teks(b.bidang.map((x) => (x.diPeta ? x.nib : `${x.nib} (tidak ada di peta BPN)`)).join("; ")),
      { teks: String(b.bidang.length), angka: b.bidang.length, format: "0" },
      angka(b.luasPeta),
      angka(b.luasTanah),
      angka(Number.isFinite(b.luasPeta) && Number.isFinite(b.luasTanah) ? bulat2(b.luasTanah - b.luasPeta) : NaN),
      teks([...new Set(b.bidang.map((x) => x.tipeHak).filter(Boolean))].join("; ")),
      teks(b.kelurahan),
      teks(STATUS_TANAH[b.status] || ""),
      teks(b.nopLain.map(formatNop).join("; ")),
      teks(b.nibLain.join("; ")),
      teks(b.judul),
      teks(b.nomor),
      teks(b.formulir),
      teks(`${baseUrl}/kertas-kerja/${b.kkId}/data/${b.entriId}`),
    ]),
  };
}

module.exports = {
  POLA,
  URUTAN_POLA,
  STATUS_BIDANG,
  // murni - diuji di server/test/integrasi.test.js
  analisis,
  selisihUrut,
  nopEntri,
  bidangEntri,
  barisEntriNib,
  saringBaris,
  tabelLaporan,
  // database
  lengkapiBidang,
  statusBidangPeta,
  sensusBidang,
  susunLaporan,
};

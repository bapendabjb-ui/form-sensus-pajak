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
 * Dua sumber pasangan NIB-NOP, dibaca bersama sebagai lapisan NOP PBB:
 *   - tabel entri_nib: bentuk ternormalisasi jawaban "nib" bersama NOP datanya,
 *     ditulis ulang setiap data disimpan (src/entri.js) - formulir mulai dari NOP;
 *   - tabel bidang_nop: NOP yang ditambahkan langsung pada bidang dari Peta Sensus
 *     (tab NOP di panel bidang) - peta mulai dari bidang.
 * Pasangan yang sama di kedua sumber dihitung sekali.
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

/** Label status bidang (lapisan NOP PBB, unduhan). */
const LABEL_STATUS_BIDANG = {
  cocok: "1 NIB = 1 NOP",
  tinjau: "Perlu ditinjau: beberapa NIB / NOP",
  tanpa_nop: "NIB tanpa NOP",
};

/** Keterangan NOP dari peta paling panjang. */
const KETERANGAN_MAKS = 200;

/** "kode|nib" -> { kode, nib }, atau null. */
function pisahKunci(k) {
  const s = String(k || "");
  const i = s.indexOf("|");
  if (i < 0) return null;
  const kode = s.slice(0, i);
  const nib = s.slice(i + 1);
  return nib ? { kode, nib } : null;
}

const nibDariKunci = (k) => {
  const p = pisahKunci(k);
  return p ? nibLengkap(p.kode, p.nib) : "";
};

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

/** Seluruh bidang tercatat di data sensus: [{ entriId, kunci, nop }]. */
async function bacaBidangTercatat() {
  const rows = await prisma.entriNib.findMany({ select: { entriId: true, kodeWilayah: true, nib: true, nop: true } });
  return rows.map((r) => ({ entriId: r.entriId, kunci: kunciBidang(r.kodeWilayah, r.nib), nop: r.nop }));
}

/** Seluruh NOP dari peta: [{ id, kunci, nop }]. */
async function bacaNopPeta() {
  const rows = await prisma.bidangNop.findMany({ select: { id: true, kodeWilayah: true, nib: true, nop: true } });
  return rows.map((r) => ({ id: r.id, kunci: kunciBidang(r.kodeWilayah, r.nib), nop: r.nop }));
}

/**
 * Status bidang persil untuk Peta Sensus (mode warna "Status sensus" / lapisan
 * NOP PBB): { cocok: [id], tinjau: [id], tanpa_nop: [id] } - id persil yang
 * sedang aktif, ditulis sebagai selisih berurutan (selisihUrut). Bidang yang
 * tidak tercantum belum tercatat di sensus maupun di peta.
 */
async function statusBidangPeta() {
  const [sensus, peta] = await Promise.all([bacaBidangTercatat(), bacaNopPeta()]);
  const hasil = Object.fromEntries(STATUS_BIDANG.map((s) => [s, []]));
  if (!sensus.length && !peta.length) return hasil;
  const a = analisis([...sensus, ...peta]);
  const persil = await prisma.$queryRaw`
    SELECT p.id AS id, p.kode_wilayah AS kode, p.nib AS nib
    FROM persil p
    JOIN (SELECT kode_wilayah, nib FROM entri_nib UNION SELECT kode_wilayah, nib FROM bidang_nop) b
      ON b.kode_wilayah = p.kode_wilayah AND b.nib = p.nib
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

/** Kunci bidang -> syarat Prisma { kodeWilayah, nib }; kunci yang rusak dibuang. */
const syaratKunci = (kunci) =>
  [...new Set(kunci)]
    .map(pisahKunci)
    .filter(Boolean)
    .map((p) => ({ kodeWilayah: p.kode, nib: p.nib }));

/**
 * Data sensus yang mencatat bidang-bidang ini: { [kunci]: [{ entriId, kkId, nomor, nop, judul }] }.
 * Untuk peringatan di layar isi data dan tab NOP di Peta Sensus.
 *
 * @param {string[]} kunci       kunciBidang
 * @param {number|null} kecuali  id data yang sedang dibuka (tidak ikut disebut)
 * @param {number} maks          data paling banyak per bidang
 */
async function sensusBidang(kunci, { kecuali = null, maks = 10 } = {}) {
  const pasangan = syaratKunci(kunci);
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

/** NOP dari peta pada bidang-bidang ini: { [kunci]: [baris bidang_nop] }, urut waktu. */
async function petaBidang(kunci) {
  const pasangan = syaratKunci(kunci);
  if (!pasangan.length) return {};
  const rows = await prisma.bidangNop.findMany({ where: { OR: pasangan }, orderBy: { id: "asc" }, take: 1000 });
  const hasil = {};
  for (const r of rows) (hasil[kunciBidang(r.kodeWilayah, r.nib)] ||= []).push(r);
  return hasil;
}

/**
 * Isi tab NOP di panel bidang Peta Sensus, per kunci bidang:
 *   { nop: [{ nop, sensus: [data], peta: [{ id, keterangan, oleh, waktu, bisaHapus }], bidangLain }],
 *     tanpaNop: [data sensus yang mencatat bidang ini tanpa NOP] }
 * `bidangLain` = berapa bidang lain yang juga tercatat untuk NOP itu (kedua sumber).
 *
 * @param {object|null} pengguna  src/auth.js bacaPengguna - menentukan bisaHapus
 * @param {number|null} kecuali    id data yang sedang dibuka di formulir: NOP-nya
 *                                 ditampilkan formulir itu sendiri, bukan sebagai data sensus
 */
async function nopBidang(kunci, pengguna = null, { kecuali = null } = {}) {
  const daftar = [...new Set(kunci)].filter((k) => pisahKunci(k));
  if (!daftar.length) return {};
  const [sensus, peta] = await Promise.all([sensusBidang(daftar, { maks: 20, kecuali }), petaBidang(daftar)]);
  const semuaNop = new Set();
  for (const k of daftar) {
    for (const s of sensus[k] || []) if (s.nop) semuaNop.add(s.nop);
    for (const p of peta[k] || []) semuaNop.add(p.nop);
  }
  const kunciPerNop = new Map();
  if (semuaNop.size) {
    const nop = [...semuaNop];
    const [a, b] = await Promise.all([
      prisma.entriNib.findMany({ where: { nop: { in: nop } }, select: { kodeWilayah: true, nib: true, nop: true }, distinct: ["kodeWilayah", "nib", "nop"] }),
      prisma.bidangNop.findMany({ where: { nop: { in: nop } }, select: { kodeWilayah: true, nib: true, nop: true } }),
    ]);
    for (const r of [...a, ...b]) {
      if (!kunciPerNop.has(r.nop)) kunciPerNop.set(r.nop, new Set());
      kunciPerNop.get(r.nop).add(kunciBidang(r.kodeWilayah, r.nib));
    }
  }
  return Object.fromEntries(daftar.map((k) => [k, susunNopBidang(k, { sensus: sensus[k] || [], peta: peta[k] || [], kunciPerNop, pengguna })]));
}

/**
 * NOP dari peta boleh dihapus admin, atau petugas yang menambahkannya sendiri.
 * @param {{ olehPeran, olehId }} baris
 * @param {{ role, id } | null} pengguna
 */
function bolehHapusNop(baris, pengguna) {
  if (!pengguna) return false;
  if (pengguna.role === "admin") return true;
  return pengguna.role === "petugas" && baris.olehPeran === "petugas" && baris.olehId === pengguna.id;
}

/** Tab NOP satu bidang (murni - lihat nopBidang). */
function susunNopBidang(kunci, { sensus = [], peta = [], kunciPerNop = new Map(), pengguna = null } = {}) {
  const perNop = new Map();
  const grup = (nop) => {
    if (!perNop.has(nop)) perNop.set(nop, { nop, sensus: [], peta: [], bidangLain: 0 });
    return perNop.get(nop);
  };
  const tanpaNop = [];
  for (const s of sensus) {
    const data = { entriId: s.entriId, kkId: s.kkId, nomor: s.nomor, judul: s.judul };
    if (s.nop) grup(s.nop).sensus.push(data);
    else tanpaNop.push(data);
  }
  for (const p of peta) {
    grup(p.nop).peta.push({
      id: p.id,
      keterangan: p.keterangan || "",
      oleh: p.olehNama || "",
      waktu: p.createdAt,
      bisaHapus: bolehHapusNop(p, pengguna),
    });
  }
  const nop = [...perNop.values()].sort((a, b) => a.nop.localeCompare(b.nop));
  for (const g of nop) {
    const bidang = kunciPerNop.get(g.nop) || new Set([kunci]);
    g.bidangLain = [...bidang].filter((k) => k !== kunci).length;
  }
  return { nop, tanpaNop };
}

/**
 * Baca kiriman "tambah NOP pada bidang": { kunci, nop, keterangan }. Melempar
 * pesan yang bisa ditampilkan bila tidak sah. NOP boleh diketik bertitik.
 * @returns {{ kode: string, nib: string, nop: string, keterangan: string }}
 */
function bacaKirimanNop(body = {}) {
  const k = pisahKunci(body.kunci);
  if (!k || !/^\d*$/.test(k.kode) || k.nib.length > 30 || k.kode.length > 20) {
    throw new Error("Bidang tidak dikenal. Ketuk bidangnya lagi di peta.");
  }
  const nop = String(body.nop ?? "").replace(/\D/g, "");
  if (nop.length !== PANJANG_NOP) throw new Error(`NOP PBB harus ${PANJANG_NOP} digit (baru ${nop.length} digit).`);
  const keterangan = String(body.keterangan ?? "").replace(/\s+/g, " ").trim();
  if (keterangan.length > KETERANGAN_MAKS) throw new Error(`Keterangan paling panjang ${KETERANGAN_MAKS} huruf.`);
  return { kode: k.kode, nib: k.nib, nop, keterangan };
}

/* ---------- laporan ---------- */

const bulat2 = (n) => Math.round(n * 100) / 100;

/**
 * NOP dari peta beserta keterangan bidang BPN-nya:
 * [{ id, kunci, nop, keterangan, olehNama, createdAt, tipeHak, luas, kelurahan, kecamatan, diPeta }]
 */
async function bacaNopPetaLengkap() {
  const rows = await prisma.$queryRaw`
    SELECT b.id AS id, b.kode_wilayah AS kode, b.nib AS nib, b.nop AS nop, b.keterangan AS keterangan,
           b.oleh_nama AS olehNama, b.created_at AS createdAt,
           p.tipe_hak AS tipeHak, p.luas_peta AS luas, p.kelurahan AS kelurahan, p.kecamatan AS kecamatan, p.id AS persilId
    FROM bidang_nop b
    LEFT JOIN persil p ON p.aktif = 1 AND p.kode_wilayah = b.kode_wilayah AND p.nib = b.nib
    ORDER BY b.id, p.id`;
  const dilihat = new Set();
  const hasil = [];
  for (const r of rows) {
    const id = Number(r.id);
    if (dilihat.has(id)) continue;
    dilihat.add(id);
    hasil.push({
      id,
      kunci: kunciBidang(r.kode, r.nib),
      nop: r.nop,
      keterangan: r.keterangan || "",
      olehNama: r.olehNama || "",
      createdAt: r.createdAt,
      tipeHak: r.tipeHak || "",
      luas: r.luas === null || r.luas === undefined ? null : Number(r.luas),
      kelurahan: r.kelurahan || "",
      kecamatan: r.kecamatan || "",
      diPeta: r.persilId !== null && r.persilId !== undefined,
    });
  }
  return hasil;
}

/**
 * Laporan integrasi seluruh data dari formulir yang punya pertanyaan NIB,
 * ditambah NOP dari peta (susunBaris):
 *   ringkas : { formulir, data, peta, pola, bidang, bidangDiPeta, bidangCocok, nop }
 *   cakupan : [{ kunci, kecamatan, kelurahan, bidangBpn, tersensus }] - bidang BPN
 *             per kelurahan yang sudah tercatat (sensus atau peta)
 *   baris   : urut pola (yang perlu ditindaklanjuti dulu)
 */
async function susunLaporan() {
  const formNib = await prisma.pertanyaan.findMany({ where: { tipe: "nib" }, select: { formulirId: true }, distinct: ["formulirId"] });
  const idForm = formNib.map((f) => f.formulirId);
  const [entri, peta] = await Promise.all([
    idForm.length
      ? prisma.entri.findMany({ where: { formulirId: { in: idForm } }, select: PILIH_DATA, orderBy: { id: "asc" } })
      : [],
    bacaNopPetaLengkap(),
  ]);

  const data = entri.map((e) => {
    const jawaban = urutJawaban(e.jawaban);
    const { bidang, status } = bidangEntri(jawaban);
    return { e, jawaban, bidang, status, nop: nopEntri(jawaban) };
  });
  const { baris, ringkas } = susunBaris(data, peta);
  return {
    ringkas: { formulir: idForm.length, ...ringkas },
    cakupan: await cakupanKelurahan(),
    baris,
  };
}

/**
 * Baris laporan (murni): satu per data sensus, ditambah satu per NOP dari peta
 * untuk pasangan NIB-NOP yang belum tercatat di data mana pun. Polanya dihitung
 * dari kedua sumber sekaligus.
 *
 * @param {object[]} data  [{ e, jawaban, bidang, status, nop }] (susunLaporan)
 * @param {object[]} peta  bacaNopPetaLengkap
 */
function susunBaris(data, peta = []) {
  const pasanganSensus = data.flatMap((d) => d.bidang.map((b) => ({ kunci: b.kunci, nop: d.nop })));
  const a = analisis([...pasanganSensus, ...peta.map((p) => ({ kunci: p.kunci, nop: p.nop }))]);

  const pola = Object.fromEntries(URUTAN_POLA.map((p) => [p, 0]));
  const semuaBidang = new Set();
  const bidangDiPeta = new Set();
  const semuaNop = new Set();

  const keterangan = (kunciRow, nopRow) => {
    const nopLain = new Set();
    for (const k of kunciRow) for (const n of a.nopDi(k)) if (n !== nopRow) nopLain.add(n);
    const nibLain = nopRow ? [...a.bidangDari(nopRow)].filter((k) => !kunciRow.includes(k)) : [];
    return { nopLain: [...nopLain], nibLain: nibLain.map(nibDariKunci) };
  };
  const luasDari = (bidang) =>
    bidang.some((b) => Number.isFinite(b.luas)) ? bulat2(bidang.reduce((n, b) => (Number.isFinite(b.luas) ? n + b.luas : n), 0)) : null;

  const baris = data.map((d) => {
    const kunci = d.bidang.map((b) => b.kunci);
    const p = a.pola({ nop: d.nop, kunci });
    pola[p] += 1;
    if (d.nop) semuaNop.add(d.nop);
    for (const b of d.bidang) {
      semuaBidang.add(b.kunci);
      if (b.diPeta) bidangDiPeta.add(b.kunci);
    }
    return {
      jenis: "sensus",
      entriId: d.e.id,
      kkId: d.e.kertasKerjaId,
      nomor: d.e.kertasKerja.nomor,
      formulir: d.e.formulir.judul,
      judul: judulDari(d.jawaban),
      oleh: "",
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
      luasPeta: luasDari(d.bidang),
      luasTanah: luasTanahDari(d.jawaban),
      ...keterangan(kunci, d.nop),
      kelurahan: d.bidang.find((b) => b.kelurahan)?.kelurahan || "",
      createdAt: d.e.createdAt,
    };
  });

  // NOP dari peta yang pasangannya belum ada di data sensus: dikelompokkan per NOP.
  const sudah = new Set(pasanganSensus.filter((x) => x.nop).map((x) => `${x.kunci}#${x.nop}`));
  const perNop = new Map();
  for (const p of peta) {
    semuaNop.add(p.nop);
    semuaBidang.add(p.kunci);
    if (p.diPeta) bidangDiPeta.add(p.kunci);
    if (sudah.has(`${p.kunci}#${p.nop}`)) continue;
    if (!perNop.has(p.nop)) perNop.set(p.nop, []);
    const daftar = perNop.get(p.nop);
    if (!daftar.some((x) => x.kunci === p.kunci)) daftar.push(p);
  }
  for (const [nop, daftar] of perNop) {
    const kunci = daftar.map((p) => p.kunci);
    const p = a.pola({ nop, kunci });
    pola[p] += 1;
    const bidang = daftar.map((x) => ({
      kunci: x.kunci,
      nib: nibDariKunci(x.kunci),
      sumber: "peta",
      diPeta: x.diPeta,
      tipeHak: x.tipeHak,
      luas: x.luas,
      kelurahan: x.kelurahan,
      kecamatan: x.kecamatan,
    }));
    baris.push({
      jenis: "peta",
      entriId: null,
      kkId: null,
      nomor: "",
      formulir: "Peta Sensus",
      judul: [...new Set(daftar.map((x) => x.keterangan).filter(Boolean))].join("; "),
      oleh: [...new Set(daftar.map((x) => x.olehNama).filter(Boolean))].join(", "),
      nop,
      pola: p,
      status: "",
      bidang,
      luasPeta: luasDari(bidang),
      luasTanah: null,
      ...keterangan(kunci, nop),
      kelurahan: bidang.find((b) => b.kelurahan)?.kelurahan || "",
      createdAt: daftar.reduce((t, x) => (!t || x.createdAt < t ? x.createdAt : t), null),
    });
  }

  const urutPola = new Map(URUTAN_POLA.map((p, i) => [p, i]));
  baris.sort(
    (x, y) =>
      urutPola.get(x.pola) - urutPola.get(y.pola) ||
      (x.nop || "~").localeCompare(y.nop || "~") ||
      (x.nomor || "~").localeCompare(y.nomor || "~") ||
      (x.entriId ?? Infinity) - (y.entriId ?? Infinity) ||
      (x.bidang[0]?.kunci || "").localeCompare(y.bidang[0]?.kunci || "")
  );

  return {
    baris,
    ringkas: {
      data: data.length,
      peta: peta.length,
      pola,
      bidang: semuaBidang.size,
      bidangDiPeta: bidangDiPeta.size,
      bidangCocok: [...semuaBidang].filter((k) => a.statusBidang(k) === "cocok").length,
      nop: semuaNop.size,
    },
  };
}

/**
 * Bidang BPN per kelurahan dan yang sudah tercatat (sensus atau peta):
 * [{ kunci, kodeWilayah, kecamatan, kelurahan, bidangBpn, tersensus }], urut kecamatan & kelurahan.
 */
async function cakupanKelurahan() {
  const [total, tercatat] = await Promise.all([
    prisma.persil.groupBy({ by: ["kunciWilayah"], where: { aktif: true }, _count: { _all: true }, _max: { id: true } }),
    prisma.$queryRaw`
      SELECT p.kunci_wilayah AS kunci, COUNT(DISTINCT p.id) AS n
      FROM persil p
      JOIN (SELECT kode_wilayah, nib FROM entri_nib UNION SELECT kode_wilayah, nib FROM bidang_nop) b
        ON b.kode_wilayah = p.kode_wilayah AND b.nib = p.nib
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

/* ---------- lapisan NOP PBB: unduhan ---------- */

/**
 * Pasangan NIB-NOP dari kedua sumber, satu per (bidang, NOP), beserta bidang yang
 * tercatat tanpa NOP (murni):
 * [{ kunci, nop, status, sensus: [{ nomor, entriId, kkId }], peta: [{ keterangan, oleh }],
 *    jumlahNopBidang, jumlahBidangNop }]
 *
 * @param {{ entriId, kkId, nomor, kunci, nop }[]} sensus
 * @param {{ kunci, nop, keterangan, olehNama }[]} peta
 */
function susunPasangan(sensus, peta) {
  const a = analisis([...sensus, ...peta]);
  const perPasangan = new Map();
  const ambil = (kunci, nop) => {
    const k = `${kunci}#${nop}`;
    if (!perPasangan.has(k)) perPasangan.set(k, { kunci, nop, sensus: [], peta: [] });
    return perPasangan.get(k);
  };
  for (const s of sensus) {
    const p = ambil(s.kunci, s.nop || "");
    if (!p.sensus.some((x) => x.entriId === s.entriId)) p.sensus.push({ entriId: s.entriId, kkId: s.kkId, nomor: s.nomor });
  }
  for (const x of peta) ambil(x.kunci, x.nop).peta.push({ keterangan: x.keterangan || "", oleh: x.olehNama || "" });
  // Bidang tanpa NOP yang ternyata punya NOP lain (dari data lain / peta) tidak perlu baris kosong.
  const hasil = [];
  for (const p of perPasangan.values()) {
    if (!p.nop && a.nopDi(p.kunci).size > 0) continue;
    hasil.push({
      ...p,
      status: a.statusBidang(p.kunci),
      jumlahNopBidang: a.nopDi(p.kunci).size,
      jumlahBidangNop: p.nop ? a.bidangDari(p.nop).size : 0,
    });
  }
  return hasil.sort((x, y) => x.kunci.localeCompare(y.kunci) || x.nop.localeCompare(y.nop));
}

/** Seluruh pasangan untuk unduhan (susunPasangan), dengan nomor kertas kerja tiap data sensus. */
async function bacaPasangan() {
  const [rows, peta] = await Promise.all([
    prisma.entriNib.findMany({
      select: { entriId: true, kodeWilayah: true, nib: true, nop: true, entri: { select: { kertasKerjaId: true, kertasKerja: { select: { nomor: true } } } } },
      orderBy: { entriId: "asc" },
    }),
    prisma.bidangNop.findMany({ orderBy: { id: "asc" } }),
  ]);
  return susunPasangan(
    rows.map((r) => ({ entriId: r.entriId, kkId: r.entri.kertasKerjaId, nomor: r.entri.kertasKerja.nomor, kunci: kunciBidang(r.kodeWilayah, r.nib), nop: r.nop })),
    peta.map((r) => ({ kunci: kunciBidang(r.kodeWilayah, r.nib), nop: r.nop, keterangan: r.keterangan, olehNama: r.olehNama }))
  );
}

/** Persil aktif untuk bidang-bidang tercatat: Map(kunci -> { tipeHak, luasPeta, kelurahan, kecamatan, geometri }). */
async function persilTercatat({ geometri = false } = {}) {
  const rows = geometri
    ? await prisma.$queryRaw`
        SELECT p.id AS id, p.kode_wilayah AS kode, p.nib AS nib, p.tipe_hak AS tipeHak, p.luas_peta AS luasPeta,
               p.kelurahan AS kelurahan, p.kecamatan AS kecamatan, p.geometri AS geometri
        FROM persil p
        JOIN (SELECT kode_wilayah, nib FROM entri_nib UNION SELECT kode_wilayah, nib FROM bidang_nop) b
          ON b.kode_wilayah = p.kode_wilayah AND b.nib = p.nib
        WHERE p.aktif = 1
        ORDER BY p.id`
    : await prisma.$queryRaw`
        SELECT p.id AS id, p.kode_wilayah AS kode, p.nib AS nib, p.tipe_hak AS tipeHak, p.luas_peta AS luasPeta,
               p.kelurahan AS kelurahan, p.kecamatan AS kecamatan
        FROM persil p
        JOIN (SELECT kode_wilayah, nib FROM entri_nib UNION SELECT kode_wilayah, nib FROM bidang_nop) b
          ON b.kode_wilayah = p.kode_wilayah AND b.nib = p.nib
        WHERE p.aktif = 1
        ORDER BY p.id`;
  const peta = new Map();
  for (const r of rows) {
    const k = kunciBidang(r.kode, r.nib);
    if (peta.has(k)) continue;
    peta.set(k, {
      tipeHak: r.tipeHak || "",
      luasPeta: r.luasPeta === null || r.luasPeta === undefined ? null : Number(r.luasPeta),
      kelurahan: r.kelurahan || "",
      kecamatan: r.kecamatan || "",
      geometri: r.geometri || null,
    });
  }
  return peta;
}

const SUMBER_PASANGAN = (p) =>
  p.sensus.length && p.peta.length ? "Data sensus + peta" : p.peta.length ? "Peta" : "Data sensus";

/** Tabel Excel pasangan NIB-NOP (murni): { header, baris }. */
function tabelPasangan(pasangan, persil = new Map(), { baseUrl = "" } = {}) {
  const teks = (s) => ({ teks: s === null || s === undefined ? "" : String(s) });
  const bulat = (n) => ({ teks: String(n), angka: n, format: "0" });
  const header = [
    "NIB",
    "NOP",
    "Status bidang",
    "Sumber",
    "Kertas kerja",
    "Keterangan (peta)",
    "Dicatat oleh (peta)",
    "Jumlah NOP di bidang ini",
    "Jumlah bidang NOP ini",
    "Tipe hak",
    "Luas peta BPN (m²)",
    "Kelurahan (BPN)",
    "Kecamatan (BPN)",
    "Tautan data",
  ];
  return {
    header,
    baris: pasangan.map((p) => {
      const b = persil.get(p.kunci) || {};
      return [
        teks(nibDariKunci(p.kunci)),
        teks(p.nop && formatNop(p.nop)),
        teks(LABEL_STATUS_BIDANG[p.status]),
        teks(SUMBER_PASANGAN(p)),
        teks([...new Set(p.sensus.map((s) => s.nomor))].join("; ")),
        teks([...new Set(p.peta.map((x) => x.keterangan).filter(Boolean))].join("; ")),
        teks([...new Set(p.peta.map((x) => x.oleh).filter(Boolean))].join(", ")),
        bulat(p.jumlahNopBidang),
        bulat(p.jumlahBidangNop),
        teks(b.tipeHak),
        Number.isFinite(b.luasPeta) ? { teks: String(b.luasPeta), angka: b.luasPeta } : teks(""),
        teks(b.kelurahan),
        teks(b.kecamatan),
        teks(p.sensus.map((s) => `${baseUrl}/kertas-kerja/${s.kkId}/data/${s.entriId}`).join(" ")),
      ];
    }),
  };
}

/**
 * Lapisan NOP PBB sebagai GeoJSON (teks, murni): satu Feature per bidang BPN
 * yang tercatat, dengan NOP-nya - peta PBB per bidang untuk QGIS / SISMIOP.
 * Tanpa data pribadi wajib pajak (nama, alamat), hanya NIB, NOP, dan statusnya.
 *
 * @param {object[]} pasangan  susunPasangan
 * @param {Map} persil         persilTercatat({ geometri: true })
 */
function teksGeojsonPbb(pasangan, persil) {
  const perBidang = new Map();
  for (const p of pasangan) {
    if (!perBidang.has(p.kunci)) perBidang.set(p.kunci, []);
    perBidang.get(p.kunci).push(p);
  }
  const fitur = [];
  for (const [kunci, daftar] of perBidang) {
    const b = persil.get(kunci);
    if (!b || !b.geometri) continue;
    const k = pisahKunci(kunci);
    const nop = daftar.map((p) => p.nop).filter(Boolean);
    const sumber = new Set(daftar.map(SUMBER_PASANGAN));
    const status = daftar[0].status;
    const properti = {
      nib: nibLengkap(k.kode, k.nib),
      kode_wilayah: k.kode,
      nomor_bidang: k.nib,
      nop: nop.length === 1 ? formatNop(nop[0]) : "",
      daftar_nop: nop.map(formatNop).join("; "),
      jumlah_nop: nop.length,
      status,
      keterangan_status: LABEL_STATUS_BIDANG[status] || "",
      sumber: sumber.size > 1 ? "Data sensus + peta" : [...sumber][0],
      tipe_hak: b.tipeHak,
      luas_peta: b.luasPeta,
      kelurahan: b.kelurahan,
      kecamatan: b.kecamatan,
    };
    fitur.push(`{"type":"Feature","geometry":${b.geometri},"properties":${JSON.stringify(properti)}}`);
  }
  return `{"type":"FeatureCollection","name":"peta_bidang_pbb","features":[\n${fitur.join(",\n")}\n]}\n`;
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
    if ([b.judul, b.kelurahan, b.oleh || ""].some((t) => t.toLowerCase().includes(kata))) return true;
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
    "Sumber",
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
      teks(b.jenis === "peta" ? `Peta Sensus${b.oleh ? ` (oleh ${b.oleh})` : ""}` : "Data sensus"),
      teks(b.nomor),
      teks(b.formulir),
      teks(
        b.jenis === "peta"
          ? `${baseUrl}/peta?nib=${encodeURIComponent(b.bidang[0]?.nib || "")}`
          : `${baseUrl}/kertas-kerja/${b.kkId}/data/${b.entriId}`
      ),
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
  susunBaris,
  susunNopBidang,
  bolehHapusNop,
  bacaKirimanNop,
  susunPasangan,
  tabelPasangan,
  teksGeojsonPbb,
  pisahKunci,
  LABEL_STATUS_BIDANG,
  // database
  lengkapiBidang,
  statusBidangPeta,
  sensusBidang,
  petaBidang,
  nopBidang,
  susunLaporan,
  bacaPasangan,
  persilTercatat,
};

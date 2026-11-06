"use strict";

const express = require("express");
const prisma = require("../prisma");
const config = require("../config");
const { requireAdmin, namaPelaku } = require("../auth");
const { wrap, badRequest, notFound, parseId, ApiError } = require("../http");
const { ambilNomorBerikutnya, previewNomorBerikutnya } = require("../nomor");
const {
  siapkanJawaban,
  tulisJawaban,
  muatEntri,
  bacaBerkas,
  bacaRekamKoordinat,
  hitungTidakLengkap,
} = require("../entri");
const { hapusBerkas } = require("../foto");
const { hapusKertasKerja } = require("../hapus");
const { includePengajuanTerakhir, bentukPengajuanTerakhir } = require("../pengajuan");
const { jawabanLokasiPertama, ringkasLokasiEntri } = require("../cekLokasi");
const { includePertanyaan, bentukFormulir, bentukTim, petaJawaban } = require("../bentuk");
const { susunTabel, barisTanpaData, baseUrlEkspor, namaBerkas, rutekanEkspor } = require("../ekspor");
const { pencariPersilEkspor } = require("../persil");

const router = express.Router();

const { PETUGAS_MAKS } = require("../batas");

const includeTim = { petugas: { include: { petugas: true } } };

/* ---------- validasi ---------- */

/** Baca & periksa daftar petugasIds (1..8, unik, semuanya terdaftar). */
async function bacaTim(body) {
  const mentah = Array.isArray(body?.petugasIds) ? body.petugasIds : [];
  const ids = [...new Set(mentah.map(Number).filter((n) => Number.isInteger(n) && n > 0))];

  if (ids.length === 0) throw badRequest("Pilih minimal satu petugas.");
  if (ids.length > PETUGAS_MAKS) {
    throw badRequest(`Maksimal ${PETUGAS_MAKS} petugas dalam satu kertas kerja.`);
  }

  const terdaftar = await prisma.petugas.count({ where: { id: { in: ids } } });
  if (terdaftar !== ids.length) throw badRequest("Ada petugas yang tidak ditemukan.");
  return ids;
}

/** Kertas kerja paling banyak dalam satu kali tambah petugas massal. */
const MASSAL_MAKS = 500;

/** Baca & periksa daftar kertasKerjaIds untuk tambah petugas massal. */
function bacaIdKertasKerja(body) {
  const mentah = Array.isArray(body?.kertasKerjaIds) ? body.kertasKerjaIds : [];
  const ids = [...new Set(mentah.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) throw badRequest("Pilih minimal satu kertas kerja.");
  if (ids.length > MASSAL_MAKS) {
    throw badRequest(`Paling banyak ${MASSAL_MAKS} kertas kerja sekaligus.`);
  }
  return ids;
}

/**
 * Rencana menambahkan petugas ke banyak tim sekaligus.
 *
 * daftarKk : [{ id, nomor, anggota: [{ petugasId, urutan }] }]
 * -> { baris (untuk createMany), ditambahkan, sudahAda, penuh } - tiga yang
 *    terakhir berisi nomor kertas kerja, untuk dilaporkan ke admin.
 *
 * Anggota baru ditaruh di belakang tim, jadi penanggung jawab (urutan 0) tidak
 * bergeser. Petugas yang sudah ada di tim dilewati. Tim yang akan melebihi
 * batas dilewati seluruhnya, bukan diisi sebagian: "sebagian masuk" sulit
 * dijelaskan di layar dan sulit dibetulkan sesudahnya.
 */
function rencanaTambahTim(daftarKk, petugasIds, maks = PETUGAS_MAKS) {
  const baris = [];
  const ditambahkan = [];
  const sudahAda = [];
  const penuh = [];

  for (const kk of daftarKk) {
    const ada = new Set(kk.anggota.map((a) => a.petugasId));
    const baru = petugasIds.filter((id) => !ada.has(id));
    if (baru.length === 0) {
      sudahAda.push(kk.nomor);
      continue;
    }
    if (ada.size + baru.length > maks) {
      penuh.push(kk.nomor);
      continue;
    }
    let urutan = kk.anggota.reduce((m, a) => Math.max(m, a.urutan), -1);
    for (const petugasId of baru) baris.push({ kertasKerjaId: kk.id, petugasId, urutan: ++urutan });
    ditambahkan.push(kk.nomor);
  }

  return { baris, ditambahkan, sudahAda, penuh };
}

/* ---------- pemuatan ---------- */

/** Kertas kerja + tim + seluruh entri beserta definisi formulir yang dipakai. */
async function muatDetail(id) {
  const kk = await prisma.kertasKerja.findUnique({
    where: { id },
    include: {
      ...includeTim,
      pengajuanHapus: includePengajuanTerakhir("kertas_kerja"),
      entri: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          jawaban: true,
          pengajuanHapus: { where: { status: "menunggu" }, select: { id: true }, take: 1 },
        },
      },
    },
  });
  if (!kk) throw notFound("Kertas kerja tidak ditemukan.");

  const formIds = [...new Set(kk.entri.map((e) => e.formulirId))];
  const formulir = formIds.length
    ? await prisma.formulir.findMany({
        where: { id: { in: formIds } },
        // Sama dengan urutan bank formulir yang disusun admin.
        orderBy: [{ urutan: "asc" }, { id: "asc" }],
        include: includePertanyaan,
      })
    : [];

  return { kk, formulir };
}

/** Ringkasan lokasi sensus kosong untuk klien lama (lihat bentukDetail). */
const LOKASI_LAMA = Object.freeze({ status: "baik", sumber: null, titik: null, dicek: null });

function bentukDetail({ kk, formulir }) {
  // Pertanyaan Lokasi per formulir, urut seperti di formulir - sumber titik objek.
  const qidLokasi = new Map(
    formulir.map((f) => [f.id, f.pertanyaan.filter((q) => q.tipe === "lokasi").map((q) => q.id)])
  );
  return {
    id: kk.id,
    nomor: kk.nomor,
    status: kk.status,
    createdAt: kk.createdAt,
    petugas: bentukTim(kk.petugas),
    // Pengganjal sementara: tab aplikasi yang masih terbuka sejak sebelum fitur
    // lokasi sensus dihapus (2026-11-04) membaca kk.lokasi.status dan akan
    // berlayar putih tanpa ini. Boleh dihapus setelah semua HP memuat ulang.
    lokasi: LOKASI_LAMA,
    pengajuanHapus: bentukPengajuanTerakhir(kk.pengajuanHapus),
    formulir: formulir.map(bentukFormulir),
    entri: kk.entri.map((e) => {
      const jawaban = petaJawaban(e.jawaban);
      return {
        id: e.id,
        formulirId: e.formulirId,
        berkasLengkap: e.berkasLengkap,
        catatanBerkas: e.catatanBerkas,
        diajukanHapus: e.pengajuanHapus.length > 0,
        dibuatOleh: e.dibuatOleh,
        lokasi: ringkasLokasiEntri(e, jawabanLokasiPertama(qidLokasi.get(e.formulirId) || [], jawaban)),
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        jawaban,
      };
    }),
  };
}

const bentukRingkas = (k, tidakLengkap, namaData) => ({
  id: k.id,
  nomor: k.nomor,
  status: k.status,
  createdAt: k.createdAt,
  petugas: bentukTim(k.petugas),
  jumlahData: k._count.entri,
  jumlahTidakLengkap: tidakLengkap.get(k.id) || 0,
  namaData: namaData.get(k.id) || [],
});

/*
 * Pertanyaan yang berisi nama orang: bersumber EPBB "Nama WP", atau berlabel
 * seperti "Nama Wajib Pajak", "Nama Pemilik", "Pemilik Terakhir". Dikenali
 * lewat label karena judul data (judulData) tidak cocok untuk ini: pertanyaan
 * wajib pertama di formulir yang ada adalah alamat objek (PBB-P2), status WP
 * (Identitas Wajib Pajak), atau nama usaha (PBJT) - bukan nama orangnya.
 */
const LABEL_NAMA = /\b(nama|pemilik)\b/i;
const LABEL_BUKAN_NAMA = /\b(usaha|alamat|tempat|objek)\b/i;

const pertanyaanNama = (q) =>
  q.tipe === "text" && (q.isiEpbb === "nama_wp" || (LABEL_NAMA.test(q.label) && !LABEL_BUKAN_NAMA.test(q.label)));

/**
 * Nama orang yang sudah didata di tiap kertas kerja, untuk kartu daftar:
 * diambil dari pertanyaan nama pertama yang terisi di tiap data, urut masuk,
 * tanpa kembar - "SUGIMAN" di PBB-P2 dan "Sugiman" di Identitas Wajib Pajak
 * cukup disebut sekali. Data tanpa nama orang dilewati; lebih baik tidak
 * disebut daripada alamat yang terbaca seperti nama.
 *
 * @param {object[]} entri  urut masuk; { kertasKerjaId, jawaban: [{ nilai, pertanyaan }] }
 * @returns {Map<number, string[]>}
 */
function susunNamaData(entri) {
  const perKk = new Map(); // kertasKerjaId -> Map<kunci, nama>
  for (const e of entri) {
    const isi = e.jawaban
      .filter((j) => pertanyaanNama(j.pertanyaan) && typeof j.nilai === "string" && j.nilai.trim())
      .sort((a, b) => a.pertanyaan.urutan - b.pertanyaan.urutan || a.pertanyaan.id - b.pertanyaan.id)[0];
    if (!isi) continue;

    const nama = isi.nilai.trim();
    const kunci = nama.replace(/\s+/g, " ").toLowerCase();
    if (!perKk.has(e.kertasKerjaId)) perKk.set(e.kertasKerjaId, new Map());
    const daftar = perKk.get(e.kertasKerjaId);
    if (!daftar.has(kunci)) daftar.set(kunci, nama);
  }
  return new Map([...perKk].map(([id, daftar]) => [id, [...daftar.values()]]));
}

/** Nama-nama data kertas kerja di satu halaman daftar (lihat susunNamaData). */
async function muatNamaData(kkIds) {
  if (!kkIds.length) return new Map();
  const entri = await prisma.entri.findMany({
    where: { kertasKerjaId: { in: kkIds } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      kertasKerjaId: true,
      // Nama selalu pertanyaan teks; foto, lokasi, dan tarif tidak perlu ditarik.
      jawaban: {
        where: { pertanyaan: { tipe: "text" } },
        select: {
          nilai: true,
          pertanyaan: { select: { id: true, tipe: true, label: true, isiEpbb: true, urutan: true } },
        },
      },
    },
  });
  return susunNamaData(entri);
}

/* ---------- daftar & penomoran ---------- */

/** Banyak baris per halaman bila klien tidak menentukan, dan batas atasnya. */
const PER_HALAMAN = 20;
const PER_HALAMAN_MAKS = 100;

const SARINGAN = new Set(["semua", "draft", "selesai", "kosong", "kurang"]);

/** Kata kunci lebih panjang dari ini dipotong; nama petugas pun paling 150 huruf. */
const CARI_MAKS = 100;

const adaHuruf = (s) => /\p{L}/u.test(s);

/**
 * Syarat WHERE untuk satu kata kunci (lihat syaratCari), atau null bila kata
 * itu tidak bermakna (tanda baca saja).
 */
function syaratKata(kata) {
  if (adaHuruf(kata)) return { petugas: { some: { petugas: { nama: { contains: kata } } } } };
  const angka = kata.replace(/\D/g, "");
  return angka ? { nomor: { contains: angka } } : null;
}

/** Syarat WHERE untuk sepotong kata kunci yang setiap katanya harus cocok, atau null. */
function syaratSemuaKata(teks) {
  const syarat = teks.split(/\s+/).map(syaratKata).filter(Boolean);
  if (syarat.length === 0) return null;
  return syarat.length === 1 ? syarat[0] : { AND: syarat };
}

/** Kata kunci dipecah pada koma; potongan yang tidak bermakna dibuang. */
const bagianCari = (cari) =>
  String(cari || "")
    .slice(0, CARI_MAKS)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => syaratSemuaKata(s));

/**
 * Potongan nama dalam pencarian "salah satu", mis. "surya, recky" ->
 * ["surya", "recky"]. Kosong bila pencarian tidak memakai koma atau namanya
 * kurang dari dua, karena "tim belum lengkap" baru bermakna mulai dua nama.
 */
function namaSalahSatu(cari) {
  const bagian = bagianCari(cari);
  if (bagian.length < 2) return [];
  const nama = bagian.filter(adaHuruf);
  return nama.length >= 2 ? nama : [];
}

/**
 * Syarat WHERE dari kata kunci pencarian: nomor kertas kerja atau nama petugas
 * di timnya.
 *
 * Kata kunci dipecah per kata dan setiap kata harus cocok. Kata yang memuat
 * huruf dicari di nama anggota tim - tidak harus anggota yang sama, jadi
 * "budi ani" menemukan tim yang berisi Budi dan Ani. Huruf besar-kecil tidak
 * dibedakan karena kolasi tabelnya utf8mb4_unicode_ci.
 *
 * Koma berarti "salah satu": "surya, recky" menemukan tim yang berisi Surya
 * ATAU Recky, untuk memeriksa tim yang anggotanya tersebar di beberapa kertas
 * kerja. Dengan `hanyaKurang`, yang tersisa hanya tim yang belum memuat semua
 * nama itu (lihat namaSalahSatu).
 *
 * Kata tanpa huruf dianggap nomor: selain angka dibuang, dan mengetik "4"
 * cukup untuk menemukan "00004" tanpa perlu menghitung nolnya.
 *
 * NIP sengaja tidak ikut dicari: NIP 18 digit hampir pasti memuat angka pendek
 * apa pun, sehingga mengetik "12" akan menarik kertas kerja yang tidak dicari.
 */
function syaratCari(cari, { hanyaKurang = false } = {}) {
  const bagian = bagianCari(cari);
  if (bagian.length === 0) return {};
  if (bagian.length === 1) return syaratSemuaKata(bagian[0]);

  const salahSatu = { OR: bagian.map(syaratSemuaKata) };
  const nama = namaSalahSatu(cari);
  if (!hanyaKurang || nama.length === 0) return salahSatu;
  return { AND: [salahSatu, { OR: nama.map((n) => ({ NOT: syaratSemuaKata(n) })) }] };
}

/** Huruf kecil tanpa tanda aksen, mendekati kolasi utf8mb4_unicode_ci. */
const kunciCocok = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Nama dari pencarian "salah satu" yang belum ada di tim kertas kerja ini.
 * Padanan JS dari syaratSemuaKata, supaya kartu bisa menyebut siapa yang kurang.
 *
 * @param {{ nomor: string, petugas: { nama: string }[] }} kk
 * @param {string[]} nama  hasil namaSalahSatu
 */
function belumAdaDiTim(kk, nama) {
  const anggota = kk.petugas.map((p) => kunciCocok(p.nama));
  const cocok = (kata) => {
    if (adaHuruf(kata)) return anggota.some((a) => a.includes(kunciCocok(kata)));
    const angka = kata.replace(/\D/g, "");
    return !angka || kk.nomor.includes(angka);
  };
  return nama.filter((n) => !n.split(/\s+/).every(cocok));
}

/** Syarat WHERE dari saringan status / kelengkapan berkas. */
function syaratSaring(saring) {
  if (saring === "draft" || saring === "selesai") return { status: saring };
  // Kertas kerja yang sudah dibuat tetapi belum diisi satu data pun.
  if (saring === "kosong") return { entri: { none: {} } };
  // "Berkas tidak lengkap" bukan kolom kertas kerja, melainkan sifat entri di
  // dalamnya. EXISTS jauh lebih murah daripada menghitung seluruhnya hanya
  // untuk tahu ada-tidaknya, dan entri_berkas_lengkap_idx sudah menopangnya.
  if (saring === "kurang") return { entri: { some: { berkasLengkap: false } } };
  return {};
}

/**
 * GET /api/kertas-kerja?hal=1&per=20&cari=&saring=semua
 *   -> { baris, hal, per, total, adaLagi, jumlah: { semua, draft, selesai, kosong, kurang } }
 *
 * Dipaginasi karena daftar ini bertambah terus sepanjang umur aplikasi dan
 * tidak pernah menyusut. Pencarian, penyaringan, dan angka pada tombol saringan
 * ikut pindah ke server - kalau ditinggal di klien, ketiganya hanya akan
 * bekerja atas halaman yang kebetulan sedang dimuat.
 *
 * Angka pada tombol saringan dihitung atas hasil PENCARIAN, bukan seluruh
 * tabel, supaya tombol tidak menjanjikan hasil yang tak akan muncul.
 */
/**
 * Baca hal / per / saring dari query string, dengan pembulatan ke batas yang
 * masuk akal. Nilai ngawur (huruf, negatif, 10.000) tidak boleh membuat server
 * menarik seluruh tabel atau melempar galat - cukup dikembalikan ke batasnya.
 */
function bacaPaginasi(query = {}) {
  const halMentah = Math.floor(Number(query.hal));
  const perMentah = Math.floor(Number(query.per));
  return {
    hal: Number.isFinite(halMentah) && halMentah > 0 ? halMentah : 1,
    per: Number.isFinite(perMentah) && perMentah > 0 ? Math.min(perMentah, PER_HALAMAN_MAKS) : PER_HALAMAN,
    saring: SARINGAN.has(query.saring) ? query.saring : "semua",
  };
}

router.get(
  "/",
  wrap(async (req, res) => {
    const { hal, per, saring } = bacaPaginasi(req.query);

    const nama = namaSalahSatu(req.query.cari);
    const hanyaKurang = req.query.timKurang === "1";
    const cari = syaratCari(req.query.cari, { hanyaKurang });
    const where = { ...cari, ...syaratSaring(saring) };

    const hitung = (tambahan) => prisma.kertasKerja.count({ where: { ...cari, ...tambahan } });

    const [list, total, semua, draft, selesai, kosong, kurang, timKurang] = await Promise.all([
      prisma.kertasKerja.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (hal - 1) * per,
        take: per,
        include: { ...includeTim, _count: { select: { entri: true } } },
      }),
      prisma.kertasKerja.count({ where }),
      hitung({}),
      hitung(syaratSaring("draft")),
      hitung(syaratSaring("selesai")),
      hitung(syaratSaring("kosong")),
      hitung(syaratSaring("kurang")),
      // Tim belum lengkap dihitung tanpa saringan status, sama seperti `jumlah`.
      nama.length
        ? prisma.kertasKerja.count({ where: syaratCari(req.query.cari, { hanyaKurang: true }) })
        : null,
    ]);

    const ids = list.map((k) => k.id);
    const [tidakLengkap, namaData] = await Promise.all([hitungTidakLengkap(ids), muatNamaData(ids)]);

    res.json({
      baris: list.map((k) => {
        const ringkas = bentukRingkas(k, tidakLengkap, namaData);
        return nama.length ? { ...ringkas, belumAda: belumAdaDiTim(ringkas, nama) } : ringkas;
      }),
      hal,
      per,
      total,
      adaLagi: hal * per < total,
      jumlah: { semua, draft, selesai, kosong, kurang },
      // Hanya untuk pencarian "salah satu" berisi dua nama atau lebih (lihat syaratCari).
      salahSatu: nama.length ? { nama, timKurang } : null,
    });
  })
);

/**
 * GET /api/kertas-kerja/pilihan -> [{ id, nomor, jumlahData, petugas }]
 *
 * Isi dropdown halaman Ekspor. Sengaja tidak dipaginasi: dropdown-nya sudah
 * punya kotak pencarian sendiri, dan memaginasi daftar pilihan hanya akan
 * menyembunyikan kertas kerja yang justru sedang dicari. Barisnya dibuat
 * seringan mungkin sebagai gantinya - tanpa status dan tanpa hitungan berkas
 * tidak lengkap, yang keduanya tidak dipakai di layar itu.
 */
router.get(
  "/pilihan",
  requireAdmin,
  wrap(async (_req, res) => {
    const list = await prisma.kertasKerja.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { ...includeTim, _count: { select: { entri: true } } },
    });
    res.json(
      list.map((k) => ({
        id: k.id,
        nomor: k.nomor,
        jumlahData: k._count.entri,
        petugas: bentukTim(k.petugas),
      }))
    );
  })
);

/**
 * GET /api/kertas-kerja/nomor-berikutnya
 * Pratinjau saja. Nomor final digenerate saat POST di dalam transaksi.
 */
router.get(
  "/nomor-berikutnya",
  wrap(async (_req, res) => {
    res.json({ nomor: await previewNomorBerikutnya(), petugasMaks: PETUGAS_MAKS });
  })
);

/** POST /api/kertas-kerja  { petugasIds: [] } -> buat kertas kerja bernomor otomatis. */
router.post(
  "/",
  wrap(async (req, res) => {
    const ids = await bacaTim(req.body);

    const dibuat = await prisma.$transaction(async (tx) => {
      const nomor = await ambilNomorBerikutnya(tx);
      return tx.kertasKerja.create({
        data: {
          nomor,
          status: "draft",
          petugas: { create: ids.map((petugasId, urutan) => ({ petugasId, urutan })) },
        },
      });
    });

    res.status(201).json(bentukDetail(await muatDetail(dibuat.id)));
  })
);

/* ---------- detail & pengelolaan ---------- */

/** GET /api/kertas-kerja/:id -> tim petugas + seluruh entri + definisi formulirnya. */
router.get(
  "/:id",
  wrap(async (req, res) => {
    res.json(bentukDetail(await muatDetail(parseId(req.params.id))));
  })
);

/** PUT /api/kertas-kerja/:id/petugas  { petugasIds: [] } -> ganti tim petugas. Khusus admin. */
router.put(
  "/:id/petugas",
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const ada = await prisma.kertasKerja.findUnique({ where: { id } });
    if (!ada) throw notFound("Kertas kerja tidak ditemukan.");

    const ids = await bacaTim(req.body);
    await prisma.$transaction(async (tx) => {
      await tx.kertasKerjaPetugas.deleteMany({ where: { kertasKerjaId: id } });
      await tx.kertasKerjaPetugas.createMany({
        data: ids.map((petugasId, urutan) => ({ kertasKerjaId: id, petugasId, urutan })),
      });
    });

    res.json(bentukDetail(await muatDetail(id)));
  })
);

/**
 * POST /api/kertas-kerja/tambah-petugas  { kertasKerjaIds: [], petugasIds: [] }
 *   -> { ditambahkan, sudahAda, penuh, tidakDitemukan }
 *
 * Masukkan petugas yang sudah terdaftar ke tim banyak kertas kerja sekaligus,
 * mis. anggota yang lupa dipilih saat kertas kerja dibuat. Anggota lama tetap;
 * aturan lengkapnya di rencanaTambahTim. Khusus admin, sama seperti mengganti
 * tim satu per satu.
 */
router.post(
  "/tambah-petugas",
  requireAdmin,
  wrap(async (req, res) => {
    const petugasIds = await bacaTim(req.body);
    const kkIds = bacaIdKertasKerja(req.body);

    const hasil = await prisma.$transaction(async (tx) => {
      const daftar = await tx.kertasKerja.findMany({
        where: { id: { in: kkIds } },
        orderBy: { nomor: "asc" },
        select: { id: true, nomor: true, petugas: { select: { petugasId: true, urutan: true } } },
      });
      const rencana = rencanaTambahTim(
        daftar.map((k) => ({ id: k.id, nomor: k.nomor, anggota: k.petugas })),
        petugasIds
      );
      // skipDuplicates: bila tim yang sama sedang diganti admin lain di saat
      // bersamaan, bentrok indeks unik cukup dilewati, bukan menggagalkan semua.
      if (rencana.baris.length) {
        await tx.kertasKerjaPetugas.createMany({ data: rencana.baris, skipDuplicates: true });
      }
      return { ...rencana, tidakDitemukan: kkIds.length - daftar.length };
    });

    const { ditambahkan, sudahAda, penuh, tidakDitemukan } = hasil;
    res.json({ ditambahkan, sudahAda, penuh, tidakDitemukan });
  })
);

/** PUT /api/kertas-kerja/:id/status  { status: "draft" | "selesai" } */
router.put(
  "/:id/status",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const status = String(req.body?.status || "");
    if (status !== "draft" && status !== "selesai") {
      throw badRequest('Status harus "draft" atau "selesai".');
    }

    const ada = await prisma.kertasKerja.findUnique({
      where: { id },
      include: { _count: { select: { entri: true } } },
    });
    if (!ada) throw notFound("Kertas kerja tidak ditemukan.");
    if (status === "selesai" && ada._count.entri === 0) {
      throw new ApiError(422, "Tambahkan minimal satu data sebelum menandai selesai.");
    }

    await prisma.kertasKerja.update({ where: { id }, data: { status } });
    res.json(bentukDetail(await muatDetail(id)));
  })
);

/**
 * POST /api/kertas-kerja/:id/entri
 *   { formulirId, jawaban: { [pertanyaanId]: nilai }, dariEpbb?: [pertanyaanId], berkasLengkap?, catatanBerkas? }
 * Tambah satu data lewat formulir. Kolom wajib divalidasi -> 422 { errors }.
 */
router.post(
  "/:id/entri",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const kk = await prisma.kertasKerja.findUnique({ where: { id } });
    if (!kk) throw notFound("Kertas kerja tidak ditemukan.");

    const formulirId = Number(req.body?.formulirId);
    if (!Number.isInteger(formulirId) || formulirId <= 0) throw badRequest("Formulir wajib dipilih.");

    const formulir = await prisma.formulir.findUnique({
      where: { id: formulirId },
      include: includePertanyaan,
    });
    if (!formulir) throw badRequest("Formulir tidak ditemukan.");
    if (formulir.pertanyaan.length === 0) throw badRequest("Formulir ini belum punya pertanyaan.");

    const berkas = bacaBerkas(req.body);
    const siap = await siapkanJawaban(formulir, req.body?.jawaban, null, req.body?.dariEpbb, {
      berkasKurang: berkas.berkasLengkap === false,
    });
    if (Object.keys(siap.errors).length) {
      throw new ApiError(422, "Periksa kembali isian yang ditandai merah.", { errors: siap.errors });
    }

    let dilepas = [];
    const entri = await prisma.$transaction(async (tx) => {
      const e = await tx.entri.create({
        data: {
          kertasKerjaId: id,
          formulirId,
          ...berkas,
          ...bacaRekamKoordinat(req.body),
          dibuatOleh: await namaPelaku(req),
        },
      });
      dilepas = await tulisJawaban(tx, e.id, siap);
      return e;
    });
    await hapusBerkas(dilepas);

    res.status(201).json(await muatEntri(entri.id));
  })
);

/** DELETE /api/kertas-kerja/:id -> hapus beserta seluruh entri & fotonya. Khusus admin. */
router.delete(
  "/:id",
  requireAdmin,
  wrap(async (req, res) => {
    await hapusKertasKerja(parseId(req.params.id), req.admin);
    res.status(204).end();
  })
);

/* ---------- ekspor ---------- */

/**
 * Muat kertas kerja lalu susun tabel ekspornya (dipakai CSV maupun Excel).
 * `?formulir=<id>` membatasi ekspor ke satu formulir di kertas kerja itu.
 */
async function dataEkspor(req) {
  const { kk, formulir: semua } = await muatDetail(parseId(req.params.id));
  const pilih = req.query.formulir ? parseId(req.query.formulir) : null;
  const formulir = pilih ? semua.filter((f) => f.id === pilih) : semua;

  // Satu formulir: satu baris per data. Semua formulir: satu baris untuk
  // kertas kerja ini, kolom tiap formulir berdampingan.
  const tabel = susunTabel(
    kk.entri.map((e) => ({ kk, e })),
    formulir,
    {
      perData: Boolean(pilih),
      baseUrl: baseUrlEkspor(req),
      timezone: config.timezone,
      persilDi: await pencariPersilEkspor(kk.entri),
    }
  );
  if (tabel.baris.length === 0) tabel.baris.push(barisTanpaData(kk));

  const satu = pilih && formulir[0];
  return {
    nama: satu ? `kertas-kerja-${kk.nomor}-${namaBerkas(satu.judul, "formulir")}` : `kertas-kerja-${kk.nomor}`,
    sheet: satu ? `${kk.nomor} ${satu.judul}` : `Kertas kerja ${kk.nomor}`,
    tabel,
  };
}

/**
 * GET /api/kertas-kerja/:id/export[?formulir=<id>] -> CSV (BOM UTF-8); /xlsx,
 * /geojson, dan /kml berisi tabel yang sama (lihat dataEkspor). Khusus admin.
 */
rutekanEkspor(router, "/:id/export", requireAdmin, dataEkspor);

module.exports = router;

// Diekspor untuk diuji terpisah: semuanya murni dan menentukan apa yang ikut
// terkirim, sementara query di atas perlu database.
module.exports.bacaPaginasi = bacaPaginasi;
module.exports.syaratCari = syaratCari;
module.exports.namaSalahSatu = namaSalahSatu;
module.exports.belumAdaDiTim = belumAdaDiTim;
module.exports.syaratSaring = syaratSaring;
module.exports.susunNamaData = susunNamaData;
module.exports.bacaIdKertasKerja = bacaIdKertasKerja;
module.exports.rencanaTambahTim = rencanaTambahTim;

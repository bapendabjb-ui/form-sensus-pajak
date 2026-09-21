"use strict";

const express = require("express");
const multer = require("multer");
const prisma = require("../prisma");
const { requireAdmin } = require("../auth");
const { wrap, badRequest, notFound, conflict, parseId } = require("../http");
const { kapitalTiapKata } = require("../nama");
const { rekapPetugas, rekapKosong } = require("../rekap");
const { namaBerkas, kirimCsv, kirimXlsx } = require("../ekspor");
const { bacaBerkasPetugas } = require("../imporPetugas");

const router = express.Router();

/** Berkas daftar petugas kecil; 2 MB sudah jauh lebih dari cukup. */
const IMPOR_MAKS_MB = 2;
const unggah = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMPOR_MAKS_MB * 1024 * 1024, files: 1 },
});

const bentuk = (p, rekap = rekapKosong()) => ({
  id: p.id,
  nama: p.nama,
  nip: p.nip,
  createdAt: p.createdAt,
  ...rekap,
});

/** NIP dibandingkan tanpa spasi: "031 1998 2021" sama dengan "03119982021". */
const kunciNip = (nip) => String(nip || "").replace(/\s/g, "");

/** Nama dibandingkan tanpa beda huruf besar-kecil & spasi ganda. */
const kunciNama = (nama) => String(nama || "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Tolak nama atau NIP yang sudah dipakai petugas lain. NIP kosong boleh dobel (opsional).
 * Dicek di aplikasi, bukan indeks unik database, supaya data lama yang terlanjur
 * dobel tidak menggagalkan migrasi saat deploy.
 */
async function pastikanUnik(nama, nip, kecualiId) {
  const lain = await prisma.petugas.findMany({
    where: kecualiId ? { id: { not: kecualiId } } : {},
    select: { nama: true, nip: true },
  });

  const namaSama = lain.find((p) => kunciNama(p.nama) === kunciNama(nama));
  if (namaSama) throw conflict(`Petugas bernama ${namaSama.nama} sudah terdaftar.`);

  const kunci = kunciNip(nip);
  const nipSama = kunci && lain.find((p) => kunciNip(p.nip) === kunci);
  if (nipSama) throw conflict(`NIP ${nip} sudah terdaftar atas nama ${nipSama.nama}.`);
}

/**
 * GET /api/petugas -> daftar petugas (sumber dropdown di wizard kertas kerja),
 * lengkap dengan rekap jumlah kertas kerja & data yang dikerjakan masing-masing.
 * Terbuka: petugas lapangan perlu menyusun timnya tanpa login.
 */
router.get(
  "/",
  wrap(async (_req, res) => {
    const [list, rekap] = await Promise.all([
      prisma.petugas.findMany({ orderBy: { nama: "asc" } }),
      rekapPetugas(),
    ]);
    res.json(list.map((p) => bentuk(p, rekap.get(p.id))));
  })
);

/* ---------- ekspor ---------- */

/** Tabel daftar petugas untuk diunduh. Kolom Nama & NIP sengaja diletakkan di
 *  depan dan dinamai persis seperti yang diterima impor, supaya hasil ekspor
 *  bisa disunting lalu diimpor kembali tanpa diubah bentuknya. */
async function tabelPetugas() {
  const [list, rekap] = await Promise.all([
    prisma.petugas.findMany({ orderBy: { nama: "asc" } }),
    rekapPetugas(),
  ]);
  return {
    header: ["Nama", "NIP", "Kertas Kerja", "Data"],
    baris: list.map((p) => {
      const r = rekap.get(p.id) || rekapKosong();
      return [
        { teks: p.nama },
        // Ditulis sebagai teks, bukan angka: keXlsx menjaga nol di depan NIP
        // dan mencegah Excel mengubahnya jadi 1,98E+17.
        { teks: p.nip },
        { teks: String(r.jumlahKertasKerja) },
        { teks: String(r.jumlahData) },
      ];
    }),
  };
}

const namaEkspor = () => namaBerkas(`daftar-petugas-${new Date().toISOString().slice(0, 10)}`, "daftar-petugas");

/** GET /api/petugas/export -> CSV daftar petugas. Khusus admin. */
router.get(
  "/export",
  requireAdmin,
  wrap(async (_req, res) => kirimCsv(res, { nama: namaEkspor(), tabel: await tabelPetugas() }))
);

/** GET /api/petugas/export/xlsx -> Excel, isi sama dengan CSV. Khusus admin. */
router.get(
  "/export/xlsx",
  requireAdmin,
  wrap(async (_req, res) =>
    kirimXlsx(res, { nama: namaEkspor(), sheet: "Petugas", tabel: await tabelPetugas() })
  )
);

/* ---------- impor ---------- */

/**
 * POST /api/petugas/impor  (multipart, field "berkas") -> tambah dari .xlsx/.csv.
 * Khusus admin.
 *
 * Baris yang namanya sudah terdaftar dilewati, sisanya tetap masuk, dan
 * hasilnya dilaporkan per baris. Impor sebagian lebih berguna daripada menolak
 * seluruh berkas hanya karena beberapa baris bermasalah - dan karena duplikat
 * dilewati, berkas yang sama boleh diimpor ulang tanpa efek samping.
 *
 * Duplikat dicek terhadap data yang sudah ada DAN terhadap baris sebelumnya di
 * berkas yang sama, supaya berkas yang memuat nama kembar tidak lolos.
 */
router.post(
  "/impor",
  requireAdmin,
  unggah.single("berkas"),
  wrap(async (req, res) => {
    if (!req.file?.buffer?.length) throw badRequest("Pilih berkas .xlsx atau .csv lebih dulu.");

    const { baris, galat } = await bacaBerkasPetugas(req.file.buffer, req.file.originalname || "");
    if (galat) throw badRequest(galat);
    if (baris.length === 0) throw badRequest("Tidak ada baris data di bawah judul kolom.");

    const adaSekarang = await prisma.petugas.findMany({ select: { nama: true, nip: true } });
    const namaTerpakai = new Set(adaSekarang.map((p) => kunciNama(p.nama)));
    const nipTerpakai = new Set(adaSekarang.map((p) => kunciNip(p.nip)).filter(Boolean));

    const tambah = [];
    const dilewati = [];
    const ditolak = [];

    for (const b of baris) {
      const nama = kapitalTiapKata(b.nama);
      const nip = b.nip;

      if (!nama) {
        ditolak.push({ baris: b.baris, nama: b.nama, alasan: "Nama kosong." });
        continue;
      }
      if (nama.length > 150) {
        ditolak.push({ baris: b.baris, nama, alasan: "Nama lebih dari 150 karakter." });
        continue;
      }
      if (nip.length > 40) {
        ditolak.push({ baris: b.baris, nama, alasan: "NIP lebih dari 40 karakter." });
        continue;
      }

      const kn = kunciNama(nama);
      if (namaTerpakai.has(kn)) {
        dilewati.push({ baris: b.baris, nama, alasan: "Nama sudah terdaftar." });
        continue;
      }
      const ki = kunciNip(nip);
      if (ki && nipTerpakai.has(ki)) {
        dilewati.push({ baris: b.baris, nama, alasan: `NIP ${nip} sudah terdaftar.` });
        continue;
      }

      namaTerpakai.add(kn);
      if (ki) nipTerpakai.add(ki);
      tambah.push({ nama, nip });
    }

    if (tambah.length) await prisma.petugas.createMany({ data: tambah });

    res.json({
      dibaca: baris.length,
      ditambahkan: tambah.length,
      dilewati,
      ditolak,
    });
  })
);

/** POST /api/petugas -> tambah petugas. Data induk, jadi khusus admin. */
router.post(
  "/",
  requireAdmin,
  wrap(async (req, res) => {
    const nama = kapitalTiapKata(String(req.body?.nama || "").trim());
    const nip = String(req.body?.nip || "").trim();
    if (!nama) throw badRequest("Nama petugas wajib diisi.");
    if (nama.length > 150) throw badRequest("Nama petugas maksimal 150 karakter.");
    if (nip.length > 40) throw badRequest("NIP maksimal 40 karakter.");

    await pastikanUnik(nama, nip);

    const dibuat = await prisma.petugas.create({ data: { nama, nip } });
    res.status(201).json(bentuk(dibuat));
  })
);

/** PUT /api/petugas/:id -> ubah nama / NIP. Khusus admin. */
router.put(
  "/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const nama = kapitalTiapKata(String(req.body?.nama || "").trim());
    const nip = String(req.body?.nip || "").trim();
    if (!nama) throw badRequest("Nama petugas wajib diisi.");
    if (nama.length > 150) throw badRequest("Nama petugas maksimal 150 karakter.");
    if (nip.length > 40) throw badRequest("NIP maksimal 40 karakter.");

    const ada = await prisma.petugas.findUnique({ where: { id } });
    if (!ada) throw notFound("Petugas tidak ditemukan.");
    await pastikanUnik(nama, nip, id);

    const diubah = await prisma.petugas.update({ where: { id }, data: { nama, nip } });
    res.json(bentuk(diubah));
  })
);

/** DELETE /api/petugas/:id -> hapus, ditolak bila masih dipakai kertas kerja. Khusus admin. */
router.delete(
  "/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const ada = await prisma.petugas.findUnique({ where: { id } });
    if (!ada) throw notFound("Petugas tidak ditemukan.");

    const terpakai = await prisma.kertasKerjaPetugas.count({ where: { petugasId: id } });
    if (terpakai > 0) {
      throw conflict(
        `Petugas masih dipakai oleh ${terpakai} kertas kerja, jadi tidak bisa dihapus.`,
        { terpakai }
      );
    }

    await prisma.petugas.delete({ where: { id } });
    res.status(204).end();
  })
);

module.exports = router;

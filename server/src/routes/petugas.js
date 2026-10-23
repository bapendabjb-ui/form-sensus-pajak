"use strict";

const express = require("express");
const multer = require("multer");
const prisma = require("../prisma");
const { requireAdmin, bacaAdmin, hashPassword } = require("../auth");
const { wrap, badRequest, notFound, conflict, parseId } = require("../http");
const {
  normalUsername,
  galatUsername,
  galatPassword,
  usernameDariNama,
  usernameUnik,
  buatPassword,
} = require("../akunPetugas");
const { aturWajibLoginPetugas } = require("../pengaturan");
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

/**
 * `admin`: sertakan keterangan akun login. Daftar petugas juga dibuka petugas
 * lain (penyusun tim), dan username bukan urusan mereka.
 */
const bentuk = (p, rekap = rekapKosong(), admin = false) => ({
  id: p.id,
  nama: p.nama,
  nip: p.nip,
  createdAt: p.createdAt,
  ...rekap,
  ...(admin
    ? { akun: p.passwordHash ? { username: p.username, masukTerakhir: p.masukTerakhir } : null }
    : {}),
});

/** NIP dibandingkan tanpa spasi: "031 1998 2021" sama dengan "03119982021". */
const kunciNip = (nip) => String(nip || "").replace(/\s/g, "");

/** Nama dibandingkan tanpa beda huruf besar-kecil & spasi ganda. */
const kunciNama = (nama) => String(nama || "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Tolak nama atau NIP yang sudah dipakai petugas lain. NIP kosong boleh dobel (opsional).
 * Dicek di aplikasi, bukan indeks unik database, supaya data lama yang terlanjur
 * dobel tidak menggagalkan migrasi saat deploy.
 *
 * Penyamaannya dikerjakan MySQL, bukan di Node: yang kembali hanya baris yang
 * benar-benar bentrok, bukan seluruh tabel petugas. REGEXP_REPLACE menyamakan
 * spasi persis seperti kunciNama() / kunciNip() di atas, supaya aturan di
 * database dan di aplikasi tidak bisa menyimpang.
 */
async function pastikanUnik(nama, nip, kecualiId) {
  const kNama = kunciNama(nama);
  const kNip = kunciNip(nip);

  const bentrok = await prisma.$queryRaw`
    SELECT nama, nip FROM petugas
    WHERE id <> ${kecualiId || 0}
      AND (
        LOWER(REGEXP_REPLACE(TRIM(nama), '[[:space:]]+', ' ')) = ${kNama}
        OR (${kNip} <> '' AND REGEXP_REPLACE(nip, '[[:space:]]', '') = ${kNip})
      )
    LIMIT 5`;

  const namaSama = bentrok.find((p) => kunciNama(p.nama) === kNama);
  if (namaSama) throw conflict(`Petugas bernama ${namaSama.nama} sudah terdaftar.`);

  const nipSama = kNip && bentrok.find((p) => kunciNip(p.nip) === kNip);
  if (nipSama) throw conflict(`NIP ${nip} sudah terdaftar atas nama ${nipSama.nama}.`);
}

/**
 * GET /api/petugas -> daftar petugas (sumber dropdown di wizard kertas kerja),
 * lengkap dengan rekap jumlah kertas kerja & data yang dikerjakan masing-masing.
 * Terbuka: petugas lapangan perlu menyusun timnya tanpa login.
 */
router.get(
  "/",
  wrap(async (req, res) => {
    const [list, rekap, admin] = await Promise.all([
      prisma.petugas.findMany({ orderBy: { nama: "asc" } }),
      rekapPetugas(),
      bacaAdmin(req),
    ]);
    res.json(list.map((p) => bentuk(p, rekap.get(p.id), Boolean(admin))));
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

/* ---------- akun login petugas ---------- */

/**
 * PUT /api/petugas/wajib-login  { wajib: boolean } -> { wajib }. Khusus admin.
 * Saklar gerbang login (src/auth.js gerbangMasuk). Admin tetap bisa masuk
 * apa pun nilainya, jadi menyalakannya tidak bisa mengunci aplikasi.
 */
router.put(
  "/wajib-login",
  requireAdmin,
  wrap(async (req, res) => {
    if (typeof req.body?.wajib !== "boolean") throw badRequest("Nilai wajib harus true atau false.");
    res.json({ wajib: await aturWajibLoginPetugas(req.body.wajib) });
  })
);

/** Username yang sudah dipakai (huruf kecil): semua akun petugas dan admin. */
async function usernameTerpakai() {
  const [petugas, admin] = await Promise.all([
    prisma.petugas.findMany({ where: { username: { not: null } }, select: { username: true } }),
    prisma.admin.findMany({ select: { username: true } }),
  ]);
  return new Set([...petugas, ...admin].map((a) => a.username.toLowerCase()));
}

/** Paling banyak akun per klik: bcrypt sengaja lambat, dan permintaannya tidak boleh melewati batas waktu proxy. */
const AKUN_MASSAL_MAKS = 100;

/**
 * POST /api/petugas/akun-massal -> .xlsx berisi Nama, NIP, Username, Password
 * untuk petugas yang belum punya akun. Khusus admin.
 *
 * Password hanya ada di berkas ini - yang tersimpan cuma hash-nya - jadi
 * berkasnya dikirim sebagai unduhan dan tidak boleh disimpan cache. Header
 * X-Jumlah-Akun / X-Sisa-Akun memberi tahu klien berapa yang dibuat dan berapa
 * yang masih menunggu klik berikutnya.
 */
router.post(
  "/akun-massal",
  requireAdmin,
  wrap(async (_req, res) => {
    const belum = await prisma.petugas.findMany({
      where: { passwordHash: null },
      orderBy: { nama: "asc" },
      take: AKUN_MASSAL_MAKS + 1,
    });
    if (belum.length === 0) throw conflict("Semua petugas sudah punya akun.");
    const giliran = belum.slice(0, AKUN_MASSAL_MAKS);

    const terpakai = await usernameTerpakai();
    const akun = [];
    for (const p of giliran) {
      const username = usernameUnik(usernameDariNama(p.nama), terpakai);
      const password = buatPassword();
      // Satu per satu dan bersyarat: bila admin lain membuatkan akun orang yang
      // sama pada saat bersamaan, akun itu tidak ditimpa.
      const { count } = await prisma.petugas.updateMany({
        where: { id: p.id, passwordHash: null },
        data: { username, passwordHash: await hashPassword(password), tokenVersi: { increment: 1 } },
      });
      if (count) akun.push({ p, username, password });
    }

    const sisa = await prisma.petugas.count({ where: { passwordHash: null } });
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Jumlah-Akun", String(akun.length));
    res.setHeader("X-Sisa-Akun", String(sisa));
    await kirimXlsx(res, {
      nama: namaBerkas(`akun-petugas-${new Date().toISOString().slice(0, 10)}`, "akun-petugas"),
      sheet: "Akun Petugas",
      tabel: {
        header: ["Nama", "NIP", "Username", "Password"],
        baris: akun.map(({ p, username, password }) => [
          { teks: p.nama },
          { teks: p.nip },
          { teks: username },
          { teks: password },
        ]),
      },
    });
  })
);

/**
 * PUT /api/petugas/:id/akun  { username, password? } -> buat atau ubah akun login. Khusus admin.
 *
 * Password wajib untuk akun baru; untuk akun yang sudah ada boleh dikosongkan
 * bila hanya username yang diganti. Password baru mencabut semua sesi lama
 * petugas itu (tokenVersi naik), jadi HP yang hilang ikut keluar.
 */
router.put(
  "/:id/akun",
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const username = normalUsername(req.body?.username);
    const password = String(req.body?.password || "");

    const galatU = galatUsername(username);
    if (galatU) throw badRequest(galatU);

    const p = await prisma.petugas.findUnique({ where: { id } });
    if (!p) throw notFound("Petugas tidak ditemukan.");
    if (!p.passwordHash && !password) throw badRequest("Password wajib diisi untuk akun baru.");
    if (password) {
      const galatP = galatPassword(password);
      if (galatP) throw badRequest(galatP);
    }

    const [lain, admin] = await Promise.all([
      prisma.petugas.findFirst({ where: { username, id: { not: id } }, select: { nama: true } }),
      prisma.admin.findUnique({ where: { username }, select: { id: true } }),
    ]);
    if (lain) throw conflict(`Username ${username} sudah dipakai ${lain.nama}.`);
    if (admin) throw conflict(`Username ${username} sudah dipakai akun admin.`);

    const diubah = await prisma.petugas.update({
      where: { id },
      data: {
        username,
        ...(password ? { passwordHash: await hashPassword(password), tokenVersi: { increment: 1 } } : {}),
      },
    });
    res.json(bentuk(diubah, undefined, true));
  })
);

/** DELETE /api/petugas/:id/akun -> hapus akun login (petugasnya tetap ada). Khusus admin. */
router.delete(
  "/:id/akun",
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const ada = await prisma.petugas.findUnique({ where: { id }, select: { id: true } });
    if (!ada) throw notFound("Petugas tidak ditemukan.");
    const diubah = await prisma.petugas.update({
      where: { id },
      data: { username: null, passwordHash: null, tokenVersi: { increment: 1 } },
    });
    res.json(bentuk(diubah, undefined, true));
  })
);

/**
 * POST /api/petugas/:id/keluarkan -> cabut semua sesi petugas ini (mis. HP hilang).
 * Akunnya tetap; petugas cukup login lagi di HP yang benar. Khusus admin.
 */
router.post(
  "/:id/keluarkan",
  requireAdmin,
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const ada = await prisma.petugas.findUnique({ where: { id }, select: { id: true } });
    if (!ada) throw notFound("Petugas tidak ditemukan.");
    await prisma.petugas.update({ where: { id }, data: { tokenVersi: { increment: 1 } } });
    res.json({ ok: true });
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

"use strict";

const express = require("express");
const prisma = require("../prisma");
const config = require("../config");
const { requireAdmin } = require("../auth");
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
const { includePertanyaan, bentukFormulir, bentukTim, petaJawaban } = require("../bentuk");
const { susunEkspor, barisTanpaData, baseUrlEkspor, namaBerkas, kirimCsv, kirimXlsx } = require("../ekspor");

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

/* ---------- pemuatan ---------- */

/** Kertas kerja + tim + seluruh entri beserta definisi formulir yang dipakai. */
async function muatDetail(id) {
  const kk = await prisma.kertasKerja.findUnique({
    where: { id },
    include: {
      ...includeTim,
      entri: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { jawaban: true } },
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

function bentukDetail({ kk, formulir }) {
  return {
    id: kk.id,
    nomor: kk.nomor,
    status: kk.status,
    createdAt: kk.createdAt,
    petugas: bentukTim(kk.petugas),
    formulir: formulir.map(bentukFormulir),
    entri: kk.entri.map((e) => ({
      id: e.id,
      formulirId: e.formulirId,
      berkasLengkap: e.berkasLengkap,
      catatanBerkas: e.catatanBerkas,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      jawaban: petaJawaban(e.jawaban),
    })),
  };
}

const bentukRingkas = (k, tidakLengkap) => ({
  id: k.id,
  nomor: k.nomor,
  status: k.status,
  createdAt: k.createdAt,
  petugas: bentukTim(k.petugas),
  jumlahData: k._count.entri,
  jumlahTidakLengkap: tidakLengkap.get(k.id) || 0,
});

/* ---------- daftar & penomoran ---------- */

/** Banyak baris per halaman bila klien tidak menentukan, dan batas atasnya. */
const PER_HALAMAN = 20;
const PER_HALAMAN_MAKS = 100;

const SARINGAN = new Set(["semua", "draft", "selesai", "kurang"]);

/**
 * Syarat WHERE dari kata kunci pencarian.
 *
 * Nomor kertas kerja hanya angka, jadi karakter lain dibuang lebih dulu -
 * mengetik "4" cukup untuk menemukan "00004" tanpa perlu menghitung nolnya,
 * sama seperti pencarian sebelumnya yang berjalan di sisi klien.
 */
function syaratCari(cari) {
  const q = String(cari || "").replace(/\D/g, "");
  return q ? { nomor: { contains: q } } : {};
}

/** Syarat WHERE dari saringan status / kelengkapan berkas. */
function syaratSaring(saring) {
  if (saring === "draft" || saring === "selesai") return { status: saring };
  // "Berkas tidak lengkap" bukan kolom kertas kerja, melainkan sifat entri di
  // dalamnya. EXISTS jauh lebih murah daripada menghitung seluruhnya hanya
  // untuk tahu ada-tidaknya, dan entri_berkas_lengkap_idx sudah menopangnya.
  if (saring === "kurang") return { entri: { some: { berkasLengkap: false } } };
  return {};
}

/**
 * GET /api/kertas-kerja?hal=1&per=20&cari=&saring=semua
 *   -> { baris, hal, per, total, adaLagi, jumlah: { semua, draft, selesai, kurang } }
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

    const cari = syaratCari(req.query.cari);
    const where = { ...cari, ...syaratSaring(saring) };

    const hitung = (tambahan) => prisma.kertasKerja.count({ where: { ...cari, ...tambahan } });

    const [list, total, semua, draft, selesai, kurang] = await Promise.all([
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
      hitung(syaratSaring("kurang")),
    ]);

    const tidakLengkap = await hitungTidakLengkap(list.map((k) => k.id));

    res.json({
      baris: list.map((k) => bentukRingkas(k, tidakLengkap)),
      hal,
      per,
      total,
      adaLagi: hal * per < total,
      jumlah: { semua, draft, selesai, kurang },
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

    const siap = await siapkanJawaban(formulir, req.body?.jawaban, null, req.body?.dariEpbb);
    if (Object.keys(siap.errors).length) {
      throw new ApiError(422, "Periksa kembali isian yang ditandai merah.", { errors: siap.errors });
    }

    let dilepas = [];
    const entri = await prisma.$transaction(async (tx) => {
      const e = await tx.entri.create({
        data: {
          kertasKerjaId: id,
          formulirId,
          ...bacaBerkas(req.body),
          ...bacaRekamKoordinat(req.body),
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
    const id = parseId(req.params.id);
    const ada = await prisma.kertasKerja.findUnique({ where: { id } });
    if (!ada) throw notFound("Kertas kerja tidak ditemukan.");

    const berkas = await prisma.foto.findMany({
      where: { entri: { kertasKerjaId: id } },
      select: { berkas: true },
    });
    await prisma.kertasKerja.delete({ where: { id } });
    await hapusBerkas(berkas.map((f) => f.berkas));

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

  const urutForm = new Map(formulir.map((f, i) => [f.id, i]));
  const data = kk.entri
    .filter((e) => urutForm.has(e.formulirId))
    .sort(
      (a, b) =>
        urutForm.get(a.formulirId) - urutForm.get(b.formulirId) || a.createdAt - b.createdAt || a.id - b.id
    )
    .map((e) => ({ kk, e }));

  const baseUrl = baseUrlEkspor(req);
  const tabel = susunEkspor(data, formulir, { baseUrl, timezone: config.timezone });
  if (data.length === 0) tabel.baris.push(barisTanpaData(kk));

  const satu = pilih && formulir[0];
  return {
    nama: satu ? `kertas-kerja-${kk.nomor}-${namaBerkas(satu.judul, "formulir")}` : `kertas-kerja-${kk.nomor}`,
    sheet: satu ? `${kk.nomor} ${satu.judul}` : `Kertas kerja ${kk.nomor}`,
    tabel,
  };
}

/**
 * GET /api/kertas-kerja/:id/export[?formulir=<id>] -> CSV (BOM UTF-8). Khusus admin.
 * Satu baris per data. Kolom pertanyaan dikelompokkan per formulir; sel milik
 * formulir lain dibiarkan kosong.
 */
router.get(
  "/:id/export",
  requireAdmin,
  wrap(async (req, res) => kirimCsv(res, await dataEkspor(req)))
);

/** GET /api/kertas-kerja/:id/export/xlsx[?formulir=<id>] -> Excel, isi sama dengan CSV. */
router.get(
  "/:id/export/xlsx",
  requireAdmin,
  wrap(async (req, res) => kirimXlsx(res, await dataEkspor(req)))
);

module.exports = router;

// Diekspor untuk diuji terpisah: ketiganya murni dan menentukan baris mana yang
// ikut terkirim, sementara query di atas perlu database.
module.exports.bacaPaginasi = bacaPaginasi;
module.exports.syaratCari = syaratCari;
module.exports.syaratSaring = syaratSaring;

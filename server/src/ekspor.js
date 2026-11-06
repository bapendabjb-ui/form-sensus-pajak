"use strict";

/**
 * Ekspor data ke CSV, Excel (.xlsx), dan berkas peta (GeoJSON / KML, lihat
 * src/eksporPeta.js) - per kertas kerja, per formulir, per wilayah, per
 * petugas, dan seluruh data. Semuanya lewat susunTabel, jadi data yang sama
 * tampil sama di ekspor mana pun.
 *
 * Dua susunan: satu formulir saja -> satu baris per data (susunEkspor);
 * "Semua formulir" -> satu baris per kertas kerja, kolom tiap formulir
 * berdampingan (susunEksporPerKk).
 *
 * Tiap sel berbentuk { teks, angka?, format? }: CSV memakai teks, Excel memakai
 * angka bila ada supaya bisa dijumlah dan difilter (format angkanya bawaan
 * FORMAT_RIBUAN bila tidak disebut).
 */

const { PassThrough } = require("stream");
const ExcelJS = require("exceljs");
const config = require("./config");
const { wrap } = require("./http");
const { kirimPeta } = require("./eksporPeta");
const { csvNilai, buildCsv, formatNpwp, formatWaktuID, groupNum, keteranganLokasi } = require("./format");
const { bentukTim, petaJawaban } = require("./bentuk");
const { rincianWilayah } = require("./wilayah");

const FORMAT_RIBUAN = "#,##0.##";
// Koordinat tersimpan sampai 7 desimal; FORMAT_RIBUAN akan memangkasnya jadi 2.
const FORMAT_KOORDINAT = "0.0######";
// "No. data" cukup angka polos, tanpa pemisah ribuan.
const FORMAT_POLOS = "0";

const teks = (s) => ({ teks: s === null || s === undefined ? "" : String(s) });

/**
 * Kolom per pertanyaan. NIK / NPWP dan luas tanah / bangunan dipecah jadi dua kolom
 * supaya bisa difilter (dan luasnya dijumlah) sendiri-sendiri. Lokasi dipecah jadi
 * latitude, longitude, dan keterangan asal titiknya supaya koordinatnya bisa
 * langsung diolah atau diimpor ke aplikasi peta. Wilayah dipecah per tingkat
 * (kelurahan sampai provinsi) supaya alamat di luar Banjarbaru bisa difilter.
 *
 * `persilDi` (src/persil.js pencariPersilEkspor) menambah NIB, tipe hak, dan luas
 * peta bidang BPN tempat titik Lokasi berada - luasnya bisa dibandingkan dengan
 * luas tanah isian petugas. Tanpa persil BPN tersimpan, kolom itu tidak ada.
 */
function kolomPertanyaan(formulir, baseUrl, persilDi = null) {
  return formulir.flatMap((f) =>
    f.pertanyaan.flatMap((q) => {
      const judul = `${f.judul} - ${q.label || "(tanpa judul)"}`;

      if (q.tipe === "niknpwp") {
        const bagian = (j) => (j[q.id] && typeof j[q.id] === "object" ? j[q.id] : {});
        return [
          { f, judul: `${judul} (NIK)`, sel: (j) => teks(bagian(j).nik) },
          { f, judul: `${judul} (NPWP)`, sel: (j) => teks(formatNpwp(bagian(j).npwp)) },
        ];
      }

      if (q.tipe === "lokasi") {
        const titik = (j) => {
          const v = j[q.id];
          return v && typeof v === "object" && v.lat !== null && v.lat !== undefined ? v : null;
        };
        const koordinat = (k) => (j) => {
          const v = titik(j);
          const n = v ? Number(v[k]) : NaN;
          return Number.isFinite(n) ? { teks: String(v[k]), angka: n, format: FORMAT_KOORDINAT } : teks("");
        };
        const kolom = [
          // `koordinat` menandai kolom titik untuk ekspor peta (lihat pasanganTitik).
          { f, judul: `${judul} (Latitude)`, koordinat: "lat", sel: koordinat("lat") },
          { f, judul: `${judul} (Longitude)`, koordinat: "lon", sel: koordinat("lon") },
          { f, judul: `${judul} (Keterangan)`, sel: (j) => teks(titik(j) && keteranganLokasi(titik(j))) },
        ];
        if (persilDi) {
          const bidang = (j) => {
            const v = titik(j);
            return v && Number.isFinite(v.lat) && Number.isFinite(v.lon) ? persilDi(v.lat, v.lon) : null;
          };
          kolom.push(
            { f, judul: `${judul} (NIB BPN)`, sel: (j) => teks(bidang(j)?.nibLengkap) },
            { f, judul: `${judul} (Tipe hak BPN)`, sel: (j) => teks(bidang(j)?.tipeHak) },
            {
              f,
              judul: `${judul} (Luas peta BPN m²)`,
              sel: (j) => {
                const n = bidang(j)?.luasPeta;
                return Number.isFinite(n) ? { ...teks(groupNum(n)), angka: n } : teks("");
              },
            }
          );
        }
        return kolom;
      }

      if (q.tipe === "wilayah") {
        const tingkat = (k) => (j) => teks(rincianWilayah(j[q.id])[k]);
        return [
          { f, judul: `${judul} (Kelurahan/Desa)`, sel: tingkat("kelurahan") },
          { f, judul: `${judul} (Kecamatan)`, sel: tingkat("kecamatan") },
          { f, judul: `${judul} (Kabupaten/Kota)`, sel: tingkat("kabupaten") },
          { f, judul: `${judul} (Provinsi)`, sel: tingkat("provinsi") },
        ];
      }

      if (q.tipe === "luas") {
        const luas = (k) => (j) => {
          const n = j[q.id] && typeof j[q.id] === "object" ? j[q.id][k] : null;
          return n === null || n === undefined || !Number.isFinite(Number(n))
            ? teks("")
            : { ...teks(groupNum(n)), angka: Number(n) };
        };
        return [
          { f, judul: `${judul} (Tanah m²)`, sel: luas("tanah") },
          { f, judul: `${judul} (Bangunan m²)`, sel: luas("bangunan") },
        ];
      }

      const sel = (j) => {
        const hasil = teks(csvNilai(q.tipe, j[q.id], { baseUrl }));
        if (q.tipe === "number" && hasil.teks !== "") {
          const n = Number(j[q.id]);
          if (Number.isFinite(n)) hasil.angka = n;
        }
        return hasil;
      };
      return [{ f, judul, sel }];
    })
  );
}

/**
 * Letak kolom Lokasi di tabel: [[indeks latitude, indeks longitude], ...], urut
 * kolom. Longitude selalu tepat sesudah latitude (lihat kolomPertanyaan).
 *
 * @param {object[]} kolom  kolom pertanyaan, urut
 * @param {number} awal     indeks kolom pertama `kolom` di tabel
 */
const pasanganTitik = (kolom, awal) =>
  kolom.flatMap((k, i) => (k.koordinat === "lat" ? [[awal + i, awal + i + 1]] : []));

/** Kolom identitas kertas kerja: nomor, status, tim petugas. */
function kolomKertasKerja(kk) {
  const tim = bentukTim(kk.petugas);
  return [
    teks(kk.nomor),
    teks(kk.status === "selesai" ? "Selesai" : "Draft"),
    teks(tim.map((p) => p.nama).join("; ")),
    teks(tim.map((p) => p.nip || "-").join("; ")),
  ];
}

/**
 * "No. data": urutan data di dalam kertas kerja & formulirnya, dari data yang
 * SUDAH terurut -> Map(entri -> nomor).
 */
function nomoriData(data) {
  const hitung = new Map();
  const nomor = new Map();
  for (const { kk, e } of data) {
    const kunci = `${kk.id}:${e.formulirId}`;
    const ke = (hitung.get(kunci) || 0) + 1;
    hitung.set(kunci, ke);
    nomor.set(e, ke);
  }
  return nomor;
}

/**
 * Susun tabel ekspor.
 *
 * @param {{ kk: object, e: object }[]} data  entri (+ jawaban) beserta kertas kerjanya
 *        (+ petugas), SUDAH terurut sesuai keinginan pemanggil
 * @param {object[]} formulir  formulir (+ pertanyaan) yang kolomnya ditampilkan, urut
 * @param {Map} [nomorData]  "No. data" tiap entri (lihat susunTabel); bawaan dihitung dari `data`
 * @returns {{ header: string[], baris: object[][], titik: number[][] }}  `titik`: lihat pasanganTitik
 */
function susunEkspor(data, formulir, { baseUrl, timezone, nomorData = nomoriData(data), persilDi = null }) {
  const kolom = kolomPertanyaan(formulir, baseUrl, persilDi);
  const header = [
    "Nomor",
    "Status",
    "Petugas",
    "NIP",
    "Formulir",
    "No. data",
    "Waktu input",
    "Diisi oleh",
    "Kelengkapan berkas",
    "Catatan kekurangan berkas",
    ...kolom.map((k) => k.judul),
  ];
  const titik = pasanganTitik(kolom, header.length - kolom.length);
  const judulForm = new Map(formulir.map((f) => [f.id, f.judul]));

  const identitasKk = new Map();
  const baris = data.map(({ kk, e }) => {
    const ke = nomorData.get(e);
    if (!identitasKk.has(kk.id)) identitasKk.set(kk.id, kolomKertasKerja(kk));

    const jawaban = petaJawaban(e.jawaban);
    return [
      ...identitasKk.get(kk.id),
      teks(judulForm.get(e.formulirId)),
      { teks: String(ke), angka: ke, format: FORMAT_POLOS },
      teks(formatWaktuID(e.createdAt, timezone)),
      teks(e.dibuatOleh),
      teks(e.berkasLengkap === false ? "Tidak lengkap" : "Lengkap"),
      teks(e.catatanBerkas),
      ...kolom.map((k) => (k.f.id === e.formulirId ? k.sel(jawaban) : teks(""))),
    ];
  });

  return { header, baris, titik };
}

/**
 * Susun tabel ekspor SATU BARIS PER KERTAS KERJA - untuk ekspor "Semua
 * formulir". Data tiap formulir di kertas kerja yang sama berdampingan dalam
 * satu baris, bukan bertangga di baris-baris terpisah yang separuhnya kosong.
 * Tiap formulir mendapat satu blok kolom: pertanyaannya, lalu kelengkapan
 * berkas, catatan, waktu input, dan pengisinya.
 *
 * Kertas kerja yang punya lebih dari satu data untuk formulir yang sama
 * mendapat baris sebanyak data terbanyaknya: data ke-n masuk baris ke-n.
 * Formulir yang datanya hanya satu (mis. Identitas Wajib Pajak) diulang di
 * setiap baris supaya tiap baris tetap lengkap saat disaring di Excel.
 *
 * @param {{ kk: object, e: object }[]} data  seperti susunEkspor, SUDAH terurut
 *        (data satu kertas kerja berurutan, tiap formulir urut waktu input)
 * @param {object[]} formulir  formulir (+ pertanyaan) yang kolomnya ditampilkan, urut
 * @returns {{ header: string[], baris: object[][], titik: number[][] }}
 */
function susunEksporPerKk(data, formulir, { baseUrl, timezone, persilDi = null }) {
  const blok = formulir.map((f) => ({
    f,
    kolom: [
      ...kolomPertanyaan([f], baseUrl, persilDi).map((k) => ({
        judul: k.judul,
        koordinat: k.koordinat,
        sel: (_e, j) => k.sel(j),
      })),
      {
        judul: `${f.judul} - Kelengkapan berkas`,
        sel: (e) => teks(e.berkasLengkap === false ? "Tidak lengkap" : "Lengkap"),
      },
      { judul: `${f.judul} - Catatan kekurangan berkas`, sel: (e) => teks(e.catatanBerkas) },
      { judul: `${f.judul} - Waktu input`, sel: (e) => teks(formatWaktuID(e.createdAt, timezone)) },
      { judul: `${f.judul} - Diisi oleh`, sel: (e) => teks(e.dibuatOleh) },
    ],
  }));
  const kolomForm = blok.flatMap((b) => b.kolom);
  const header = ["Nomor", "Status", "Petugas", "NIP", ...kolomForm.map((k) => k.judul)];
  const titik = pasanganTitik(kolomForm, header.length - kolomForm.length);

  // Kelompokkan per kertas kerja; urutan kemunculan pertama dipertahankan.
  const perKk = new Map();
  for (const { kk, e } of data) {
    if (!perKk.has(kk.id)) perKk.set(kk.id, { kk, perForm: new Map() });
    const perForm = perKk.get(kk.id).perForm;
    if (!perForm.has(e.formulirId)) perForm.set(e.formulirId, []);
    perForm.get(e.formulirId).push({ e, j: petaJawaban(e.jawaban) });
  }

  const baris = [];
  for (const { kk, perForm } of perKk.values()) {
    const identitas = kolomKertasKerja(kk);
    const banyak = Math.max(1, ...[...perForm.values()].map((d) => d.length));
    for (let i = 0; i < banyak; i++) {
      const sel = blok.flatMap(({ f, kolom }) => {
        const d = perForm.get(f.id) || [];
        const isi = d.length === 1 ? d[0] : d[i];
        return kolom.map((k) => (isi ? k.sel(isi.e, isi.j) : teks("")));
      });
      baris.push([...identitas, ...sel]);
    }
  }
  return { header, baris, titik };
}

/**
 * Susun tabel ekspor dari data dengan urutan apa pun - pintu masuk SEMUA
 * jenis ekspor, supaya urutan, "No. data", dan isi barisnya sama di mana pun
 * data itu diunduh.
 *
 * Urutan: nomor kertas kerja, urutan formulir di bank, waktu input, lalu id.
 *
 * @param {{ kk: object, e: object }[]} data  entri (+ jawaban) beserta kertas kerjanya
 *        (+ petugas); entri dari formulir yang tidak ada di `formulir` diabaikan
 * @param {object[]} formulir  formulir (+ pertanyaan), urut bank formulir
 * @param {object} o
 * @param {boolean} o.perData  true = satu baris per data (ekspor satu formulir);
 *        false = satu baris per kertas kerja (ekspor "Semua formulir")
 * @param {(e: object) => boolean} [o.ikut]  saringan data (ekspor wilayah). "No.
 *        data" dihitung SEBELUM disaring, jadi berikan seluruh data kertas
 *        kerjanya: data ke-2 sebuah kertas kerja tetap bernomor 2 walau data
 *        ke-1 berada di kelurahan lain.
 * @param {Function} [o.persilDi]  pencari bidang BPN di titik Lokasi (src/persil.js
 *        pencariPersilEkspor); null = tanpa kolom BPN
 */
function susunTabel(data, formulir, { perData, ikut, baseUrl, timezone, persilDi = null }) {
  const urutForm = new Map(formulir.map((f, i) => [f.id, i]));
  const urut = data
    .filter(({ e }) => urutForm.has(e.formulirId))
    .sort(
      (a, b) =>
        a.kk.nomor.localeCompare(b.kk.nomor) ||
        urutForm.get(a.e.formulirId) - urutForm.get(b.e.formulirId) ||
        a.e.createdAt - b.e.createdAt ||
        a.e.id - b.e.id
    );
  const nomorData = nomoriData(urut);
  const pakai = ikut ? urut.filter(({ e }) => ikut(e)) : urut;
  return perData
    ? susunEkspor(pakai, formulir, { baseUrl, timezone, nomorData, persilDi })
    : susunEksporPerKk(pakai, formulir, { baseUrl, timezone, persilDi });
}

/**
 * Alamat dasar untuk tautan foto di berkas ekspor.
 *
 * APP_URL dipakai bila diisi; kalau tidak, disusun dari permintaan. Header Host
 * datang dari klien dan bisa dipalsukan, sehingga tautan foto di berkas ekspor
 * bisa menunjuk ke alamat orang lain - memasang APP_URL di produksi menutup itu.
 */
function baseUrlEkspor(req) {
  return config.appUrl || `${req.protocol}://${req.get("host")}`;
}

/** Baris pengganti untuk kertas kerja yang belum punya data. */
const barisTanpaData = (kk) => kolomKertasKerja(kk);

/** Judul -> potongan nama berkas yang aman: "Identitas Wajib Pajak" -> "identitas-wajib-pajak". */
function namaBerkas(s, cadangan = "data") {
  const bersih = String(s || "")
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 50);
  return bersih || cadangan;
}

/** CSV dengan BOM UTF-8. */
function keCsv({ header, baris }) {
  return buildCsv([header, ...baris.map((r) => r.map((c) => c.teks))]);
}

/** Baris Excel yang ditulis sebelum memberi giliran ke proses lain (dan ke pemampat zip). */
const XLSX_PER_GILIRAN = 500;

/**
 * Buffer .xlsx: judul kolom tebal & dibekukan, filter otomatis, lebar kolom
 * menyesuaikan isi.
 *
 * Ditulis baris demi baris (WorkbookWriter). Workbook biasa menampung setiap
 * sel sebagai objek: ekspor seluruh data (ribuan baris x ratusan kolom)
 * memakan lebih dari 1 GB, melewati batas restart PM2 di server.
 */
async function keXlsx({ header, baris }, namaSheet) {
  const keluar = new PassThrough();
  const potongan = [];
  keluar.on("data", (b) => potongan.push(b));
  const habis = new Promise((resolve, reject) => {
    keluar.on("end", resolve);
    keluar.on("error", reject);
  });

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: keluar,
    useStyles: true,
    // Teks lewat tabel bersama, sama dengan workbook biasa; tanpa ini teks
    // ditulis sebagai hasil rumus (t="str").
    useSharedStrings: true,
    creator: "Sensus Pajak",
    created: new Date(),
  });

  // Nama sheet Excel: maks. 31 karakter, tanpa \ / ? * [ ] :
  const sheet = String(namaSheet || "Data").replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Data";
  const ws = wb.addWorksheet(sheet, {
    views: [{ state: "frozen", ySplit: 1 }],
    autoFilter: { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } },
  });

  // Lebar kolom harus ditetapkan sebelum baris pertama ditulis.
  ws.columns = header.map((h, i) => {
    let terpanjang = 0;
    for (const r of baris) terpanjang = Math.max(terpanjang, (r[i]?.teks || "").length);
    return { width: Math.min(Math.max(Math.min(h.length, 30), terpanjang, 8) + 2, 60) };
  });

  const kepala = ws.addRow(header);
  kepala.font = { bold: true };
  kepala.alignment = { vertical: "middle", wrapText: true };
  kepala.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2F1EF" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFB7C4CC" } } };
  });
  kepala.commit();

  for (let n = 0; n < baris.length; n++) {
    const r = baris[n];
    const row = ws.addRow(r.map((c) => (c.angka !== undefined ? c.angka : c.teks)));
    r.forEach((c, i) => {
      // Hanya sel berangka yang diberi format. NIK, NPWP, NOP tetap teks
      // sehingga Excel tidak mengubahnya jadi 3,17E+15.
      if (c.angka !== undefined) row.getCell(i + 1).numFmt = c.format || FORMAT_RIBUAN;
    });
    row.commit();
    if ((n + 1) % XLSX_PER_GILIRAN === 0) await new Promise(setImmediate);
  }

  await wb.commit();
  await habis;
  return Buffer.concat(potongan);
}

/** Kirim tabel sebagai unduhan CSV. */
function kirimCsv(res, { nama, tabel }) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nama}.csv"`);
  res.send(keCsv(tabel));
}

/** Kirim tabel sebagai unduhan Excel. */
async function kirimXlsx(res, { nama, sheet, tabel }) {
  const buffer = await keXlsx(tabel, sheet);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nama}.xlsx"`);
  res.send(Buffer.from(buffer));
}

/** Akhiran jalur -> pengirim berkas. CSV tetap di jalur dasarnya, seperti sejak awal. */
const PENGIRIM = {
  "": kirimCsv,
  "/xlsx": kirimXlsx,
  "/geojson": (res, berkas) => kirimPeta(res, berkas, "geojson"),
  "/kml": (res, berkas) => kirimPeta(res, berkas, "kml"),
};

/**
 * Pasang keempat unduhan sebuah ekspor di router: `jalur` (CSV), `jalur/xlsx`,
 * `jalur/geojson`, dan `jalur/kml`. Isi keempatnya tabel yang sama dari
 * `susun(req)` -> { nama, sheet, tabel }.
 *
 * @param {Function} penjaga  middleware izin, mis. requireAdmin
 */
function rutekanEkspor(router, jalur, penjaga, susun) {
  for (const [akhiran, kirim] of Object.entries(PENGIRIM)) {
    router.get(
      jalur + akhiran,
      penjaga,
      wrap(async (req, res) => kirim(res, await susun(req)))
    );
  }
}

module.exports = {
  susunTabel,
  susunEkspor,
  susunEksporPerKk,
  barisTanpaData,
  baseUrlEkspor,
  namaBerkas,
  keCsv,
  keXlsx,
  kirimCsv,
  kirimXlsx,
  rutekanEkspor,
};

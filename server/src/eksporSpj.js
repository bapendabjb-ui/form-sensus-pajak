"use strict";

/**
 * Laporan SPJ - aturan susunannya, murni tanpa database (query-nya di
 * routes/ekspor.js).
 *
 * Satu baris per kertas kerja yang sudah berisi data: Tanggal Sensus, Nomor
 * Kertas Kerja, Status, Nama Petugas 1..n (satu kolom per anggota tim,
 * penanggung jawab dulu), Kecamatan, Kelurahan, RW, RT. Kertas kerja yang
 * belum berisi data tidak punya baris: belum ada pendataan yang bisa
 * dipertanggungjawabkan.
 *
 * Dua susunan dengan kolom yang sama:
 *   - mentah     : semua kertas kerja berisi data, urut nomor kertas kerja;
 *   - per wilayah: urut kecamatan > kelurahan > RW > RT (lalu tanggal dan
 *                  nomor), bisa dipersempit ke satu kecamatan / kelurahan /
 *                  RW / RT. Tanpa pilihan kecamatan, kertas kerja yang belum
 *                  punya wilayah objek ditaruh di akhir dengan kolom kosong.
 *
 * Tanggal Sensus = tanggal data pertama kertas kerja itu disimpan, di zona
 * waktu aplikasi. Wilayah dan RT/RW = jawaban pertanyaan wilayah / RT-RW
 * OBJEK pajak (pertanyaanObjek, sama dengan ekspor per wilayah) dari data
 * pertama yang mengisinya. Satu kertas kerja = satu objek; bila ternyata
 * berisi objek di beberapa RT, yang dipakai data pertama, supaya jumlah baris
 * tetap sama dengan jumlah kertas kerja.
 */

const { bentukTim } = require("./bentuk");
const { rincianWilayah } = require("./wilayah");
const { bacaPilihanWilayah, cocokWilayah } = require("./eksporWilayah");

const FORMAT_TANGGAL = "dd/mm/yyyy";

const teks = (s) => ({ teks: s === null || s === undefined ? "" : String(s) });

/** "1" / "01" / "001" -> "001"; isian lain apa adanya (dirapikan), kosong -> "". */
function nomorRtRw(s) {
  const t = String(s ?? "").trim();
  return /^\d{1,3}$/.test(t) ? t.padStart(3, "0") : t;
}

const wilayahTerisi = (v) => !!v && typeof v === "object" && rincianWilayah(v).kecamatan.trim() !== "";
const rtRwTerisi = (v) => !!v && typeof v === "object" && (nomorRtRw(v.rt) !== "" || nomorRtRw(v.rw) !== "");

/**
 * ?kecamatan=&kelurahan=&rw=&rt= -> pilihan laporan per wilayah. Semuanya
 * boleh kosong (= semua), tetapi bertingkat: kelurahan butuh kecamatan, RW
 * butuh kelurahan, RT butuh RW. Null bila tidak sah.
 *
 * @returns {{ kecamatan: object|null, kelurahan: object|null, rw: string, rt: string } | null}
 */
function bacaPilihanSpj(query = {}) {
  const ambil = (k) => String(query[k] ?? "").trim();
  const [kec, kel, rw, rt] = ["kecamatan", "kelurahan", "rw", "rt"].map(ambil);
  if ((kel && !kec) || (rw && !kel) || (rt && !rw)) return null;
  if ([rw, rt].some((n) => n && !/^\d{1,3}$/.test(n))) return null;

  const wilayah = kec ? bacaPilihanWilayah({ kecamatan: kec, kelurahan: kel }) : null;
  if (kec && !wilayah) return null;
  return {
    kecamatan: wilayah?.kecamatan || null,
    kelurahan: wilayah?.kelurahan || null,
    rw: nomorRtRw(rw),
    rt: nomorRtRw(rt),
  };
}

/**
 * Baris laporan, satu per kertas kerja (urutan belum diatur - lihat urutSpj).
 *
 * @param {object} o
 * @param {{ id, nomor, status, petugas }[]} o.kertasKerja  kertas kerja berisi data,
 *        `petugas` = baris kertas_kerja_petugas beserta relasi petugasnya
 * @param {Map<number, Date>} o.mulai  kertas kerja -> waktu data pertamanya disimpan
 * @param {{ kertasKerjaId, entriId, tipe, nilai, waktu, urutan }[]} o.jawaban
 *        jawaban pertanyaan wilayah & RT-RW objek; `waktu` = waktu simpan datanya,
 *        `urutan` = urutan pertanyaan di formulirnya
 * @returns {{ kk, tanggal: Date|null, petugas: string[], wilayah: object|null,
 *             kecamatan: string, kelurahan: string, rw: string, rt: string }[]}
 */
function susunBarisSpj({ kertasKerja, mulai, jawaban }) {
  const urut = jawaban
    .slice()
    .sort((a, b) => a.waktu - b.waktu || a.entriId - b.entriId || a.urutan - b.urutan);

  const perKk = new Map(); // kk -> { wilayah: [], rtrw: [] }
  for (const j of urut) {
    const isian = j.tipe === "wilayah" ? wilayahTerisi(j.nilai) : j.tipe === "rtrw" && rtRwTerisi(j.nilai);
    if (!isian) continue;
    if (!perKk.has(j.kertasKerjaId)) perKk.set(j.kertasKerjaId, { wilayah: [], rtrw: [] });
    perKk.get(j.kertasKerjaId)[j.tipe].push(j);
  }

  return kertasKerja.map((kk) => {
    const letak = perKk.get(kk.id) || { wilayah: [], rtrw: [] };
    const wil = letak.wilayah[0] || null;
    // RT/RW dari data yang sama dengan wilayahnya bila ada, supaya keduanya menunjuk objek yang sama.
    const rtrw = (wil && letak.rtrw.find((r) => r.entriId === wil.entriId)) || letak.rtrw[0] || null;
    const rinci = rincianWilayah(wil?.nilai);
    return {
      kk,
      tanggal: mulai.get(kk.id) || null,
      petugas: bentukTim(kk.petugas).map((p) => p.nama),
      wilayah: wil?.nilai || null,
      kecamatan: rinci.kecamatan,
      kelurahan: rinci.kelurahan,
      rw: nomorRtRw(rtrw?.nilai?.rw),
      rt: nomorRtRw(rtrw?.nilai?.rt),
    };
  });
}

/** Baris yang berada di wilayah terpilih (bacaPilihanSpj). Tanpa kecamatan = semua baris. */
function saringSpj(baris, pilihan) {
  if (!pilihan?.kecamatan) return baris;
  const { kecamatan, kelurahan, rw, rt } = pilihan;
  return baris.filter(
    (b) => cocokWilayah(b.wilayah, { kecamatan, kelurahan }) && (!rw || b.rw === rw) && (!rt || b.rt === rt)
  );
}

const banding = new Intl.Collator("id", { numeric: true, sensitivity: "base" }).compare;

/** Kosong selalu di belakang. */
const bandingIsi = (a, b) => (!a || !b ? Boolean(b) - Boolean(a) : banding(a, b));

/**
 * Urutkan baris: `perWilayah` = kecamatan > kelurahan > RW > RT > tanggal >
 * nomor (yang belum berwilayah / ber-RT di belakang); selain itu nomor saja.
 */
function urutSpj(baris, perWilayah) {
  const nomor = (a, b) => a.kk.nomor.localeCompare(b.kk.nomor);
  if (!perWilayah) return baris.slice().sort(nomor);
  return baris
    .slice()
    .sort(
      (a, b) =>
        bandingIsi(a.kecamatan, b.kecamatan) ||
        bandingIsi(a.kelurahan, b.kelurahan) ||
        bandingIsi(a.rw, b.rw) ||
        bandingIsi(a.rt, b.rt) ||
        (a.tanggal?.getTime() ?? Infinity) - (b.tanggal?.getTime() ?? Infinity) ||
        nomor(a, b)
    );
}

const pemecahTanggal = new Map(); // zona waktu -> Intl.DateTimeFormat

/** Tanggal kalender `d` di zona waktu `timeZone`: { tahun, bulan, hari }. */
function tanggalDi(d, timeZone) {
  let f = pemecahTanggal.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    pemecahTanggal.set(timeZone, f);
  }
  const bagian = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  return { tahun: Number(bagian.year), bulan: Number(bagian.month), hari: Number(bagian.day) };
}

/**
 * Sel tanggal: teks "17/11/2026" untuk CSV, dan nomor seri tanggal Excel
 * supaya kolomnya bisa diurutkan dan difilter per tahun / bulan / hari.
 */
function selTanggal(d, timeZone) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return teks("");
  const { tahun, bulan, hari } = tanggalDi(d, timeZone);
  const dua = (n) => String(n).padStart(2, "0");
  // Nomor seri Excel: hari sejak 30 Desember 1899.
  const seri = (Date.UTC(tahun, bulan - 1, hari) - Date.UTC(1899, 11, 30)) / 86400000;
  return { teks: `${dua(hari)}/${dua(bulan)}/${tahun}`, angka: seri, format: FORMAT_TANGGAL };
}

/**
 * Tabel laporan dari baris yang SUDAH tersaring dan terurut. Kolom petugas
 * sebanyak tim terbesar di laporan itu (minimal satu); anggota tim yang lebih
 * kecil menyisakan sel kosong.
 *
 * @returns {{ header: string[], baris: object[][], titik: [] }}  bentuk yang sama
 *          dengan tabel ekspor lain (src/ekspor.js), jadi penulis CSV / Excel-nya dipakai ulang
 */
function tabelSpj(baris, { timezone }) {
  const kolomPetugas = Math.max(1, ...baris.map((b) => b.petugas.length));
  const header = [
    "Tanggal Sensus",
    "Nomor Kertas Kerja",
    "Status",
    ...Array.from({ length: kolomPetugas }, (_, i) => `Nama Petugas ${i + 1}`),
    "Kecamatan",
    "Kelurahan",
    "RW",
    "RT",
  ];
  return {
    header,
    baris: baris.map((b) => [
      selTanggal(b.tanggal, timezone),
      teks(b.kk.nomor),
      teks(b.kk.status === "selesai" ? "Selesai" : "Draft"),
      ...Array.from({ length: kolomPetugas }, (_, i) => teks(b.petugas[i])),
      teks(b.kecamatan),
      teks(b.kelurahan),
      teks(b.rw),
      teks(b.rt),
    ]),
    titik: [],
  };
}

/**
 * Ringkasan untuk layar ekspor sebelum mengunduh laporan per wilayah.
 *
 *   kertasKerja : baris yang akan ikut dengan pilihan ini
 *   tanpaWilayah: kertas kerja berisi data yang belum punya kecamatan objek
 *   rw          : pilihan RW di kelurahan terpilih [{ nilai, jumlah }]
 *   rt          : pilihan RT di RW terpilih [{ nilai, jumlah }]
 *   tanpaRtRw   : baris di kelurahan terpilih yang RW-nya kosong
 */
function ringkasSpj(baris, pilihan) {
  const hitung = (daftar, kunci) => {
    const n = new Map();
    for (const b of daftar) if (b[kunci]) n.set(b[kunci], (n.get(b[kunci]) || 0) + 1);
    return [...n].sort(([a], [b]) => banding(a, b)).map(([nilai, jumlah]) => ({ nilai, jumlah }));
  };
  const diKelurahan = pilihan?.kelurahan ? saringSpj(baris, { ...pilihan, rw: "", rt: "" }) : [];
  const diRw = pilihan?.rw ? diKelurahan.filter((b) => b.rw === pilihan.rw) : [];
  return {
    kertasKerja: saringSpj(baris, pilihan).length,
    tanpaWilayah: baris.filter((b) => !b.kecamatan).length,
    rw: hitung(diKelurahan, "rw"),
    rt: hitung(diRw, "rt"),
    tanpaRtRw: diKelurahan.filter((b) => !b.rw).length,
  };
}

module.exports = { nomorRtRw, bacaPilihanSpj, susunBarisSpj, saringSpj, urutSpj, tabelSpj, ringkasSpj };

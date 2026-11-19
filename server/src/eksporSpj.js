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
 *
 * Kertas kerja tanpa isian wilayah objek (mis. PBJT, yang formulirnya tidak
 * menanyakan letak objek) mendapat kecamatan & kelurahan dari peta BPN di
 * titik koordinatnya (titikPeta, lalu lengkapiDariPeta). RT/RW tidak ada di
 * peta BPN, jadi tetap dari isian - atau diperkirakan (perkiraRtRw).
 *
 * Perkiraan RT/RW (hanya bila SPJ_PERKIRAAN_RTRW=1): petugas turun ke
 * lapangan per hari dan biasanya bertahan di satu lingkungan, jadi kertas
 * kerja tanpa RT/RW mengambil RT/RW kertas kerja lain dengan tanggal sensus
 * sama, tim yang beririsan, dan kelurahan sama. Hasilnya ditandai di kolom
 * Sumber RT/RW. Ketepatannya diuji dengan server/scripts/uji-perkiraan-rtrw.js.
 */

const { bentukTim } = require("./bentuk");
const { rincianWilayah, normalWilayah } = require("./wilayah");
const { bacaPilihanWilayah, cocokWilayah } = require("./eksporWilayah");
const { adaTitik, nilaiTitik, titikGps, jarakMeter } = require("./cekLokasi");

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
 *             kecamatan: string, kelurahan: string, rw: string, rt: string,
 *             sumberWilayah: "isian" | "", sumberRtRw: "isian" | "", rtRwDari: null }[]}
 *          sumberWilayah "peta" diisi lengkapiDariPeta, sumberRtRw "perkiraan" diisi perkiraRtRw
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
    const rw = nomorRtRw(rtrw?.nilai?.rw);
    const rt = nomorRtRw(rtrw?.nilai?.rt);
    return {
      kk,
      tanggal: mulai.get(kk.id) || null,
      petugas: bentukTim(kk.petugas).map((p) => p.nama),
      wilayah: wil?.nilai || null,
      kecamatan: rinci.kecamatan,
      kelurahan: rinci.kelurahan,
      rw,
      rt,
      sumberWilayah: wil ? "isian" : "",
      sumberRtRw: rw || rt ? "isian" : "",
      rtRwDari: null,
    };
  });
}

/** Titik yang layak dipetakan: bukan di kantor, akurasinya tidak kasar (cekLokasi.nilaiTitik). */
const titikLayak = (t) => nilaiTitik(t) === "baik";

/**
 * Titik untuk mencari wilayah di peta BPN, per kertas kerja. Urutan pilihan:
 *   1. koordinat objek (jawaban pertanyaan Lokasi) dari data pertama yang
 *      mengisinya - titik yang ditunjuk di peta / dari bidang NIB / sudah
 *      dicek admin selalu layak;
 *   2. GPS perangkat saat data pertama disimpan (entri.rekam_*).
 * Titik yang terekam di kantor atau akurasinya kasar (> AKURASI_KASAR_M)
 * dilewati: kelurahannya bisa salah.
 *
 * @param {{ id, kertasKerjaId, createdAt, rekamLat, rekamLon, rekamAkurasi,
 *           koordinatDicekAt, jawaban?: { nilai }[] }[]} entri  `jawaban` = jawaban pertanyaan Lokasi saja
 * @returns {Map<number, { lat: number, lon: number, sumber: "objek" | "gps" }>}
 */
function titikPeta(entri) {
  const urut = entri.slice().sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  const hasil = new Map();
  const simpan = (e, t, sumber) => {
    if (!hasil.has(e.kertasKerjaId)) hasil.set(e.kertasKerjaId, { lat: t.lat, lon: t.lon, sumber });
  };
  for (const e of urut) {
    for (const j of e.jawaban || []) {
      const v = j.nilai;
      if (!adaTitik(v)) continue;
      const manual = v.sumber === "peta" || v.sumber === "bidang" || Boolean(e.koordinatDicekAt);
      if (titikLayak({ ...v, manual })) simpan(e, v, "objek");
    }
  }
  for (const e of urut) {
    const t = titikGps(e);
    if (t && titikLayak(t)) simpan(e, t, "gps");
  }
  return hasil;
}

/**
 * Isi kecamatan & kelurahan baris yang belum punya isian wilayah objek dari
 * peta BPN. Namanya dicocokkan ke daftar Banjarbaru (kode SISMIOP) supaya
 * saringan per wilayah berlaku sama dengan isian petugas. Mengubah `baris`.
 *
 * @param {Map<number, { lat, lon }>} titik  hasil titikPeta
 * @param {(lat: number, lon: number) => { kecamatan, kelurahan } | null} cari  persil.pencariWilayahPersil
 */
function lengkapiDariPeta(baris, titik, cari) {
  for (const b of baris) {
    if (b.sumberWilayah) continue;
    const t = titik.get(b.kk.id);
    const bpn = t && cari(t.lat, t.lon);
    if (!bpn) continue;
    const w = normalWilayah({ kecamatan: bpn.kecamatan, kelurahan: bpn.kelurahan });
    if (!w.kode_kecamatan) continue;
    b.wilayah = w;
    b.kecamatan = w.kecamatan;
    b.kelurahan = w.kelurahan;
    b.sumberWilayah = "peta";
  }
  return baris;
}

/* ---------- perkiraan RT/RW dari kertas kerja sehari ---------- */

/** Jarak terjauh ke kertas kerja acuan agar RT-nya ikut dipakai. */
const JARAK_RT_M = 300;
/** Tanpa titik koordinat: selisih waktu terjauh agar RT acuan ikut dipakai. */
const SELISIH_RT_MENIT = 60;

const kunciKelurahan = (b) =>
  b.kecamatan && b.kelurahan ? `${b.kecamatan}|${b.kelurahan}`.toLowerCase().replace(/\s+/g, " ").trim() : "";

const idTim = (b) => new Set((b.kk.petugas || []).map((r) => r.petugas?.id ?? r.petugasId).filter(Boolean));

function kunciTanggal(d, timeZone) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const { tahun, bulan, hari } = tanggalDi(d, timeZone);
  return `${tahun}-${bulan}-${hari}`;
}

/**
 * Pengindeks kandidat acuan: kertas kerja yang RW-nya dari isian petugas,
 * dikelompokkan per tanggal sensus + kelurahan. Kandidat untuk satu baris =
 * kelompoknya, tanpa baris itu sendiri, yang timnya beririsan (ada petugas
 * yang sama).
 *
 * @returns {(target) => object[]}
 */
function pengindeksKandidat(baris, timeZone) {
  const kunci = (b) => {
    const kel = kunciKelurahan(b);
    const tgl = kunciTanggal(b.tanggal, timeZone);
    return kel && tgl ? `${tgl}#${kel}` : "";
  };
  const tim = new Map(baris.map((b) => [b, idTim(b)]));
  const kelompok = new Map();
  for (const b of baris) {
    const k = kunci(b);
    if (!k || b.sumberRtRw !== "isian" || !b.rw) continue;
    if (!kelompok.has(k)) kelompok.set(k, []);
    kelompok.get(k).push(b);
  }
  return (target) => {
    const timTarget = tim.get(target) || idTim(target);
    return (kelompok.get(kunci(target)) || []).filter(
      (b) => b !== target && [...tim.get(b)].some((id) => timTarget.has(id))
    );
  };
}

/**
 * Tebak RT/RW `target` dari `kandidat` (hasil pengindeksKandidat):
 *   "sepakat"   : semua kandidat menunjuk RW & RT yang sama;
 *   "terdekat"  : kandidat terdekat cukup dekat - titik koordinat <=
 *                 JARAK_RT_M, atau bila tanpa titik, jam simpan data pertamanya
 *                 <= SELISIH_RT_MENIT;
 *   "rw-sepakat": RT kandidat berbeda-beda dan tidak ada yang cukup dekat,
 *                 tetapi RW-nya sama semua -> RW saja, RT kosong.
 * Null bila tidak ada kandidat atau tidak ada yang meyakinkan.
 *
 * @param {Map<number, { lat, lon }>} titik  kertas kerja -> titik (titikPeta)
 * @returns {{ rw, rt, aturan, dari, jarak: number|null, menit: number|null } | null}
 */
function tebakRtRw(target, kandidat, titik) {
  if (kandidat.length === 0) return null;
  const t0 = titik.get(target.kk.id);
  const ukur = kandidat
    .map((k) => {
      const t = titik.get(k.kk.id);
      const menit =
        target.tanggal && k.tanggal ? Math.abs(target.tanggal.getTime() - k.tanggal.getTime()) / 60000 : null;
      return { k, jarak: t0 && t ? jarakMeter(t0, t) : null, menit };
    })
    .sort(
      (a, b) =>
        (a.jarak === null) - (b.jarak === null) ||
        (a.jarak ?? 0) - (b.jarak ?? 0) ||
        (a.menit ?? Infinity) - (b.menit ?? Infinity)
    );
  const d = ukur[0];
  const hasil = (aturan, rw, rt) => ({ rw, rt, aturan, dari: d.k, jarak: d.jarak, menit: d.menit });

  if (new Set(kandidat.map((k) => `${k.rw}|${k.rt}`)).size === 1) return hasil("sepakat", d.k.rw, d.k.rt);
  const dekat = d.jarak !== null ? d.jarak <= JARAK_RT_M : d.menit !== null && d.menit <= SELISIH_RT_MENIT;
  if (dekat) return hasil("terdekat", d.k.rw, d.k.rt);
  if (new Set(kandidat.map((k) => k.rw)).size === 1) return hasil("rw-sepakat", d.k.rw, "");
  return null;
}

/**
 * Isi RT/RW baris yang belum punya RT maupun RW dari kertas kerja sehari
 * (tebakRtRw). Acuannya hanya isian petugas, bukan perkiraan lain, supaya
 * tebakan tidak berantai. Mengubah `baris`; panggil SETELAH lengkapiDariPeta
 * supaya kertas kerja yang kelurahannya dari peta ikut diperkirakan.
 */
function perkiraRtRw(baris, titik, { timezone }) {
  const kandidatUntuk = pengindeksKandidat(baris, timezone);
  for (const b of baris) {
    if (b.rw || b.rt) continue;
    const tebak = tebakRtRw(b, kandidatUntuk(b), titik);
    if (!tebak) continue;
    b.rw = tebak.rw;
    b.rt = tebak.rt;
    b.sumberRtRw = "perkiraan";
    b.rtRwDari = { nomor: tebak.dari.kk.nomor, aturan: tebak.aturan };
  }
  return baris;
}

/** Isi kolom Sumber RT/RW. */
function keteranganRtRw(b) {
  if (b.sumberRtRw === "isian") return "Isian";
  if (b.sumberRtRw === "perkiraan") {
    const dari = `dari KK ${b.rtRwDari.nomor}, tim & tanggal sama`;
    return b.rtRwDari.aturan === "rw-sepakat" ? `Perkiraan RW saja (${dari})` : `Perkiraan (${dari})`;
  }
  return "Tidak ada";
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
    "Sumber RT/RW",
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
      teks(keteranganRtRw(b)),
    ]),
    titik: [],
  };
}

/**
 * Ringkasan untuk layar ekspor sebelum mengunduh laporan per wilayah.
 *
 *   kertasKerja : baris yang akan ikut dengan pilihan ini
 *   tanpaWilayah: kertas kerja berisi data yang belum punya kecamatan objek
 *                 (dari isian maupun dari peta BPN)
 *   dariPeta    : baris yang akan ikut, yang kecamatan/kelurahannya dari peta BPN
 *   rw          : pilihan RW di kelurahan terpilih [{ nilai, jumlah }]
 *   rt          : pilihan RT di RW terpilih [{ nilai, jumlah }]
 *   tanpaRtRw   : baris di kelurahan terpilih yang RW-nya kosong
 *   rtRwPerkiraan: baris yang akan ikut, yang RT/RW-nya perkiraan
 */
function ringkasSpj(baris, pilihan) {
  const hitung = (daftar, kunci) => {
    const n = new Map();
    for (const b of daftar) if (b[kunci]) n.set(b[kunci], (n.get(b[kunci]) || 0) + 1);
    return [...n].sort(([a], [b]) => banding(a, b)).map(([nilai, jumlah]) => ({ nilai, jumlah }));
  };
  const diKelurahan = pilihan?.kelurahan ? saringSpj(baris, { ...pilihan, rw: "", rt: "" }) : [];
  const diRw = pilihan?.rw ? diKelurahan.filter((b) => b.rw === pilihan.rw) : [];
  const ikut = saringSpj(baris, pilihan);
  return {
    kertasKerja: ikut.length,
    tanpaWilayah: baris.filter((b) => !b.kecamatan).length,
    dariPeta: ikut.filter((b) => b.sumberWilayah === "peta").length,
    rw: hitung(diKelurahan, "rw"),
    rt: hitung(diRw, "rt"),
    tanpaRtRw: diKelurahan.filter((b) => !b.rw).length,
    rtRwPerkiraan: ikut.filter((b) => b.sumberRtRw === "perkiraan").length,
  };
}

module.exports = {
  nomorRtRw,
  bacaPilihanSpj,
  susunBarisSpj,
  titikPeta,
  lengkapiDariPeta,
  pengindeksKandidat,
  tebakRtRw,
  perkiraRtRw,
  saringSpj,
  urutSpj,
  tabelSpj,
  ringkasSpj,
};

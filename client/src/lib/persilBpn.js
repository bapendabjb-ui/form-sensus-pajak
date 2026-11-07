import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../api.js";

/*
 * Persil BPN di Peta Sensus: ringkasan dari server, nyala / mati dan
 * kecamatan yang tampil (per browser), warna tiap kecamatan, dan penggambar
 * ubin kanvas untuk mesin peta (SebaranGoogle / SebaranLeaflet).
 *
 * Satu kota berisi ratusan ribu bidang. Bidang tidak dijadikan objek peta satu
 * per satu (Google / Leaflet tersendat di puluhan ribu objek), melainkan
 * digambar ke ubin kanvas 256 px seperti ubin peta biasa: mesin peta meminta
 * ubin yang terlihat, ubinnya digambar dari data yang diunduh sekali lalu
 * disimpan (server/src/persil.js):
 *   - zoom 13-16: isi ringkas per sel ±2,2 km (garis disederhanakan ±3 m,
 *     tidak terlihat di zoom itu) - seluruh kota ±2 MB, diunduh semua di
 *     belakang begitu persil pertama tergambar, supaya geser / zoom berikutnya
 *     tidak pernah menunggu jaringan;
 *   - zoom 17 ke atas: petak ±550 m dengan bentuk lengkap. Selama petaknya
 *     belum ada, ubin digambar dulu dari isi ringkas lalu dipertajam - persil
 *     tidak pernah hilang saat peta digeser atau diperbesar.
 * Keterangan bidang diambil dari server saat bidangnya diketuk. Pengelolaannya
 * di components/KelolaPersil.jsx.
 */

/**
 * Persil mulai digambar dari zoom ini. Di zoom 13 seluruh Banjarbaru muat satu
 * layar: bidang terlihat sebagai sebaran berwarna per kecamatan; dari zoom 17
 * tiap bidang rumah jelas terpisah.
 */
export const PERSIL_ZOOM_MIN = 13;

/**
 * Dari zoom ini dipakai bentuk lengkap (petak); di bawahnya isi ringkas. Di
 * zoom 16 satu piksel ±2,4 m, jadi penyederhanaan ±3 m baru terlihat di zoom 17.
 */
export const PERSIL_ZOOM_RINCI = 17;

/** Sampai /api/konfigurasi menjawab - sama dengan server/src/persil.js UKURAN_PETAK / UKURAN_RINGKAS. */
const UKURAN_PETAK_BAWAAN = 0.005;
const UKURAN_RINGKAS_BAWAAN = 0.02;

const UKURAN_UBIN = 256;

/* ---------- warna kecamatan ---------- */

/*
 * Warna dari palet kategori baku (peta jalan / satelit - satelit memakai
 * langkah warna untuk latar gelap). Teal dan amber tidak dipakai: itu warna
 * titik sensus (WARNA_STATUS di components/peta/bersama.jsx).
 */
const BIRU = { peta: "#2a78d6", satelit: "#3987e5" };
const MAGENTA = { peta: "#e87ba4", satelit: "#d55181" };
const KUNING = { peta: "#eda100", satelit: "#c98500" };
const HIJAU = { peta: "#008300", satelit: "#008300" };
const UNGU = { peta: "#6250d6", satelit: "#9085e9" };
const ORANYE = { peta: "#eb6834", satelit: "#d95926" };
const MERAH = { peta: "#e34948", satelit: "#e66767" };
/** Bidang tanpa kecamatan, dan kecamatan ke-8 dst. */
const ABU = { peta: "#64748B", satelit: "#94A3B8" };

/**
 * Lima kecamatan Banjarbaru, dipasangkan supaya kecamatan yang bertetangga
 * tetap terbedakan di kedua jenis peta (diuji dengan validator palet: selisih
 * pasangan bertetangga ΔE ≥ 19 bagi penglihatan normal, ≥ 6,9 bagi buta warna,
 * dibantu nama kecamatan di legenda dan balon). Satu-satunya pasangan yang
 * tidak bertetangga: Liang Anggang dengan kedua Banjarbaru.
 */
const WARNA_TETAP = {
  "banjarbaru selatan": BIRU,
  "banjarbaru utara": MAGENTA,
  cempaka: KUNING,
  "landasan ulin": HIJAU,
  "liang anggang": UNGU,
};

/** Untuk kecamatan lain (data di luar Banjarbaru), urut abjad. */
const WARNA_CADANGAN = [ORANYE, MERAH];

/** { nama kecamatan: { peta, satelit } } untuk daftar kecamatan yang ada. */
export function warnaKecamatan(nama = []) {
  const hasil = {};
  const cadangan = [...WARNA_CADANGAN];
  for (const n of [...nama].sort((a, b) => a.localeCompare(b, "id"))) {
    hasil[n] = WARNA_TETAP[n.trim().toLowerCase()] || cadangan.shift() || ABU;
  }
  return hasil;
}

/** Warna bidang sebuah kecamatan di jenis peta ini ("peta" | "satelit"). */
export const warnaDi = (warna, kecamatan, jenis) =>
  (warna?.[kecamatan] || ABU)[jenis === "satelit" ? "satelit" : "peta"];

/* ---------- warna status sensus (integrasi NIB-NOP) ---------- */

/*
 * Tiga mode warna bidang (lapisan):
 *   "kecamatan" BPN          - bentuk dan NIB asli BPN, warna per kecamatan
 *   "status"    NOP PBB      - hubungan bidang dengan NOP apa adanya, dari data sensus
 *                              dan tab NOP (server/src/integrasi.js statusBidangPeta)
 *   "terpadu"   Terintegrasi - hasil pemadanan: tiap bidang 1 NOP (susunTerpadu)
 * Warna status: tiga slot pertama palet kategori ditambah ungu tua untuk
 * "perlu dipecah" - keempatnya tetap terbedakan berpasangan di peta, juga bagi
 * buta warna (divalidasi --pairs all, terang dan gelap/satelit). Warna yang sama
 * berarti hal yang sama di kedua lapisan. Bidang yang belum tercatat abu-abu
 * tipis supaya yang sudah tercatat menonjol.
 */
const W_PADAN = BIRU;
const W_TINJAU = { peta: "#eb6834", satelit: "#d95926" };
const W_TANPA = { peta: "#1baf7a", satelit: "#199e70" };
const W_PECAH = { peta: "#9b3f99", satelit: "#b04fae" };

export const STATUS_BIDANG = [
  { kunci: "cocok", label: "1 NIB = 1 NOP", warna: W_PADAN },
  { kunci: "tinjau", label: "Beberapa NIB / NOP", warna: W_TINJAU },
  { kunci: "tanpa_nop", label: "NIB tanpa NOP", warna: W_TANPA },
];

/** Lapisan Terintegrasi - sama dengan server/src/integrasi.js STATUS_TERPADU. */
export const STATUS_TERPADU = [
  { kunci: "padan", label: "Padan", warna: W_PADAN },
  { kunci: "tinjau", label: "Perlu dipadankan", warna: W_TINJAU },
  { kunci: "pecah", label: "Perlu dipecah", warna: W_PECAH },
  { kunci: "tanpa_nop", label: "Belum ber-NOP", warna: W_TANPA },
];
const BELUM = { kunci: "belum", label: "Belum tercatat", warna: ABU };

const WARNA_STATUS_SEMUA = new Map([...STATUS_BIDANG, ...STATUS_TERPADU].map((s) => [s.kunci, s.warna]));

/** Warna sebuah status bidang, dari lapisan mana pun ("belum" untuk yang tidak tercatat). */
export const warnaStatusBidang = (status, jenis) =>
  (WARNA_STATUS_SEMUA.get(status) || BELUM.warna)[jenis === "satelit" ? "satelit" : "peta"];

/** Daftar status sebuah mode warna ("status" | "terpadu"), untuk legenda. */
export const daftarStatusMode = (mode) => (mode === "terpadu" ? STATUS_TERPADU : STATUS_BIDANG);

export const LABEL_BELUM = BELUM.label;

/*
 * NOP sebuah bidang ditambah / dihapus dari panel peta, atau data sensus
 * disimpan: warna status dimuat ulang tanpa menunggu halaman dibuka lagi.
 */
const pendengarStatus = new Set();
let statusKe = 0;
export function kabarkanStatusBerubah() {
  statusKe += 1;
  for (const fn of pendengarStatus) fn(statusKe);
}

/** Warna satu bidang menurut mode warna peta: status sensus (cfg.status) atau kecamatan. */
const warnaBidang = (cfg, id, kec, jenis) =>
  cfg.status ? warnaStatusBidang(cfg.status.get(id), jenis) : warnaDi(cfg.warna, kec, jenis);

/** Warna sorot bidang yang diketuk / hasil cari NIB, mengikuti mode warna peta. */
export const warnaSorotBidang = (cfg, b, jenis) =>
  cfg?.status
    ? warnaStatusBidang(cfg.status.get(b.id), jenis)
    : warnaDi(cfg?.warna, b.fitur?.properties?.kecamatan ?? b.kecamatan, jenis);

/** Kiriman /api/integrasi/bidang (id sebagai selisih berurutan) -> Map(id persil -> status). */
export function petaStatusBidang(isi, daftar = STATUS_BIDANG) {
  const peta = new Map();
  for (const { kunci } of daftar) {
    let id = 0;
    for (const d of Array.isArray(isi?.[kunci]) ? isi[kunci] : []) {
      id += d;
      peta.set(id, kunci);
    }
  }
  return peta;
}

/** 1234.5 -> "1.234,5 m²". */
export const formatLuas = (n) =>
  Number.isFinite(n) ? `${n.toLocaleString("id-ID", { maximumFractionDigits: 2 })} m²` : "";

/* ---------- pilihan pemakai (per browser) ---------- */

const KUNCI_NYALA = "sensus.persilNyala";
const KUNCI_TERSEMBUNYI = "sensus.persilKecamatanMati";
const KUNCI_MODE = "sensus.persilWarna";

function baca(kunci, cadangan) {
  try {
    const v = localStorage.getItem(kunci);
    return v === null ? cadangan : JSON.parse(v);
  } catch {
    return cadangan;
  }
}

function simpan(kunci, nilai) {
  try {
    localStorage.setItem(kunci, JSON.stringify(nilai));
  } catch {
    // Penyimpanan browser ditutup: pilihannya berlaku sampai halaman ditutup.
  }
}

/**
 * @returns {{
 *   ringkasan: object | null,   GET /api/persil
 *   ada: boolean,               ada persil tersimpan
 *   nyala: boolean,             pilihan pemakai ini (bawaan menyala)
 *   ubahNyala: (nyala: boolean) => void,
 *   kecamatan: { nama, jumlah, warna: { peta, satelit }, tampil }[],  urut abjad
 *   ubahKecamatan: (nama: string, tampil: boolean) => void,
 *   muatUlang: () => Promise<void>,
 *   mode: "kecamatan" | "status" | "terpadu",   mode warna bidang (per browser): BPN | NOP PBB | Terintegrasi
 *   ubahMode: (mode) => void,
 *   statusGalat: string,            status sensus gagal dimuat
 *   peta: { versi, ukuranPetak, ukuranRingkas, sel, warna, kecamatan: string[], tersembunyi: string[],
 *           status: Map | null, modeStatus, kunci } | null
 *          untuk mesin peta; null = jangan digambar. `kunci` berganti setiap gambarnya harus diulang.
 *          `status` (mode "status" / "terpadu"): Map(id persil -> status), lihat STATUS_BIDANG /
 *          STATUS_TERPADU; `modeStatus` = mode yang dipakai status itu.
 * }}
 *
 * `paksa` = pemilih bidang di formulir: persil selalu tampil, semua kecamatan,
 * warna kecamatan - pilihan Peta Sensus pemakai tidak berlaku di sana.
 */
export function usePersilBpn({ paksa = false } = {}) {
  const [ringkasan, setRingkasan] = useState(null);
  const [nyalaPilihan, setNyala] = useState(() => baca(KUNCI_NYALA, 1) !== 0);
  const [tersembunyiPilihan, setTersembunyi] = useState(() => {
    const t = baca(KUNCI_TERSEMBUNYI, []);
    return Array.isArray(t) ? t.filter((x) => typeof x === "string") : [];
  });
  const [modePilihan, setMode] = useState(() => modeSah(baca(KUNCI_MODE, "kecamatan")));
  const nyala = paksa || nyalaPilihan;
  const tersembunyi = paksa ? TANPA_SEMBUNYI : tersembunyiPilihan;
  const mode = paksa ? "kecamatan" : modePilihan;
  // Status tiap bidang: { peta: Map, ke: nomor muatan, mode } - dimuat saat mode "status" / "terpadu" dipilih.
  const [status, setStatus] = useState(null);
  const [statusGalat, setStatusGalat] = useState("");
  // Naik setiap kabarkanStatusBerubah: status dimuat ulang.
  const [statusBaru, setStatusBaru] = useState(statusKe);
  useEffect(() => {
    pendengarStatus.add(setStatusBaru);
    return () => pendengarStatus.delete(setStatusBaru);
  }, []);
  const [ukuran, setUkuran] = useState({ petak: UKURAN_PETAK_BAWAAN, ringkas: UKURAN_RINGKAS_BAWAAN });

  const muatUlang = useCallback(
    () =>
      api
        .ringkasanPersil()
        .then(setRingkasan)
        // Persil hanya pelengkap: peta tetap dipakai walau ringkasannya gagal dimuat.
        .catch((e) => console.warn("[Sensus Pajak] ringkasan persil gagal dimuat:", e.message)),
    []
  );

  useEffect(() => {
    muatUlang();
    api
      .getKonfigurasi()
      .then((k) => {
        if (k.persil?.ukuranPetak) {
          setUkuran({ petak: k.persil.ukuranPetak, ringkas: k.persil.ukuranRingkas || k.persil.ukuranPetak * 4 });
        }
      })
      .catch(() => {});
  }, [muatUlang]);

  const ubahNyala = useCallback((n) => {
    setNyala(n);
    simpan(KUNCI_NYALA, n ? 1 : 0);
  }, []);

  const ubahKecamatan = useCallback((nama, tampil) => {
    setTersembunyi((t) => {
      const baru = tampil ? t.filter((x) => x !== nama) : [...new Set([...t, nama])];
      simpan(KUNCI_TERSEMBUNYI, baru);
      return baru;
    });
  }, []);

  const ubahMode = useCallback((m) => {
    const baru = modeSah(m);
    setMode(baru);
    simpan(KUNCI_MODE, baru);
  }, []);

  const ada = Boolean(ringkasan && ringkasan.jumlah > 0);
  const versi = ringkasan?.versi;

  // Status dimuat sekali tiap mode status dinyalakan / halaman dibuka / NOP
  // bidang berubah: isinya berubah setiap petugas menyimpan data, jadi tidak disimpan lama.
  useEffect(() => {
    if (mode === "kecamatan" || !ada) return undefined;
    let batal = false;
    setStatusGalat("");
    api
      .statusBidangSensus(mode)
      .then(
        (isi) =>
          !batal && setStatus((s) => ({ peta: petaStatusBidang(isi, daftarStatusMode(mode)), ke: (s?.ke || 0) + 1, mode }))
      )
      .catch((e) => !batal && setStatusGalat(e.message || "Status NOP bidang gagal dimuat."));
    return () => {
      batal = true;
    };
  }, [mode, ada, versi, statusBaru]);

  const kecamatan = useMemo(() => {
    const jumlah = new Map();
    for (const w of ringkasan?.wilayah || []) jumlah.set(w.kecamatan, (jumlah.get(w.kecamatan) || 0) + w.jumlah);
    const warna = warnaKecamatan([...jumlah.keys()]);
    return Object.keys(warna).map((nama) => ({
      nama,
      jumlah: jumlah.get(nama),
      warna: warna[nama],
      tampil: !tersembunyi.includes(nama),
    }));
  }, [ringkasan, tersembunyi]);

  // Identitas stabil: mesin peta menggambar ulang setiap `kunci` berganti.
  const peta = useMemo(() => {
    if (!ada || !nyala) return null;
    const sembunyi = kecamatan.filter((k) => !k.tampil).map((k) => k.nama);
    // Mode status yang datanya belum tiba digambar dengan warna kecamatan dulu.
    const pakaiStatus = mode !== "kecamatan" && status?.mode === mode ? status : null;
    return {
      versi,
      ukuranPetak: ukuran.petak,
      ukuranRingkas: ukuran.ringkas,
      // Sel ringkas sekota, untuk disiapkan di belakang (bukan bagian dari `kunci`).
      sel: ringkasan?.sel || [],
      warna: Object.fromEntries(kecamatan.map((k) => [k.nama, k.warna])),
      kecamatan: kecamatan.map((k) => k.nama),
      tersembunyi: sembunyi,
      status: pakaiStatus ? pakaiStatus.peta : null,
      modeStatus: pakaiStatus ? mode : "",
      kunci: `${versi}|${ukuran.petak}|${ukuran.ringkas}|${sembunyi.join(",")}|${pakaiStatus ? `${mode}${pakaiStatus.ke}` : "k"}`,
    };
  }, [ada, nyala, versi, ukuran, kecamatan, ringkasan, mode, status]);

  return { ringkasan, ada, nyala, ubahNyala, kecamatan, ubahKecamatan, muatUlang, mode, ubahMode, statusGalat, peta };
}

const TANPA_SEMBUNYI = [];

/** Mode warna yang dikenal; selain itu "kecamatan". */
const modeSah = (m) => (m === "status" || m === "terpadu" ? m : "kecamatan");

/* ---------- petak data ---------- */

/** Petak data yang disimpan di memori (±550 m masing-masing; yang terpadat ±0,6 MB). */
const PETAK_SIMPAN_MAKS = 200;

const simpanan = new Map(); // "versi|i,j" -> Promise<bidang[]>; urutan = terakhir dipakai
const pendengar = new Set();
let sedangDimuat = 0;
let galatTerakhir = "";

const lapor = () => {
  for (const fn of pendengar) fn();
};

/** Daftarkan fn yang dipanggil setiap jumlah petak yang dimuat / galatnya berubah. */
export function dengarPetak(fn) {
  pendengar.add(fn);
  return () => pendengar.delete(fn);
}

/** { memuat: jumlah petak yang sedang diunduh, galat: pesan galat terakhir }. */
export const keadaanPetak = () => ({ memuat: sedangDimuat, galat: galatTerakhir });

/** Isi petak dari server -> [{ id, kec, poligon, kotak: [barat, selatan, timur, utara] }]. */
function uraiPetak(isi) {
  const nama = isi.kecamatan || [];
  return (isi.bidang || []).map(([id, k, poligon]) => {
    const kotak = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of poligon) {
      for (const [lon, lat] of p[0] || []) {
        if (lon < kotak[0]) kotak[0] = lon;
        if (lat < kotak[1]) kotak[1] = lat;
        if (lon > kotak[2]) kotak[2] = lon;
        if (lat > kotak[3]) kotak[3] = lat;
      }
    }
    return { id, kec: nama[k] || "", poligon, kotak };
  });
}

/** Petak data (bentuk lengkap), dari simpanan bila sudah pernah diunduh. Urutan simpanan = terakhir dipakai. */
const muatPetak = (versi, i, j, opsi) =>
  muatDenganSimpanan(
    simpanan,
    PETAK_SIMPAN_MAKS,
    `${versi}|${i},${j}`,
    () => api.petakPersil(i, j, versi).then(uraiPetak),
    opsi
  );

/** Petak data [i, j] yang menyentuh kotak ini. */
function petakDi({ barat, timur, utara, selatan }, g) {
  const hasil = [];
  for (let i = Math.floor(barat / g); i <= Math.floor(timur / g); i++) {
    for (let j = Math.floor(selatan / g); j <= Math.floor(utara / g); j++) hasil.push([i, j]);
  }
  return hasil;
}

/* ---------- isi ringkas (zoom 13-14) ---------- */

/** Sel ringkas yang disimpan di memori: seluruh Banjarbaru ±80 sel, ±8 MB setelah diurai. */
const RINGKAS_SIMPAN_MAKS = 150;
const SATUAN_RINGKAS = 1e5;

const simpananRingkas = new Map(); // "versi|i,j" -> Promise<sel>

/**
 * Isi ringkas dari server (server/src/persil.js teksRingkas) -> larik padat,
 * hemat memori (seluruh kota ±1 juta titik sudut):
 *   { nama: [kecamatan], asal: [x0, y0], n: jumlah cincin,
 *     xy: Int32Array titik (satuan 1e-5 derajat, relatif ke asal),
 *     awal: Int32Array indeks titik pertama tiap cincin (+ penutup),
 *     ki: Uint8Array indeks kecamatan, id: Int32Array id bidang besar (0 = bidang kecil),
 *     pid: Int32Array id bidang tiap cincin, kecil maupun besar (0 = tidak diketahui:
 *          isi dari server lama) - untuk mode warna status sensus,
 *     kotak: Int32Array [x min, y min, x maks, y maks] tiap cincin }
 */
export function uraiRingkas(isi) {
  const d = isi.bidang || [];
  const besar = isi.besar || [];
  const idKecil = isi.id || [];
  let nC = 0;
  let nT = 0;
  for (let k = 0; k < d.length; k += 4 + 2 * (d[k + 1] - 1)) {
    nC++;
    nT += d[k + 1];
  }
  for (const b of besar) {
    for (let r = 2; r < b.length; r++) {
      nC++;
      nT += b[r].length / 2;
    }
  }
  const xy = new Int32Array(2 * nT);
  const awal = new Int32Array(nC + 1);
  const ki = new Uint8Array(nC);
  const id = new Int32Array(nC);
  const pid = new Int32Array(nC);
  const kotak = new Int32Array(4 * nC);
  let c = 0;
  let t = 0;
  const tambah = (x, y) => {
    xy[2 * t] = x;
    xy[2 * t + 1] = y;
    t++;
  };
  const tutup = () => {
    let [x1, y1, x2, y2] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let v = awal[c]; v < t; v++) {
      const x = xy[2 * v];
      const y = xy[2 * v + 1];
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
    }
    kotak.set([x1, y1, x2, y2], 4 * c);
    c++;
    awal[c] = t;
  };

  let px = 0;
  let py = 0;
  let idJalan = 0;
  let ke = 0;
  for (let k = 0; k < d.length; ) {
    if (ke < idKecil.length) {
      idJalan += idKecil[ke++];
      pid[c] = idJalan;
    }
    ki[c] = d[k++];
    const n = d[k++];
    let x = px + d[k++];
    let y = py + d[k++];
    px = x;
    py = y;
    tambah(x, y);
    for (let v = 1; v < n; v++) {
      x += d[k++];
      y += d[k++];
      tambah(x, y);
    }
    tutup();
  }
  for (const b of besar) {
    for (let r = 2; r < b.length; r++) {
      const a = b[r];
      ki[c] = b[1];
      id[c] = b[0];
      pid[c] = b[0];
      let x = a[0];
      let y = a[1];
      tambah(x, y);
      for (let v = 2; v < a.length; v += 2) {
        x += a[v];
        y += a[v + 1];
        tambah(x, y);
      }
      tutup();
    }
  }
  return { nama: isi.kecamatan || [], asal: isi.asal || [0, 0], n: nC, xy, awal, ki, id, pid, kotak };
}

/** Kunci simpanan yang isinya sudah tiba (bukan sekadar sedang diunduh). */
const siap = new Set();

/**
 * Muat satu unduhan lewat simpanan LRU. Unduhan biasa ikut dihitung di
 * keadaanPetak (keterangan "Memuat persil" di peta); `diam` = unduhan di
 * belakang (menyiapkan sekota, mempertajam ubin yang sudah berisi) - tidak.
 */
function muatDenganSimpanan(simpananIni, maks, kunci, ambil, { diam = false } = {}) {
  const ada = simpananIni.get(kunci);
  if (ada) {
    simpananIni.delete(kunci);
    simpananIni.set(kunci, ada);
    return ada;
  }
  if (!diam) {
    sedangDimuat++;
    lapor();
  }
  const janji = ambil()
    .then(
      (hasil) => {
        galatTerakhir = "";
        siap.add(kunci);
        return hasil;
      },
      (e) => {
        // Dicoba lagi saat ubinnya diminta lagi.
        if (simpananIni.get(kunci) === janji) simpananIni.delete(kunci);
        if (!diam) galatTerakhir = e.message || "Persil gagal dimuat.";
        throw e;
      }
    )
    .finally(() => {
      if (!diam) {
        sedangDimuat--;
        lapor();
      }
    });
  simpananIni.set(kunci, janji);
  while (simpananIni.size > maks) {
    const tertua = simpananIni.keys().next().value;
    simpananIni.delete(tertua);
    siap.delete(tertua);
  }
  return janji;
}

const muatRingkas = (versi, i, j, opsi) =>
  muatDenganSimpanan(
    simpananRingkas,
    RINGKAS_SIMPAN_MAKS,
    `${versi}|${i},${j}`,
    () => api.ringkasPersil(i, j, versi).then(uraiRingkas),
    opsi
  );

let disiapkanUntuk = null; // versi persil yang isi ringkas sekotanya sedang / sudah diunduh

/**
 * Unduh isi ringkas semua sel kota di belakang (±2 MB, sekali per versi;
 * sesudahnya dari cache browser), tiga sekaligus. Dipanggil saat persil
 * pertama kali digambar, jadi pembuka peta yang tidak sampai zoom 13 tidak
 * ikut mengunduhnya.
 */
function siapkanSekota(cfg) {
  if (disiapkanUntuk === cfg.versi || !cfg.sel?.length) return;
  disiapkanUntuk = cfg.versi;
  const antrean = [...cfg.sel];
  const pekerja = async () => {
    while (antrean.length && disiapkanUntuk === cfg.versi) {
      const [i, j] = antrean.shift();
      await muatRingkas(cfg.versi, i, j, { diam: true }).catch(() => {});
    }
  };
  for (let k = 0; k < 3; k++) pekerja();
}

/* ---------- ubin kanvas ---------- */

const lonKeX = (lon, n) => ((lon + 180) / 360) * n;
const latKeY = (lat, n) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
};
const yKeLat = (y, n) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;

/**
 * Gaya per zoom: garis tipis dan isian lebih tebal saat bidangnya kecil di
 * layar - di zoom 13-14 bidang rumah 1-2 piksel, jadi yang terbaca adalah
 * sebarannya, bukan garisnya.
 */
const GAYA_ZOOM = {
  13: { garis: 0.35, tembusGaris: 0.75, tembusIsi: 0.3 },
  14: { garis: 0.45, tembusGaris: 0.85, tembusIsi: 0.2 },
  15: { garis: 0.55, tembusGaris: 0.95, tembusIsi: 0.08 },
  16: { garis: 0.8, tembusGaris: 0.95, tembusIsi: 0.07 },
  17: { garis: 1.1, tembusGaris: 0.95, tembusIsi: 0.07 },
};
const gayaZoom = (z) => GAYA_ZOOM[z] || (z > 17 ? { garis: 1.4, tembusGaris: 0.95, tembusIsi: 0.07 } : GAYA_ZOOM[13]);

/** Lebar ubin kanvas dalam piksel perangkat (tajam di layar HP), dan ukuran tampilnya. */
export function siapkanUbin(ubin) {
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
  ubin.width = ubin.height = UKURAN_UBIN * dpr;
  ubin.style.width = ubin.style.height = `${UKURAN_UBIN}px`;
  return ubin;
}

/**
 * Gambar persil satu ubin peta (skema ubin Web Mercator x / y / z yang sama
 * dengan Google dan Leaflet) ke kanvas `ubin` (dari siapkanUbin).
 *
 * @param {{ x: number, y: number, z: number }} ubinKe
 * @param {object} cfg    usePersilBpn().peta
 * @param {string} jenis  "peta" | "satelit" - warna mengikuti latarnya
 * @param {() => boolean} batal  true = ubinnya sudah tidak dipakai, jangan digambar
 */
export async function gambarUbinPersil(ubin, { x, y, z }, cfg, jenis, batal = () => false) {
  const n = 2 ** z;
  const batas = {
    barat: (x / n) * 360 - 180,
    timur: ((x + 1) / n) * 360 - 180,
    utara: yKeLat(y, n),
    selatan: yKeLat(y + 1, n),
  };
  const posisi = { x, y, n };
  siapkanSekota(cfg);

  if (z < PERSIL_ZOOM_RINCI) {
    const jalur = await jalurRingkas(batas, posisi, cfg, jenis);
    if (!batal()) gambarJalur(ubin, jalur, z, cfg);
    return;
  }

  // Bentuk lengkap. Petaknya belum semua tiba: gambar dulu dari isi ringkas
  // (biasanya sudah tersimpan), lalu pertajam di belakang - ubinnya tidak
  // pernah kosong menunggu jaringan.
  const lengkap = petakDi(batas, cfg.ukuranPetak).every(([i, j]) => siap.has(`${cfg.versi}|${i},${j}`));
  if (!lengkap) {
    const kasar = await jalurRingkas(batas, posisi, cfg, jenis);
    if (batal()) return;
    gambarJalur(ubin, kasar, z, cfg);
    jalurRinci(batas, posisi, cfg, jenis, { diam: true })
      .then((jalur) => !batal() && gambarJalur(ubin, jalur, z, cfg))
      .catch(() => {
        // Tetap gambar ringkas; dicoba lagi saat ubinnya diminta lagi.
      });
    return;
  }
  const jalur = await jalurRinci(batas, posisi, cfg, jenis);
  if (!batal()) gambarJalur(ubin, jalur, z, cfg);
}

/*
 * TUTUP_CINCIN: cincin ditutup dengan garis ke titik awalnya, bukan
 * closePath(). Di Chrome, closePath() pada Path2D berisi ribuan subjalur makin
 * lambat seiring panjang jalurnya: menggambar Banjarbaru di zoom 13 memakan
 * ±17 detik di closePath saja (diukur 2026-11-06), dengan lineTo ±20 ms.
 * Isian tetap benar karena fill() menutup setiap subjalur sendiri.
 */

/**
 * Wadah jalur per warna satu ubin. Mode status: jalur bidang yang belum tercatat
 * dibuat lebih dulu supaya tergambar paling bawah, di bawah bidang yang tercatat.
 */
function jalurBaru(cfg, jenis) {
  const jalur = new Map();
  if (cfg.status) jalur.set(warnaStatusBidang("belum", jenis), new Path2D());
  return jalur;
}

/** Path2D untuk satu warna (dibuat saat pertama dibutuhkan). */
function jalurUntuk(jalur, warna) {
  let p = jalur.get(warna);
  if (!p) jalur.set(warna, (p = new Path2D()));
  return p;
}

/** Jalur per warna dari petak bentuk lengkap (zoom 17 ke atas). */
async function jalurRinci(batas, { x, y, n }, cfg, jenis, opsi) {
  const { barat, timur, utara, selatan } = batas;
  const petak = await Promise.all(petakDi(batas, cfg.ukuranPetak).map(([i, j]) => muatPetak(cfg.versi, i, j, opsi)));

  // Satu jalur per warna: digambar sekaligus, dan bidang yang menyentuh
  // beberapa petak data cukup sekali.
  const tersembunyi = new Set(cfg.tersembunyi);
  const jalur = jalurBaru(cfg, jenis);
  const sudah = new Set();
  for (const isi of petak) {
    for (const b of isi) {
      if (sudah.has(b.id) || tersembunyi.has(b.kec)) continue;
      const [w, s, e, u] = b.kotak;
      if (e < barat || w > timur || u < selatan || s > utara) continue;
      sudah.add(b.id);
      const p = jalurUntuk(jalur, warnaBidang(cfg, b.id, b.kec, jenis));
      for (const poligon of b.poligon) {
        for (const cincin of poligon) {
          // Cincin GeoJSON sudah tertutup (titik akhir = titik awal): tanpa closePath (lihat TUTUP_CINCIN).
          for (let k = 0; k < cincin.length; k++) {
            const px = (lonKeX(cincin[k][0], n) - x) * UKURAN_UBIN;
            const py = (latKeY(cincin[k][1], n) - y) * UKURAN_UBIN;
            if (k) p.lineTo(px, py);
            else p.moveTo(px, py);
          }
        }
      }
    }
  }
  return jalur;
}

/**
 * Jalur per warna dari isi ringkas (zoom 13-16, dan pengganti sementara di atasnya). Bidang kecil hanya ada di sel
 * sudut barat dayanya, jadi sel di selatan / barat ubin ikut dimuat: bidangnya
 * bisa menjulur masuk. Bidang besar ada di setiap sel yang disentuhnya - cukup sekali.
 */
async function jalurRingkas({ barat, timur, utara, selatan }, { x, y, n }, cfg, jenis) {
  const g = cfg.ukuranRingkas;
  const tunggu = [];
  for (let i = Math.floor(barat / g) - 1; i <= Math.floor(timur / g); i++) {
    for (let j = Math.floor(selatan / g) - 1; j <= Math.floor(utara / g); j++) tunggu.push(muatRingkas(cfg.versi, i, j));
  }
  const daftarSel = await Promise.all(tunggu);

  const tersembunyi = new Set(cfg.tersembunyi);
  const jalur = jalurBaru(cfg, jenis);
  // Bidang besar yang sudah digambar dari sel lain. Satu sel selalu memuat
  // semua cincin bidang besarnya, jadi id ditandai setelah selnya selesai.
  const sudah = new Set();
  for (const sel of daftarSel) {
    const [x0, y0] = sel.asal;
    // Batas ubin dalam satuan sel ini.
    const bw = barat * SATUAN_RINGKAS - x0;
    const be = timur * SATUAN_RINGKAS - x0;
    const bs = selatan * SATUAN_RINGKAS - y0;
    const bu = utara * SATUAN_RINGKAS - y0;
    const warnaSel = sel.nama.map((k) => (tersembunyi.has(k) ? null : warnaDi(cfg.warna, k, jenis)));
    const dariSelIni = new Set();
    for (let c = 0; c < sel.n; c++) {
      const warna = cfg.status
        ? warnaSel[sel.ki[c]] && warnaStatusBidang(cfg.status.get(sel.pid[c]), jenis)
        : warnaSel[sel.ki[c]];
      if (!warna) continue;
      const id = sel.id[c];
      if (id && sudah.has(id)) continue;
      const o = 4 * c;
      if (sel.kotak[o + 2] < bw || sel.kotak[o] > be || sel.kotak[o + 3] < bs || sel.kotak[o + 1] > bu) continue;
      if (id) dariSelIni.add(id);
      const p = jalurUntuk(jalur, warna);
      let ax = 0;
      let ay = 0;
      for (let v = sel.awal[c]; v < sel.awal[c + 1]; v++) {
        const px = (lonKeX((x0 + sel.xy[2 * v]) / SATUAN_RINGKAS, n) - x) * UKURAN_UBIN;
        const py = (latKeY((y0 + sel.xy[2 * v + 1]) / SATUAN_RINGKAS, n) - y) * UKURAN_UBIN;
        if (v === sel.awal[c]) {
          p.moveTo(px, py);
          [ax, ay] = [px, py];
        } else {
          p.lineTo(px, py);
        }
      }
      // Isi ringkas tanpa titik penutup: garis kembali ke titik awal (lihat TUTUP_CINCIN).
      p.lineTo(ax, ay);
    }
    for (const id of dariSelIni) sudah.add(id);
  }
  return jalur;
}

/** Gambar jalur-jalur per warna ke ubin. */
function gambarJalur(ubin, jalur, z, cfg) {
  const gaya = gayaZoom(z);
  const ctx = ubin.getContext("2d");
  const dpr = ubin.width / UKURAN_UBIN;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, UKURAN_UBIN, UKURAN_UBIN);
  ctx.lineWidth = gaya.garis;
  ctx.lineJoin = "round";
  // Mode status: bidang yang belum tercatat (jalur pertama, lihat jalurBaru)
  // dibuat samar; yang tercatat diisi lebih pekat supaya sebarannya terbaca.
  let ke = 0;
  for (const [warna, p] of jalur) {
    const samar = cfg?.status && ke === 0;
    const pekat = cfg?.status && ke > 0;
    ke++;
    ctx.fillStyle = warna;
    ctx.strokeStyle = warna;
    ctx.globalAlpha = samar ? gaya.tembusIsi * 0.5 : pekat ? Math.min(0.55, gaya.tembusIsi * 4) : gaya.tembusIsi;
    ctx.fill(p, "evenodd");
    ctx.globalAlpha = samar ? gaya.tembusGaris * 0.45 : gaya.tembusGaris;
    ctx.stroke(p);
  }
  ctx.globalAlpha = 1;
}

/**
 * Keterangan persil untuk mesin peta: "" (tidak ada yang perlu dikatakan),
 * "perbesar", "memuat", atau "galat".
 */
export function statusPersil({ aktif, zoom }) {
  if (!aktif) return "";
  if (zoom < PERSIL_ZOOM_MIN) return "perbesar";
  const { memuat, galat } = keadaanPetak();
  if (memuat > 0) return "memuat";
  return galat ? "galat" : "";
}

/**
 * Geseran peta supaya titik bidang yang diketuk tidak tertutup panel
 * keterangan di kiri atas peta (PanelBidang di components/peta/bersama.jsx).
 *
 * p     : { x, y } titik bidang, piksel dari sudut kiri atas peta
 * panel : { kanan, bawah } tepi panel, piksel dari sudut yang sama
 * peta  : { lebar, tinggi } ukuran peta
 *
 * Hasilnya { x, y }: titik dipindah sejauh itu ke kanan atau ke bawah (yang
 * lebih pendek, asal titiknya tetap di dalam peta), atau null bila titiknya
 * sudah terlihat atau tidak bisa dibebaskan.
 */
export function geserDariPanel(p, panel, peta, ruang = 16) {
  if (!p || !panel || !peta) return null;
  const x = panel.kanan + ruang - p.x;
  const y = panel.bawah + ruang - p.y;
  if (x <= 0 || y <= 0) return null;
  const pilihan = [
    { x, y: 0, muat: p.x + x <= peta.lebar - ruang },
    { x: 0, y, muat: p.y + y <= peta.tinggi - ruang },
  ].filter((g) => g.muat);
  if (!pilihan.length) return null;
  const g = pilihan.reduce((a, b) => (a.x + a.y <= b.x + b.y ? a : b));
  return { x: g.x, y: g.y };
}

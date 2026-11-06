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
 * ubin yang terlihat, ubinnya digambar dari petak data ±550 m
 * (server/src/persil.js) yang diunduh sekali lalu disimpan. Keterangan bidang
 * diambil dari server saat bidangnya diketuk. Pengelolaannya di
 * components/KelolaPersil.jsx.
 */

/**
 * Persil mulai digambar dari zoom ini. Di zoom 15 bidang rumah (±10-20 m)
 * selebar 2-4 piksel: terlihat sebagai jalinan bidang per kecamatan; dari zoom
 * 17 tiap bidang jelas terpisah.
 */
export const PERSIL_ZOOM_MIN = 15;

/** Sampai /api/konfigurasi menjawab - sama dengan server/src/persil.js UKURAN_PETAK. */
const UKURAN_PETAK_BAWAAN = 0.005;

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

/** 1234.5 -> "1.234,5 m²". */
export const formatLuas = (n) =>
  Number.isFinite(n) ? `${n.toLocaleString("id-ID", { maximumFractionDigits: 2 })} m²` : "";

/* ---------- pilihan pemakai (per browser) ---------- */

const KUNCI_NYALA = "sensus.persilNyala";
const KUNCI_TERSEMBUNYI = "sensus.persilKecamatanMati";

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
 *   peta: { versi, ukuranPetak, warna, kecamatan: string[], tersembunyi: string[], kunci } | null
 *          untuk mesin peta; null = jangan digambar. `kunci` berganti setiap gambarnya harus diulang.
 * }}
 */
export function usePersilBpn() {
  const [ringkasan, setRingkasan] = useState(null);
  const [nyala, setNyala] = useState(() => baca(KUNCI_NYALA, 1) !== 0);
  const [tersembunyi, setTersembunyi] = useState(() => {
    const t = baca(KUNCI_TERSEMBUNYI, []);
    return Array.isArray(t) ? t.filter((x) => typeof x === "string") : [];
  });
  const [ukuranPetak, setUkuranPetak] = useState(UKURAN_PETAK_BAWAAN);

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
      .then((k) => k.persil?.ukuranPetak && setUkuranPetak(k.persil.ukuranPetak))
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

  const ada = Boolean(ringkasan && ringkasan.jumlah > 0);
  const versi = ringkasan?.versi;

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
    return {
      versi,
      ukuranPetak,
      warna: Object.fromEntries(kecamatan.map((k) => [k.nama, k.warna])),
      kecamatan: kecamatan.map((k) => k.nama),
      tersembunyi: sembunyi,
      kunci: `${versi}|${ukuranPetak}|${sembunyi.join(",")}`,
    };
  }, [ada, nyala, versi, ukuranPetak, kecamatan]);

  return { ringkasan, ada, nyala, ubahNyala, kecamatan, ubahKecamatan, muatUlang, peta };
}

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

function muatPetak(versi, i, j) {
  const kunci = `${versi}|${i},${j}`;
  const ada = simpanan.get(kunci);
  if (ada) {
    // Pindahkan ke ujung: petak yang paling lama tidak dipakai dibuang lebih dulu.
    simpanan.delete(kunci);
    simpanan.set(kunci, ada);
    return ada;
  }
  sedangDimuat++;
  lapor();
  const janji = api
    .petakPersil(i, j, versi)
    .then(uraiPetak)
    .then(
      (bidang) => {
        galatTerakhir = "";
        return bidang;
      },
      (e) => {
        // Dicoba lagi saat ubinnya diminta lagi.
        simpanan.delete(kunci);
        galatTerakhir = e.message || "Persil gagal dimuat.";
        throw e;
      }
    )
    .finally(() => {
      sedangDimuat--;
      lapor();
    });
  simpanan.set(kunci, janji);
  while (simpanan.size > PETAK_SIMPAN_MAKS) simpanan.delete(simpanan.keys().next().value);
  return janji;
}

/* ---------- ubin kanvas ---------- */

const lonKeX = (lon, n) => ((lon + 180) / 360) * n;
const latKeY = (lat, n) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
};
const yKeLat = (y, n) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;

/** Tebal garis per zoom: tipis saat bidangnya kecil di layar, supaya jalinannya tidak jadi blok warna. */
const tebalGaris = (z) => (z >= 18 ? 1.4 : z === 17 ? 1.1 : z === 16 ? 0.8 : 0.55);

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
  const barat = (x / n) * 360 - 180;
  const timur = ((x + 1) / n) * 360 - 180;
  const utara = yKeLat(y, n);
  const selatan = yKeLat(y + 1, n);
  const g = cfg.ukuranPetak;

  const tunggu = [];
  for (let i = Math.floor(barat / g); i <= Math.floor(timur / g); i++) {
    for (let j = Math.floor(selatan / g); j <= Math.floor(utara / g); j++) tunggu.push(muatPetak(cfg.versi, i, j));
  }
  const petak = await Promise.all(tunggu);
  if (batal()) return;

  // Satu jalur per warna: digambar sekaligus, dan bidang yang menyentuh
  // beberapa petak data cukup sekali.
  const tersembunyi = new Set(cfg.tersembunyi);
  const jalur = new Map();
  const sudah = new Set();
  for (const isi of petak) {
    for (const b of isi) {
      if (sudah.has(b.id) || tersembunyi.has(b.kec)) continue;
      const [w, s, e, u] = b.kotak;
      if (e < barat || w > timur || u < selatan || s > utara) continue;
      sudah.add(b.id);
      const warna = warnaDi(cfg.warna, b.kec, jenis);
      let p = jalur.get(warna);
      if (!p) jalur.set(warna, (p = new Path2D()));
      for (const poligon of b.poligon) {
        for (const cincin of poligon) {
          for (let k = 0; k < cincin.length; k++) {
            const px = (lonKeX(cincin[k][0], n) - x) * UKURAN_UBIN;
            const py = (latKeY(cincin[k][1], n) - y) * UKURAN_UBIN;
            if (k) p.lineTo(px, py);
            else p.moveTo(px, py);
          }
          p.closePath();
        }
      }
    }
  }

  const ctx = ubin.getContext("2d");
  const dpr = ubin.width / UKURAN_UBIN;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, UKURAN_UBIN, UKURAN_UBIN);
  ctx.lineWidth = tebalGaris(z);
  ctx.lineJoin = "round";
  for (const [warna, p] of jalur) {
    ctx.fillStyle = warna;
    ctx.strokeStyle = warna;
    ctx.globalAlpha = 0.07;
    ctx.fill(p, "evenodd");
    ctx.globalAlpha = 0.95;
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

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
 *   - zoom 13-14: isi ringkas per sel ±2,2 km (garis disederhanakan ±3 m,
 *     tidak terlihat di zoom itu) - seluruh kota ±2 MB;
 *   - zoom 15 ke atas: petak ±550 m dengan bentuk lengkap.
 * Keterangan bidang diambil dari server saat bidangnya diketuk. Pengelolaannya
 * di components/KelolaPersil.jsx.
 */

/**
 * Persil mulai digambar dari zoom ini. Di zoom 13 seluruh Banjarbaru muat satu
 * layar: bidang terlihat sebagai sebaran berwarna per kecamatan; dari zoom 17
 * tiap bidang rumah jelas terpisah.
 */
export const PERSIL_ZOOM_MIN = 13;

/** Dari zoom ini dipakai bentuk lengkap (petak); di bawahnya isi ringkas. */
export const PERSIL_ZOOM_RINCI = 15;

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
 *   peta: { versi, ukuranPetak, ukuranRingkas, warna, kecamatan: string[], tersembunyi: string[], kunci } | null
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
      ukuranPetak: ukuran.petak,
      ukuranRingkas: ukuran.ringkas,
      warna: Object.fromEntries(kecamatan.map((k) => [k.nama, k.warna])),
      kecamatan: kecamatan.map((k) => k.nama),
      tersembunyi: sembunyi,
      kunci: `${versi}|${ukuran.petak}|${ukuran.ringkas}|${sembunyi.join(",")}`,
    };
  }, [ada, nyala, versi, ukuran, kecamatan]);

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

/** Petak data (bentuk lengkap), dari simpanan bila sudah pernah diunduh. Urutan simpanan = terakhir dipakai. */
const muatPetak = (versi, i, j) =>
  muatDenganSimpanan(simpanan, PETAK_SIMPAN_MAKS, `${versi}|${i},${j}`, () =>
    api.petakPersil(i, j, versi).then(uraiPetak)
  );

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
 *     kotak: Int32Array [x min, y min, x maks, y maks] tiap cincin }
 */
export function uraiRingkas(isi) {
  const d = isi.bidang || [];
  const besar = isi.besar || [];
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
  for (let k = 0; k < d.length; ) {
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
  return { nama: isi.kecamatan || [], asal: isi.asal || [0, 0], n: nC, xy, awal, ki, id, kotak };
}

/** Muat satu unduhan bersama penghitung status (memuat / galat) dan simpanan LRU. */
function muatDenganSimpanan(simpananIni, maks, kunci, ambil) {
  const ada = simpananIni.get(kunci);
  if (ada) {
    simpananIni.delete(kunci);
    simpananIni.set(kunci, ada);
    return ada;
  }
  sedangDimuat++;
  lapor();
  const janji = ambil()
    .then(
      (hasil) => {
        galatTerakhir = "";
        return hasil;
      },
      (e) => {
        // Dicoba lagi saat ubinnya diminta lagi.
        simpananIni.delete(kunci);
        galatTerakhir = e.message || "Persil gagal dimuat.";
        throw e;
      }
    )
    .finally(() => {
      sedangDimuat--;
      lapor();
    });
  simpananIni.set(kunci, janji);
  while (simpananIni.size > maks) simpananIni.delete(simpananIni.keys().next().value);
  return janji;
}

const muatRingkas = (versi, i, j) =>
  muatDenganSimpanan(simpananRingkas, RINGKAS_SIMPAN_MAKS, `${versi}|${i},${j}`, () =>
    api.ringkasPersil(i, j, versi).then(uraiRingkas)
  );

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
  15: { garis: 0.55, tembusGaris: 0.95, tembusIsi: 0.07 },
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
  const jalur = z < PERSIL_ZOOM_RINCI ? await jalurRingkas(batas, { x, y, n }, cfg, jenis) : await jalurRinci(batas, { x, y, n }, cfg, jenis);
  if (batal()) return;
  gambarJalur(ubin, jalur, z);
}

/*
 * TUTUP_CINCIN: cincin ditutup dengan garis ke titik awalnya, bukan
 * closePath(). Di Chrome, closePath() pada Path2D berisi ribuan subjalur makin
 * lambat seiring panjang jalurnya: menggambar Banjarbaru di zoom 13 memakan
 * ±17 detik di closePath saja (diukur 2026-11-06), dengan lineTo ±20 ms.
 * Isian tetap benar karena fill() menutup setiap subjalur sendiri.
 */

/** Path2D untuk satu warna (dibuat saat pertama dibutuhkan). */
function jalurUntuk(jalur, warna) {
  let p = jalur.get(warna);
  if (!p) jalur.set(warna, (p = new Path2D()));
  return p;
}

/** Jalur per warna dari petak bentuk lengkap (zoom 15 ke atas). */
async function jalurRinci({ barat, timur, utara, selatan }, { x, y, n }, cfg, jenis) {
  const g = cfg.ukuranPetak;

  const tunggu = [];
  for (let i = Math.floor(barat / g); i <= Math.floor(timur / g); i++) {
    for (let j = Math.floor(selatan / g); j <= Math.floor(utara / g); j++) tunggu.push(muatPetak(cfg.versi, i, j));
  }
  const petak = await Promise.all(tunggu);

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
      const p = jalurUntuk(jalur, warnaDi(cfg.warna, b.kec, jenis));
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
 * Jalur per warna dari isi ringkas (zoom 13-14). Bidang kecil hanya ada di sel
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
  const jalur = new Map();
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
      const warna = warnaSel[sel.ki[c]];
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
function gambarJalur(ubin, jalur, z) {
  const gaya = gayaZoom(z);
  const ctx = ubin.getContext("2d");
  const dpr = ubin.width / UKURAN_UBIN;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, UKURAN_UBIN, UKURAN_UBIN);
  ctx.lineWidth = gaya.garis;
  ctx.lineJoin = "round";
  for (const [warna, p] of jalur) {
    ctx.fillStyle = warna;
    ctx.strokeStyle = warna;
    ctx.globalAlpha = gaya.tembusIsi;
    ctx.fill(p, "evenodd");
    ctx.globalAlpha = gaya.tembusGaris;
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

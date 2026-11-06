"use strict";

/**
 * Persil (bidang tanah) dari peta pendaftaran BPN.
 *
 * Browser admin membaca shapefile-nya, mengubah koordinatnya ke derajat WGS 84,
 * lalu mengirimnya bertahap (client/src/lib/shapefile.js). Di sini kiriman itu
 * diperiksa ulang dan disimpan, lalu dipakai dalam tiga bentuk:
 *   - petak peta: bidang di satu petak ±550 m, dimuat Peta Sensus saat diperbesar;
 *   - bidang di sebuah titik: NIB tempat titik sensus berada (layar data, ekspor);
 *   - pencarian NIB.
 *
 * Petak: setiap bidang dicatat petak sudut barat dayanya (sel_lat, sel_lon).
 * Bidang yang tidak lebih besar dari satu petak hanya bisa menyentuh petaknya
 * sendiri dan petak di utara / timurnya, jadi bidang di sebuah kotak cukup
 * dicari di petak-petak itu lewat indeks. Bidang yang lebih besar (sawah, kebun,
 * ±0,4% data Banjarbaru) ditandai `besar` dan dicari tanpa petak.
 */

const crypto = require("crypto");
const prisma = require("./prisma");
const { badRequest } = require("./http");
const { WILAYAH } = require("./batas");

/** Sisi petak, derajat (±550 m). Petak terpadat di Banjarbaru berisi ±1.400 bidang. */
const UKURAN_PETAK = 0.005;

/*
 * Peta yang diperkecil (zoom 13-14) memakai isi ringkas per sel 4 × 4 petak
 * (±2,2 km): koordinat dibulatkan ke 1e-5 derajat (±1,1 m), garis
 * disederhanakan ±3 m, dan ditulis sebagai selisih antartitik. Di zoom itu
 * satu piksel ±10-20 m, jadi bedanya tidak terlihat, sedangkan isinya jauh
 * lebih kecil - seluruh kota terlihat sekaligus di zoom 13.
 */
const PETAK_PER_RINGKAS = 4;
const UKURAN_RINGKAS = UKURAN_PETAK * PETAK_PER_RINGKAS;
const SATUAN_RINGKAS = 1e5;
const TOLERANSI_RINGKAS = 3;

/** Bidang paling banyak per kiriman impor. Browser mengirim ±1 MB sekali kirim (batas JSON server 2 MB). */
const KIRIM_MAKS = 3000;

/** Atribut tambahan paling banyak per bidang, dan panjang nama / isinya. */
const ATRIBUT_MAKS = 30;
const NAMA_ATRIBUT_MAKS = 40;
const ISI_ATRIBUT_MAKS = 200;

/** Geometri satu bidang paling besar (byte JSON). Bidang terumit di data BPN Banjarbaru ±800 titik sudut, ±20 KB. */
const GEOMETRI_MAKS = 512 * 1024;

/** Impor yang tidak diselesaikan selama ini dianggap ditinggalkan: bidangnya dibuang saat impor berikutnya dimulai. */
const IMPOR_KEDALUWARSA_MS = 6 * 3600 * 1000;

const TOKEN_IMPOR = /^[a-f0-9]{24}$/;

const teks = (v, maks) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maks);

const bulat = (n, desimal = 6) => {
  const f = 10 ** desimal;
  return Math.round(n * f) / f;
};

/** Jarak kasar (km) dari pusat wilayah - cukup untuk menolak koordinat yang jatuh ratusan km jauhnya. */
function jarakKm(lat, lon, pusat = WILAYAH) {
  const dLat = (lat - pusat.lat) * 111.32;
  const dLon = (lon - pusat.lon) * 111.32 * Math.cos((pusat.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

/* ---------- geometri ---------- */

/**
 * Satu cincin -> [[bujur, lintang], ...] bulat 6 desimal (±11 cm) dan tertutup,
 * atau null bila ada yang bukan angka / titik berbedanya kurang dari tiga.
 * Titik yang kembar setelah dibulatkan dibuang.
 */
function rapikanCincin(c) {
  if (!Array.isArray(c)) return null;
  const hasil = [];
  for (const p of c) {
    if (!Array.isArray(p) || p.length < 2) return null;
    const [lon, lat] = p;
    if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) {
      return null;
    }
    const b = [bulat(lon), bulat(lat)];
    const akhir = hasil[hasil.length - 1];
    if (!akhir || akhir[0] !== b[0] || akhir[1] !== b[1]) hasil.push(b);
  }
  if (hasil.length > 1) {
    const [awal, akhir] = [hasil[0], hasil[hasil.length - 1]];
    if (awal[0] !== akhir[0] || awal[1] !== akhir[1]) hasil.push([awal[0], awal[1]]);
  }
  return hasil.length >= 4 ? hasil : null;
}

/** [cincin luar, lubang...] -> versi rapi; lubang yang rusak dibuang, cincin luar yang rusak = null. */
function rapikanPoligon(p) {
  if (!Array.isArray(p) || p.length === 0) return null;
  const luar = rapikanCincin(p[0]);
  if (!luar) return null;
  return [luar, ...p.slice(1).map(rapikanCincin).filter(Boolean)];
}

/** Geometri bidang (Polygon / MultiPolygon) -> versi rapi, atau null. */
function rapikanGeometri(g) {
  if (!g || typeof g !== "object" || !Array.isArray(g.coordinates)) return null;
  if (g.type === "Polygon") {
    const p = rapikanPoligon(g.coordinates);
    return p ? { type: "Polygon", coordinates: p } : null;
  }
  if (g.type === "MultiPolygon") {
    const isi = g.coordinates.map(rapikanPoligon).filter(Boolean);
    if (isi.length === 0) return null;
    return isi.length === 1 ? { type: "Polygon", coordinates: isi[0] } : { type: "MultiPolygon", coordinates: isi };
  }
  return null;
}

/** Daftar poligon sebuah geometri: Polygon -> [coordinates], MultiPolygon -> coordinates. */
const poligonDari = (g) => (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []);

/** Kotak pembatas geometri: { minLat, minLon, maxLat, maxLon }. */
function kotakGeometri(g) {
  const k = { minLat: Infinity, minLon: Infinity, maxLat: -Infinity, maxLon: -Infinity };
  for (const p of poligonDari(g)) {
    for (const c of p) {
      for (const [lon, lat] of c) {
        if (lat < k.minLat) k.minLat = lat;
        if (lat > k.maxLat) k.maxLat = lat;
        if (lon < k.minLon) k.minLon = lon;
        if (lon > k.maxLon) k.maxLon = lon;
      }
    }
  }
  return k;
}

/** Titik di dalam satu cincin (aturan ganjil-genap). */
function dalamCincin(c, lon, lat) {
  let dalam = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, yi] = c[i];
    const [xj, yj] = c[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dalam = !dalam;
  }
  return dalam;
}

/** Titik di dalam bidang: di dalam cincin luar sebuah poligonnya dan tidak di lubangnya. */
function titikDalam(g, lon, lat) {
  return poligonDari(g).some((p) => p.reduce((dalam, c) => (dalamCincin(c, lon, lat) ? !dalam : dalam), false));
}

/* ---------- kiriman impor ---------- */

/** Atribut tambahan dari berkas: teks / angka / ya-tidak saja, nama dan isinya dibatasi. */
function rapikanAtribut(a) {
  const hasil = {};
  if (!a || typeof a !== "object" || Array.isArray(a)) return hasil;
  for (const [k, v] of Object.entries(a)) {
    if (Object.keys(hasil).length >= ATRIBUT_MAKS) break;
    const nama = teks(k, NAMA_ATRIBUT_MAKS);
    if (!nama || nama === "__proto__") continue;
    if (typeof v === "number" && Number.isFinite(v)) hasil[nama] = bulat(v, 3);
    else if (typeof v === "boolean") hasil[nama] = v;
    else if (typeof v === "string" && teks(v, ISI_ATRIBUT_MAKS)) hasil[nama] = teks(v, ISI_ATRIBUT_MAKS);
  }
  return hasil;
}

/**
 * Kunci penggantian saat impor ulang: kode wilayah BPN bila ada, nama
 * kecamatan + kelurahan bila tidak, nama berkasnya bila keduanya kosong.
 */
function kunciWilayah({ kodeWilayah, kecamatan, kelurahan }, sumber = "") {
  if (kodeWilayah) return `kode:${kodeWilayah}`;
  if (kecamatan || kelurahan) return `nama:${kecamatan.toLowerCase()}|${kelurahan.toLowerCase()}`.slice(0, 250);
  return `berkas:${teks(sumber, 200).toLowerCase() || "tanpa nama"}`;
}

/**
 * Satu bidang kiriman browser -> { data } siap simpan, atau { alasan } bila ditolak.
 *
 * Bentuk kiriman: { nib, kodeWilayah, kecamatan, kelurahan, tipeHak, luasPeta,
 * atribut: {}, geometri: Polygon | MultiPolygon berderajat WGS 84 }.
 * Bidang di luar wilayah kerja ditolak: browser seharusnya sudah membuangnya,
 * dan yang lolos ke sini hampir pasti salah sistem koordinat.
 */
function bacaFiturImpor(f, sumber = "") {
  if (!f || typeof f !== "object") return { alasan: "bukan bidang" };
  const geometri = rapikanGeometri(f.geometri);
  if (!geometri) return { alasan: "tanpa bentuk" };
  const k = kotakGeometri(geometri);
  if (jarakKm(k.minLat, k.minLon) > WILAYAH.radiusKm || jarakKm(k.maxLat, k.maxLon) > WILAYAH.radiusKm) {
    return { alasan: "di luar wilayah" };
  }
  const json = JSON.stringify(geometri);
  if (json.length > GEOMETRI_MAKS) return { alasan: "terlalu rumit" };

  const luas = typeof f.luasPeta === "number" ? f.luasPeta : Number.NaN;
  const dasar = {
    nib: teks(f.nib, 30),
    kodeWilayah: teks(f.kodeWilayah, 20).replace(/\s/g, ""),
    kecamatan: teks(f.kecamatan, 100),
    kelurahan: teks(f.kelurahan, 100),
    tipeHak: teks(f.tipeHak, 60),
  };
  return {
    data: {
      ...dasar,
      luasPeta: Number.isFinite(luas) && luas >= 0 ? bulat(luas, 2) : null,
      atribut: JSON.stringify(rapikanAtribut(f.atribut)),
      geometri: json,
      ...k,
      selLat: Math.floor(k.minLat / UKURAN_PETAK),
      selLon: Math.floor(k.minLon / UKURAN_PETAK),
      besar: k.maxLat - k.minLat > UKURAN_PETAK || k.maxLon - k.minLon > UKURAN_PETAK,
      kunciWilayah: kunciWilayah(dasar, sumber),
    },
  };
}

/**
 * Isi satu kiriman: { sumber: nama berkas, fitur: [...] } ->
 * { baris: data siap simpan, ditolak: { alasan: jumlah } }.
 */
function bacaKiriman(body) {
  const fitur = body && Array.isArray(body.fitur) ? body.fitur : null;
  if (!fitur || fitur.length === 0) throw badRequest("Kiriman tidak berisi bidang.");
  if (fitur.length > KIRIM_MAKS) throw badRequest(`Paling banyak ${KIRIM_MAKS} bidang sekali kirim.`);
  const sumber = teks(body.sumber, 200);
  const baris = [];
  const ditolak = {};
  for (const f of fitur) {
    const h = bacaFiturImpor(f, sumber);
    if (h.data) baris.push(h.data);
    else ditolak[h.alasan] = (ditolak[h.alasan] || 0) + 1;
  }
  return { baris, ditolak };
}

/** Token impor dari parameter rute. */
function bacaToken(nilai) {
  const t = String(nilai || "");
  if (!TOKEN_IMPOR.test(t)) throw badRequest("Token impor tidak sah.");
  return t;
}

/* ---------- NIB ---------- */

/**
 * NIB lengkap untuk ditampilkan: kode wilayah 8 digit + NIB 5 digit ->
 * "17.11.74.02.03612". Selain bentuk itu: digabung titik, atau NIB-nya saja.
 */
function nibLengkap(kodeWilayah, nib) {
  if (/^\d{8}$/.test(kodeWilayah) && /^\d{5}$/.test(nib)) {
    return `${kodeWilayah.replace(/(\d{2})(?=\d)/g, "$1.")}.${nib}`;
  }
  return kodeWilayah && nib ? `${kodeWilayah}.${nib}` : nib;
}

/**
 * Ketikan pencarian NIB -> syarat pencarian, atau null bila kosong.
 *   - 13 digit = NIB lengkap (kode wilayah 8 + NIB 5);
 *   - lebih pendek = NIB saja, dengan dan tanpa nol di depan ("3612" = "03612").
 * Titik, spasi, dan tanda lain diabaikan.
 */
function bacaKueriNib(q) {
  const angka = String(q ?? "").replace(/\D/g, "");
  if (!angka) return null;
  if (angka.length > 13) throw badRequest("Ketik NIB 5 digit, atau NIB lengkap 13 digit.");
  if (angka.length === 13) return { kodeWilayah: angka.slice(0, 8), nib: [angka.slice(8)] };
  const varian = new Set([angka, angka.padStart(5, "0"), angka.replace(/^0+(?=\d)/, "")]);
  return { nib: [...varian] };
}

/* ---------- bentuk keluaran ---------- */

const bacaAtribut = (s) => {
  try {
    const a = JSON.parse(s || "{}");
    return a && typeof a === "object" && !Array.isArray(a) ? a : {};
  } catch {
    return {};
  }
};

/** Keterangan sebuah bidang, tanpa bentuknya. */
const bentukInfo = (p) => ({
  id: p.id,
  nib: p.nib,
  nibLengkap: nibLengkap(p.kodeWilayah, p.nib),
  kodeWilayah: p.kodeWilayah,
  kecamatan: p.kecamatan,
  kelurahan: p.kelurahan,
  tipeHak: p.tipeHak,
  luasPeta: p.luasPeta,
});

/** Atribut balon peta: keterangan utama lalu atribut lain dari berkasnya. */
const propertiPeta = (p) => ({
  nib: nibLengkap(p.kodeWilayah, p.nib),
  tipeHak: p.tipeHak,
  luasPeta: p.luasPeta,
  kelurahan: p.kelurahan,
  kecamatan: p.kecamatan,
  lain: bacaAtribut(p.atribut),
});

/** Satu bidang sebagai Feature GeoJSON (teks). Geometrinya sudah JSON di database: tidak diurai ulang. */
const teksFitur = (p) =>
  `{"type":"Feature","id":${p.id},"geometry":${p.geometri},"properties":${JSON.stringify(propertiPeta(p))}}`;

/**
 * Koordinat geometri tersimpan sebagai daftar poligon (bentuk MultiPolygon),
 * teks. Geometri ditulis rapikanGeometri sebagai {"type":..,"coordinates":..},
 * jadi cukup dipotong; bentuk lain (tidak semestinya ada) diurai.
 */
function teksPoligon(geometri) {
  const POLY = '{"type":"Polygon","coordinates":';
  const MULTI = '{"type":"MultiPolygon","coordinates":';
  if (geometri.startsWith(POLY)) return `[${geometri.slice(POLY.length, -1)}]`;
  if (geometri.startsWith(MULTI)) return geometri.slice(MULTI.length, -1);
  try {
    return JSON.stringify(poligonDari(JSON.parse(geometri)));
  } catch {
    return "[]";
  }
}

/**
 * Isi satu petak peta, ringkas - hanya yang dibutuhkan untuk menggambar:
 * { kecamatan: [nama...], bidang: [[id, indeks kecamatan, poligon-poligon], ...] }.
 * Keterangan bidang (NIB, luas, ...) diambil saat bidangnya diketuk (cariDiTitik).
 */
function teksPetak(daftar) {
  const indeks = new Map();
  const bidang = daftar.map((p) => {
    if (!indeks.has(p.kecamatan)) indeks.set(p.kecamatan, indeks.size);
    return `[${p.id},${indeks.get(p.kecamatan)},${teksPoligon(p.geometri)}]`;
  });
  return `{"kecamatan":${JSON.stringify([...indeks.keys()])},"bidang":[${bidang.join(",")}]}`;
}

/* ---------- isi ringkas (peta diperkecil) ---------- */

/** Kuadrat jarak titik p ke ruas a-b. */
function jarak2Ruas([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2)) : 0;
  const ex = x1 + t * dx - x;
  const ey = y1 + t * dy - y;
  return ex * ex + ey * ey;
}

/** Douglas-Peucker untuk garis terbuka: titik yang menyimpang > `toleransi` dipertahankan. */
function sederhanakanGaris(titik, toleransi) {
  const n = titik.length;
  if (n <= 2) return titik.slice();
  const tol2 = toleransi * toleransi;
  const simpan = new Uint8Array(n);
  simpan[0] = simpan[n - 1] = 1;
  const tumpuk = [[0, n - 1]];
  while (tumpuk.length) {
    const [a, b] = tumpuk.pop();
    let maks = -1;
    let k = -1;
    for (let i = a + 1; i < b; i++) {
      const d = jarak2Ruas(titik[i], titik[a], titik[b]);
      if (d > maks) {
        maks = d;
        k = i;
      }
    }
    if (maks > tol2) {
      simpan[k] = 1;
      tumpuk.push([a, k], [k, b]);
    }
  }
  return titik.filter((_, i) => simpan[i]);
}

/**
 * Cincin bilangan bulat -> cincin yang disederhanakan, tanpa titik penutup.
 * Cincin dipotong di titik terjauh dari titik awalnya supaya Douglas-Peucker
 * punya dua ujung yang berbeda.
 */
function sederhanakanCincin(c, toleransi) {
  const r = [];
  for (const p of c) {
    const a = r[r.length - 1];
    if (!a || a[0] !== p[0] || a[1] !== p[1]) r.push(p);
  }
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
  if (r.length <= 4) return r;
  let jauh = 1;
  let maks = -1;
  for (let i = 1; i < r.length; i++) {
    const d = (r[i][0] - r[0][0]) ** 2 + (r[i][1] - r[0][1]) ** 2;
    if (d > maks) {
      maks = d;
      jauh = i;
    }
  }
  const a = sederhanakanGaris(r.slice(0, jauh + 1), toleransi);
  const b = sederhanakanGaris([...r.slice(jauh), r[0]], toleransi);
  return [...a, ...b.slice(1, -1)];
}

/**
 * Isi ringkas satu sel (i, j berukuran UKURAN_RINGKAS):
 *   { kecamatan: [nama], asal: [x0, y0],
 *     bidang: [indeks kecamatan, n, dx, dy, dx, dy, ...] berurutan - satu cincin luar per
 *             bidang kecil; titik pertama relatif ke titik pertama cincin sebelumnya
 *             (cincin pertama: ke `asal`), titik berikutnya relatif ke titik sebelumnya,
 *     besar:  [[id, indeks kecamatan, [x, y, dx, dy, ...], ...]] - bidang `besar`, per
 *             cincin luar, relatif ke `asal` }
 * Satuan 1e-5 derajat. Bidang kecil hanya masuk sel tempat sudut barat dayanya
 * (tidak pernah ganda); bidang besar bisa menjangkau beberapa sel, jadi masuk
 * setiap sel yang disentuhnya dan dibedakan dengan id.
 */
function teksRingkas(daftar, i, j) {
  const x0 = Math.round(i * UKURAN_RINGKAS * SATUAN_RINGKAS);
  const y0 = Math.round(j * UKURAN_RINGKAS * SATUAN_RINGKAS);
  const indeks = new Map();
  const bidang = [];
  const besar = [];
  let px = 0;
  let py = 0;
  for (const p of daftar) {
    if (!p.besar && (Math.floor(p.selLat / PETAK_PER_RINGKAS) !== j || Math.floor(p.selLon / PETAK_PER_RINGKAS) !== i)) {
      continue;
    }
    if (!indeks.has(p.kecamatan)) indeks.set(p.kecamatan, indeks.size);
    const ki = indeks.get(p.kecamatan);
    let g;
    try {
      g = JSON.parse(p.geometri);
    } catch {
      continue;
    }
    const cincinBesar = [];
    for (const poligon of poligonDari(g)) {
      const bulat = (poligon[0] || []).map(([lon, lat]) => [
        Math.round(lon * SATUAN_RINGKAS) - x0,
        Math.round(lat * SATUAN_RINGKAS) - y0,
      ]);
      const c = sederhanakanCincin(bulat, TOLERANSI_RINGKAS);
      if (c.length < 3) continue;
      if (p.besar) {
        const kode = [c[0][0], c[0][1]];
        for (let k = 1; k < c.length; k++) kode.push(c[k][0] - c[k - 1][0], c[k][1] - c[k - 1][1]);
        cincinBesar.push(`[${kode.join(",")}]`);
      } else {
        bidang.push(ki, c.length, c[0][0] - px, c[0][1] - py);
        for (let k = 1; k < c.length; k++) bidang.push(c[k][0] - c[k - 1][0], c[k][1] - c[k - 1][1]);
        [px, py] = c[0];
      }
    }
    if (cincinBesar.length) besar.push(`[${p.id},${ki},${cincinBesar.join(",")}]`);
  }
  return (
    `{"kecamatan":${JSON.stringify([...indeks.keys()])},"asal":[${x0},${y0}],` +
    `"bidang":[${bidang.join(",")}],"besar":[${besar.join(",")}]}`
  );
}

/** Bidang untuk disorot di peta: keterangan + kotak + Feature GeoJSON. */
const bentukSorot = (p) => ({
  ...bentukInfo(p),
  batas: [p.minLon, p.minLat, p.maxLon, p.maxLat],
  fitur: JSON.parse(teksFitur(p)),
});

/* ---------- database ---------- */

const PILIH_PETA = {
  id: true,
  nib: true,
  kodeWilayah: true,
  kecamatan: true,
  kelurahan: true,
  tipeHak: true,
  luasPeta: true,
  atribut: true,
  geometri: true,
  minLat: true,
  minLon: true,
  maxLat: true,
  maxLon: true,
};

/** Untuk petak peta: cukup bentuk dan kecamatannya. */
const PILIH_PETAK = { id: true, kecamatan: true, geometri: true };

/** Petak berisi titik ini. */
const petakTitik = (lat, lon) => ({ i: Math.floor(lon / UKURAN_PETAK), j: Math.floor(lat / UKURAN_PETAK) });

/** Batas petak (i = kolom bujur, j = baris lintang). */
const batasPetak = (i, j) => ({
  s: j * UKURAN_PETAK,
  n: (j + 1) * UKURAN_PETAK,
  w: i * UKURAN_PETAK,
  e: (i + 1) * UKURAN_PETAK,
});

const rentang = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

/**
 * Bidang aktif yang kotaknya bersinggungan dengan kotak { s, n, w, e } (derajat).
 * Kotak dianggap kecil (satu petak atau satu titik). Satu petak ke selatan /
 * barat ikut diperiksa: bidang kecil yang menjulur masuk dari sana.
 */
async function bidangDiKotak({ s, n, w, e }, pilih = PILIH_PETA) {
  const potong = { minLat: { lte: n }, maxLat: { gte: s }, minLon: { lte: e }, maxLon: { gte: w } };
  const selLat = rentang(Math.floor(s / UKURAN_PETAK) - 1, Math.floor(n / UKURAN_PETAK));
  const selLon = rentang(Math.floor(w / UKURAN_PETAK) - 1, Math.floor(e / UKURAN_PETAK));
  const [kecil, besar] = await Promise.all([
    prisma.persil.findMany({
      where: { aktif: true, besar: false, selLat: { in: selLat }, selLon: { in: selLon }, ...potong },
      select: pilih,
      orderBy: { id: "asc" },
    }),
    prisma.persil.findMany({ where: { aktif: true, besar: true, ...potong }, select: pilih, orderBy: { id: "asc" } }),
  ]);
  return kecil.concat(besar);
}

/** Bidang di satu petak peta (`pilih` bawaan: lengkap, untuk pencarian titik). */
const bidangDiPetak = (i, j, pilih = PILIH_PETA) => bidangDiKotak(batasPetak(i, j), pilih);

/** Isi petak peta siap kirim (teksPetak). */
const petakPeta = async (i, j) => teksPetak(await bidangDiPetak(i, j, PILIH_PETAK));

/*
 * Isi ringkas sel disimpan di memori: seluruh Banjarbaru ±130 sel, beberapa
 * MB, dan menyusunnya membaca geometri ribuan bidang. Dikosongkan setiap
 * persil berubah (impor selesai, hapus) - aplikasi berjalan satu proses.
 */
const simpananRingkas = new Map(); // "i,j" -> Promise<string>
const SIMPANAN_RINGKAS_MAKS = 400;

/** Isi ringkas satu sel peta siap kirim (teksRingkas). */
function ringkasPeta(i, j) {
  const kunci = `${i},${j}`;
  let janji = simpananRingkas.get(kunci);
  if (!janji) {
    const kotak = {
      s: j * UKURAN_RINGKAS,
      n: (j + 1) * UKURAN_RINGKAS,
      w: i * UKURAN_RINGKAS,
      e: (i + 1) * UKURAN_RINGKAS,
    };
    janji = bidangDiKotak(kotak, { id: true, kecamatan: true, geometri: true, selLat: true, selLon: true, besar: true }).then(
      (daftar) => teksRingkas(daftar, i, j)
    );
    simpananRingkas.set(kunci, janji);
    janji.catch(() => simpananRingkas.get(kunci) === janji && simpananRingkas.delete(kunci));
    while (simpananRingkas.size > SIMPANAN_RINGKAS_MAKS) simpananRingkas.delete(simpananRingkas.keys().next().value);
  }
  return janji;
}

/**
 * Dari bidang-bidang calon, yang memuat titik ini. Bila bertumpuk (data BPN
 * kadang tumpang tindih), yang terkecil: biasanya pecahan yang lebih baru.
 */
function pilihDiTitik(calon, lat, lon) {
  let terpilih = null;
  let luasTerpilih = Infinity;
  for (const p of calon) {
    if (lat < p.minLat || lat > p.maxLat || lon < p.minLon || lon > p.maxLon) continue;
    let g;
    try {
      g = JSON.parse(p.geometri);
    } catch {
      continue;
    }
    if (!titikDalam(g, lon, lat)) continue;
    const luas = p.luasPeta ?? (p.maxLat - p.minLat) * (p.maxLon - p.minLon) * 1e10;
    if (luas < luasTerpilih) {
      terpilih = p;
      luasTerpilih = luas;
    }
  }
  return terpilih;
}

/**
 * Bidang tempat titik ini berada: bentukInfo, atau null. `bentuk` = sertakan
 * kotak dan Feature-nya (bentukSorot), untuk menyorot bidang yang diketuk di peta.
 */
async function cariDiTitik(lat, lon, { bentuk = false } = {}) {
  const p = pilihDiTitik(await bidangDiKotak({ s: lat, n: lat, w: lon, e: lon }), lat, lon);
  if (!p) return null;
  return bentuk ? bentukSorot(p) : bentukInfo(p);
}

/** Sudah ada persil aktif? */
async function adaPersil() {
  return Boolean(await prisma.persil.findFirst({ where: { aktif: true }, select: { id: true } }));
}

const kunciTitik = (lat, lon) => `${lat},${lon}`;

/** Jawaban Lokasi yang terisi: { lat, lon } berupa angka. */
const titikJawaban = (v) =>
  v && typeof v === "object" && Number.isFinite(v.lat) && Number.isFinite(v.lon) && Math.abs(v.lat) <= 90;

/**
 * Pencari bidang untuk ekspor: semua titik Lokasi di `entri` dicari sekaligus,
 * per petak, sebelum tabel disusun (penyusun tabelnya tidak asinkron).
 *
 * @param {{ jawaban?: { nilai: any }[] }[]} entri
 * @returns {Promise<null | ((lat: number, lon: number) => object | null)>}
 *          null bila belum ada persil sama sekali - ekspor lalu tanpa kolom BPN
 */
async function pencariPersilEkspor(entri) {
  if (!(await adaPersil())) return null;

  const perPetak = new Map(); // "i,j" -> { i, j, titik: [[lat, lon]] }
  const dilihat = new Set();
  for (const e of entri) {
    for (const j of e.jawaban || []) {
      const v = j.nilai;
      if (!titikJawaban(v)) continue;
      const k = kunciTitik(v.lat, v.lon);
      if (dilihat.has(k)) continue;
      dilihat.add(k);
      const p = petakTitik(v.lat, v.lon);
      const kp = `${p.i},${p.j}`;
      if (!perPetak.has(kp)) perPetak.set(kp, { ...p, titik: [] });
      perPetak.get(kp).titik.push([v.lat, v.lon]);
    }
  }

  // Satu petak sekali query, berurutan: bidangnya dibuang sebelum petak
  // berikutnya dimuat, supaya ekspor seluruh data tidak menumpuk memori.
  const hasil = new Map();
  for (const { i, j, titik } of perPetak.values()) {
    const calon = await bidangDiPetak(i, j);
    for (const [lat, lon] of titik) {
      const p = pilihDiTitik(calon, lat, lon);
      if (p) hasil.set(kunciTitik(lat, lon), bentukInfo(p));
    }
  }
  return (lat, lon) => hasil.get(kunciTitik(lat, lon)) || null;
}

/**
 * Ringkasan persil tersimpan: { jumlah, versi, wilayah: [{ kunci, kodeWilayah,
 * kecamatan, kelurahan, jumlah, diimpor, oleh }], sel: [[i, j]] }. `versi`
 * berganti setiap isi berubah - kunci cache petak di browser. `sel` = sel
 * ringkas berisi bidang, yang diunduh browser di belakang (lib/persilBpn.js).
 */
async function ringkasan() {
  // Hitungan per wilayah cukup dari indeks (aktif, kunci_wilayah, id); nama
  // dan waktu impornya diambil dari satu bidang contoh per wilayah. Mengambil
  // _max nama langsung di groupBy membaca seluruh baris: ±1 detik per 200 ribu bidang.
  const kelompok = await prisma.persil.groupBy({
    by: ["kunciWilayah"],
    where: { aktif: true },
    _count: { _all: true },
    _max: { id: true },
  });
  const contoh = new Map(
    (
      await prisma.persil.findMany({
        where: { id: { in: kelompok.map((k) => k._max.id) } },
        select: { id: true, kodeWilayah: true, kecamatan: true, kelurahan: true, createdAt: true, dibuatOleh: true },
      })
    ).map((p) => [p.id, p])
  );
  const wilayah = kelompok
    .map((k) => {
      const p = contoh.get(k._max.id) || {};
      return {
        kunci: k.kunciWilayah,
        kodeWilayah: p.kodeWilayah || "",
        kecamatan: p.kecamatan || "",
        kelurahan: p.kelurahan || "",
        jumlah: k._count._all,
        diimpor: p.createdAt || null,
        oleh: p.dibuatOleh || "",
      };
    })
    .sort((a, b) => a.kecamatan.localeCompare(b.kecamatan) || a.kelurahan.localeCompare(b.kelurahan));
  const jumlah = wilayah.reduce((n, w) => n + w.jumlah, 0);
  const idMaks = Math.max(0, ...kelompok.map((k) => k._max.id || 0));
  return { jumlah, versi: `${jumlah}-${idMaks}`, wilayah, sel: jumlah ? await daftarSelRingkas() : [] };
}

/** Bidang dengan NIB yang dicari, paling banyak 20: bentukInfo + kotak + geometri. */
async function cariNib(q) {
  const syarat = bacaKueriNib(q);
  if (!syarat) return [];
  const daftar = await prisma.persil.findMany({
    where: {
      aktif: true,
      nib: { in: syarat.nib },
      ...(syarat.kodeWilayah ? { kodeWilayah: syarat.kodeWilayah } : {}),
    },
    select: PILIH_PETA,
    orderBy: [{ kecamatan: "asc" }, { kelurahan: "asc" }, { id: "asc" }],
    take: 20,
  });
  return daftar.map(bentukSorot);
}

let simpananSel = null; // Promise<[[i, j]]>: sel ringkas yang berisi bidang

/**
 * Daftar sel ringkas [[i, j], ...] yang memuat sudut barat daya bidang - untuk
 * menyiapkan peta sekota di belakang (server: hangatkanRingkas; browser:
 * ringkasan().sel). Disimpan sampai persil berubah.
 */
function daftarSelRingkas() {
  if (!simpananSel) {
    const janji = prisma.$queryRaw`
      SELECT DISTINCT FLOOR(sel_lat / ${PETAK_PER_RINGKAS}) AS j, FLOOR(sel_lon / ${PETAK_PER_RINGKAS}) AS i
      FROM persil WHERE aktif = 1`.then((r) => r.map(({ i, j }) => [Number(i), Number(j)]));
    simpananSel = janji;
    janji.catch(() => simpananSel === janji && (simpananSel = null));
  }
  return simpananSel;
}

/** Persil berubah (impor selesai, hapus): buang semua isi ringkas tersimpan, lalu siapkan lagi. */
function persilBerubah() {
  simpananRingkas.clear();
  simpananSel = null;
  hangatkanDiBelakang();
}

let menghangatkan = null; // Promise selama penghangatan berjalan
let hangatkanLagi = false;

/**
 * Susun isi ringkas semua sel di belakang layar, satu per satu, supaya
 * pembuka peta pertama sesudah server dinyalakan / persil berubah tidak ikut
 * menunggu penyusunannya. Dipanggil lagi saat masih berjalan = diulang sekali
 * setelah selesai (persilnya bisa sudah berubah lagi).
 */
function hangatkanRingkas() {
  if (menghangatkan) {
    hangatkanLagi = true;
    return menghangatkan;
  }
  menghangatkan = (async () => {
    do {
      hangatkanLagi = false;
      for (const [i, j] of await daftarSelRingkas()) await ringkasPeta(i, j);
    } while (hangatkanLagi);
  })().finally(() => {
    menghangatkan = null;
  });
  return menghangatkan;
}

/** hangatkanRingkas tanpa ditunggu; gagal cukup dicatat (sel disusun saat diminta). */
const hangatkanDiBelakang = () =>
  hangatkanRingkas().catch((e) => console.warn("[Sensus Pajak] penyiapan peta persil ringkas gagal:", e.message));

/* ---------- impor & hapus ---------- */

/** Mulai impor: buang sisa impor lama yang ditinggalkan, lalu beri token baru. */
async function mulaiImpor() {
  await prisma.persil.deleteMany({
    where: { aktif: false, createdAt: { lt: new Date(Date.now() - IMPOR_KEDALUWARSA_MS) } },
  });
  return crypto.randomBytes(12).toString("hex");
}

/** Simpan satu kiriman (tersembunyi sampai impornya selesai). */
async function simpanKiriman(token, body, oleh) {
  const { baris, ditolak } = bacaKiriman(body);
  if (baris.length) {
    await prisma.persil.createMany({ data: baris.map((b) => ({ ...b, impor: token, aktif: false, dibuatOleh: oleh })) });
  }
  return { diterima: baris.length, ditolak };
}

/**
 * Selesaikan impor: bidang lama di kelurahan yang ikut diimpor dibuang, bidang
 * impor ini ditampilkan - sekaligus dalam satu transaksi, supaya peta tidak
 * pernah kosong atau dobel di tengah jalan.
 */
async function selesaikanImpor(token) {
  const kunci = (
    await prisma.persil.findMany({ where: { impor: token }, distinct: ["kunciWilayah"], select: { kunciWilayah: true } })
  ).map((k) => k.kunciWilayah);
  if (kunci.length === 0) throw badRequest("Belum ada bidang yang terkirim untuk impor ini, atau impornya sudah kedaluwarsa.");
  const [lama, baru] = await prisma.$transaction([
    prisma.persil.deleteMany({ where: { aktif: true, kunciWilayah: { in: kunci } } }),
    prisma.persil.updateMany({ where: { impor: token }, data: { aktif: true } }),
  ]);
  persilBerubah();
  return { jumlah: baru.count, diganti: lama.count, wilayah: kunci.length };
}

/** Batalkan impor yang belum selesai: kirimannya dibuang. */
async function batalkanImpor(token) {
  await prisma.persil.deleteMany({ where: { impor: token, aktif: false } });
}

/** Hapus persil sejumlah wilayah (kunci dari ringkasan), atau semuanya. */
async function hapusPersil({ kunci, semua = false }) {
  const daftar = Array.isArray(kunci) ? kunci.map((k) => String(k)).filter(Boolean) : [];
  if (!semua && daftar.length === 0) throw badRequest("Pilih wilayah yang persilnya dihapus.");
  const hasil = semua
    ? await prisma.persil.deleteMany({})
    : await prisma.persil.deleteMany({ where: { aktif: true, kunciWilayah: { in: daftar } } });
  persilBerubah();
  return hasil.count;
}

module.exports = {
  UKURAN_PETAK,
  UKURAN_RINGKAS,
  KIRIM_MAKS,
  // murni - diuji di server/test/persil.test.js
  jarakKm,
  rapikanGeometri,
  kotakGeometri,
  titikDalam,
  rapikanAtribut,
  kunciWilayah,
  bacaFiturImpor,
  bacaKiriman,
  bacaToken,
  nibLengkap,
  bacaKueriNib,
  pilihDiTitik,
  petakTitik,
  batasPetak,
  teksPetak,
  sederhanakanCincin,
  teksRingkas,
  // database
  bidangDiPetak,
  petakPeta,
  ringkasPeta,
  hangatkanDiBelakang,
  cariDiTitik,
  adaPersil,
  pencariPersilEkspor,
  ringkasan,
  cariNib,
  mulaiImpor,
  simpanKiriman,
  selesaikanImpor,
  batalkanImpor,
  hapusPersil,
};

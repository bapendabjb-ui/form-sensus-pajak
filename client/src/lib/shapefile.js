/*
 * Pembaca shapefile persil BPN di browser admin (components/KelolaPersil.jsx).
 *
 * Shapefile dibaca di sini, bukan di server: berkas .dbf BPN bisa ratusan MB
 * (kolom teks 254 karakter yang sebagian besar spasi), jauh di atas batas
 * unggah server web. Browser membacanya sepotong-sepotong lalu mengirim
 * bidangnya sebagai GeoJSON ringkas (server/src/persil.js memeriksanya ulang).
 *
 * Sistem koordinat ditebak per bidang, bukan dipercaya dari .prj. Pada data BPN
 * Banjarbaru 2026: .prj Banjarbaru Utara bertuliskan UTM 50S padahal angkanya
 * TM-3 zona 50.1, tiga kecamatan tanpa .prj, dan satu kelurahan di berkas
 * Banjarbaru Selatan memakai UTM sementara kelurahan lain TM-3. Karena itu tiap
 * bidang dicoba dengan beberapa sistem koordinat (calonCrs) dan dipakai yang
 * pertama jatuh di wilayah kerja; pembacaan yang salah jatuh ratusan km jauhnya,
 * jadi tidak mungkin tertukar. Bidang yang tidak cocok dengan satu pun dilewati.
 *
 * Murni (tanpa React / DOM) supaya bisa diuji di Node: server/test/shapefile.test.js.
 */

/* ---------- proyeksi: Transverse Mercator (TM-3, UTM) -> derajat ---------- */

// Elipsoid WGS 84. DGN95 (datum BPN) memakai elipsoid yang sama, dan selisih
// datumnya terhadap WGS 84 di bawah ketelitian peta bidang.
const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const E1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
const RAD = Math.PI / 180;

/** Panjang busur meridian dari khatulistiwa sampai lintang `phi` (radian). */
function busurMeridian(phi) {
  return (
    A *
    ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi))
  );
}

/**
 * Koordinat Transverse Mercator (meter) -> [bujur, lintang] derajat. Rumus
 * Snyder (USGS Professional Paper 1395); di dalam satu zona TM-3 / UTM
 * selisihnya di bawah 1 mm.
 *
 * @param {{ lon0: number, k0: number, fe: number, fn: number, lat0?: number }} p
 *        meridian tengah, faktor skala, false easting / northing, lintang awal
 */
export function tmKeDerajat(x, y, { lon0, k0, fe, fn, lat0 = 0 }) {
  const m = busurMeridian(lat0 * RAD) + (y - fn) / k0;
  const mu = m / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));
  const p1 =
    mu +
    ((3 * E1) / 2 - (27 * E1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * E1 ** 2) / 16 - (55 * E1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * E1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * E1 ** 4) / 512) * Math.sin(8 * mu);
  const sin = Math.sin(p1);
  const cos = Math.cos(p1);
  const tan = Math.tan(p1);
  const c1 = EP2 * cos * cos;
  const t1 = tan * tan;
  const n1 = A / Math.sqrt(1 - E2 * sin * sin);
  const r1 = (A * (1 - E2)) / (1 - E2 * sin * sin) ** 1.5;
  const d = (x - fe) / (n1 * k0);
  const lat =
    p1 -
    ((n1 * tan) / r1) *
      (d ** 2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * EP2 - 3 * c1 ** 2) * d ** 6) / 720);
  const lon =
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * EP2 + 24 * t1 ** 2) * d ** 5) / 120) /
    cos;
  return [lon0 + lon / RAD, lat / RAD];
}

/* ---------- sistem koordinat ---------- */

/**
 * Isi berkas .prj (WKT) -> sistem koordinatnya:
 *   { nama, geografis: true }                       derajat
 *   { nama, lon0, k0, fe, fn, lat0, satuan, ... }   Transverse Mercator (TM-3, UTM)
 *   { nama, tidakDikenal: true }                    proyeksi lain
 * atau null bila kosong / tidak terbaca. `datumLain` = elipsoidnya bukan
 * WGS 84 / DGN95 (mis. ID74): bidangnya bisa bergeser puluhan meter.
 */
export function bacaPrj(teks) {
  const s = String(teks || "").trim();
  if (!s) return null;
  const sumbuA = /SPHEROID\["[^"]*",\s*([\d.eE+-]+)/i.exec(s);
  const datumLain = Boolean(sumbuA && Math.abs(Number(sumbuA[1]) - A) > 1);
  if (/^GEOGCS\[/i.test(s)) return { nama: /^GEOGCS\["([^"]*)"/i.exec(s)?.[1] || "Derajat", geografis: true, datumLain };
  if (!/^PROJCS\[/i.test(s)) return null;

  const nama = /^PROJCS\["([^"]*)"/i.exec(s)?.[1] || "";
  const proyeksi = /PROJECTION\["([^"]*)"/i.exec(s)?.[1] || "";
  if (!/^transverse_mercator$/i.test(proyeksi)) return { nama, tidakDikenal: true, datumLain };

  const param = (n) => {
    const m = new RegExp(`PARAMETER\\["${n}",\\s*([\\d.eE+-]+)\\]`, "i").exec(s);
    return m ? Number(m[1]) : null;
  };
  // Satuan panjang = UNIT terakhir di PROJCS (yang pertama milik GEOGCS, dalam derajat).
  const unit = [...s.matchAll(/UNIT\["[^"]*",\s*([\d.eE+-]+)/gi)].pop();
  const lon0 = param("central_meridian");
  if (lon0 === null) return { nama, tidakDikenal: true, datumLain };
  return {
    nama,
    lon0,
    k0: param("scale_factor") ?? 1,
    fe: param("false_easting") ?? 0,
    fn: param("false_northing") ?? 0,
    lat0: param("latitude_of_origin") ?? 0,
    satuan: unit ? Number(unit[1]) || 1 : 1,
    datumLain,
  };
}

/** Zona TM-3 dan UTM yang memuat bujur ini, mis. 114.8 -> TM-3 zona 50.1, UTM zona 50. */
export function zonaDi(lon) {
  const utm = Math.floor((lon + 180) / 6) + 1;
  const tengah = utm * 6 - 183;
  const kiri = lon < tengah;
  return {
    tm3: { nama: `TM-3 zona ${utm}.${kiri ? 1 : 2}`, lon0: tengah + (kiri ? -1.5 : 1.5), k0: 0.9999, fe: 200000, fn: 1500000 },
    utmS: { nama: `UTM zona ${utm}S`, lon0: tengah, k0: 0.9996, fe: 500000, fn: 10000000 },
    utmN: { nama: `UTM zona ${utm}N`, lon0: tengah, k0: 0.9996, fe: 500000, fn: 0 },
  };
}

/**
 * Sistem koordinat yang dicoba untuk tiap bidang, urut: keterangan .prj (bila
 * terbaca), derajat WGS 84, lalu TM-3 dan UTM zona wilayah kerja.
 *
 * @param {{ lat: number, lon: number }} wilayah  pusat wilayah kerja
 * @param {object | null} prj  hasil bacaPrj
 */
export function calonCrs(wilayah, prj) {
  const z = zonaDi(wilayah.lon);
  const daftar = [];
  if (prj?.geografis) {
    daftar.push({ nama: prj.nama, derajat: true, dariPrj: true });
  } else if (prj && !prj.tidakDikenal) {
    // Satuan selain meter (mis. kaki): koordinat dan false easting / northing ikut dikalikan.
    const s = prj.satuan || 1;
    daftar.push({ nama: prj.nama || "Keterangan .prj", ...prj, fe: prj.fe * s, fn: prj.fn * s, satuan: s, dariPrj: true });
  }
  daftar.push({ nama: "WGS 84 (derajat)", derajat: true }, z.tm3, z.utmS, z.utmN);
  return daftar;
}

/** Satu titik berkas -> [bujur, lintang] menurut sistem koordinat `crs` (dari calonCrs). */
export function ubahTitik(crs, x, y) {
  if (crs.derajat) return [x, y];
  const s = crs.satuan || 1;
  return tmKeDerajat(x * s, y * s, crs);
}

/** Jarak kasar (km) antara titik dan pusat wilayah - sama dengan server/src/persil.js. */
export function jarakKm(lat, lon, pusat) {
  const dLat = (lat - pusat.lat) * 111.32;
  const dLon = (lon - pusat.lon) * 111.32 * Math.cos(pusat.lat * RAD);
  return Math.hypot(dLat, dLon);
}

const diWilayah = (lon, lat, wilayah) =>
  Number.isFinite(lon) && Number.isFinite(lat) && jarakKm(lat, lon, wilayah) <= wilayah.radiusKm;

/** Indeks calon sistem koordinat pertama yang membawa titik (x, y) ke wilayah kerja, atau -1. */
export function pilihCrs(calon, x, y, wilayah) {
  for (let k = 0; k < calon.length; k++) {
    const [lon, lat] = ubahTitik(calon[k], x, y);
    if (diWilayah(lon, lat, wilayah)) return k;
  }
  return -1;
}

/* ---------- .shp ---------- */

/** Polygon, PolygonZ, PolygonM: yang dipakai hanya X dan Y. */
const TIPE_POLIGON = new Set([5, 15, 25]);
const NAMA_TIPE = { 1: "titik", 3: "garis", 8: "multititik", 11: "titik", 13: "garis", 21: "titik", 23: "garis" };

/** Kepala .shp: { tipe, batas: [xmin, ymin, xmax, ymax] }. */
export function bacaKepalaShp(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 100 || dv.getInt32(0, false) !== 9994) throw new Error("Berkas .shp tidak sah.");
  return {
    tipe: dv.getInt32(32, true),
    batas: [dv.getFloat64(36, true), dv.getFloat64(44, true), dv.getFloat64(52, true), dv.getFloat64(60, true)],
  };
}

/** Penjelasan tipe bentuk yang bukan poligon, untuk pesan galat. */
export const namaTipeShp = (tipe) => NAMA_TIPE[tipe] || `tipe ${tipe}`;

/**
 * Bentuk-bentuk di .shp satu per satu, urut rekaman: cincin-cincin
 * [[[x, y], ...], ...] dalam koordinat berkasnya, atau null untuk bentuk kosong.
 */
export function* bacaBentukShp(buf) {
  const dv = new DataView(buf);
  let pos = 100;
  while (pos + 8 <= buf.byteLength) {
    const panjang = dv.getInt32(pos + 4, false) * 2;
    const awal = pos + 8;
    pos = awal + panjang;
    if (pos > buf.byteLength) throw new Error("Berkas .shp terpotong.");
    const tipe = panjang >= 4 ? dv.getInt32(awal, true) : 0;
    if (tipe === 0) {
      yield null;
      continue;
    }
    if (!TIPE_POLIGON.has(tipe)) throw new Error(`Berkas berisi ${namaTipeShp(tipe)}, bukan bidang (poligon).`);
    const nBagian = dv.getInt32(awal + 36, true);
    const nTitik = dv.getInt32(awal + 40, true);
    const titikAwal = awal + 44 + 4 * nBagian;
    if (nBagian < 0 || nTitik < 0 || titikAwal + 16 * nTitik > pos) throw new Error("Berkas .shp rusak.");
    const cincin = [];
    for (let b = 0; b < nBagian; b++) {
      const dari = dv.getInt32(awal + 44 + 4 * b, true);
      const sampai = b + 1 < nBagian ? dv.getInt32(awal + 48 + 4 * b, true) : nTitik;
      if (dari < 0 || sampai > nTitik || sampai < dari) throw new Error("Berkas .shp rusak.");
      const c = new Array(sampai - dari);
      for (let t = dari; t < sampai; t++) {
        const o = titikAwal + 16 * t;
        c[t - dari] = [dv.getFloat64(o, true), dv.getFloat64(o + 8, true)];
      }
      cincin.push(c);
    }
    yield cincin;
  }
}

/* ---------- .dbf ---------- */

const ascii = (bytes) => String.fromCharCode(...bytes);

/**
 * Kepala .dbf (cukup potongan awal sepanjang `panjangKepala`, lihat bukaShapefile):
 * { jumlah, panjangKepala, panjangRekaman, kolom: [{ nama, tipe, panjang, posisi }], ldid }.
 */
export function bacaKepalaDbf(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 32) throw new Error("Berkas .dbf tidak sah.");
  const kepala = {
    jumlah: dv.getUint32(4, true),
    panjangKepala: dv.getUint16(8, true),
    panjangRekaman: dv.getUint16(10, true),
    ldid: dv.getUint8(29),
    kolom: [],
  };
  let posisi = 1; // bait 0 tiap rekaman = penanda hapus
  for (let o = 32; o + 32 <= Math.min(kepala.panjangKepala, buf.byteLength) && dv.getUint8(o) !== 0x0d; o += 32) {
    const namaBait = new Uint8Array(buf, o, 11);
    const nol = namaBait.indexOf(0);
    const kolom = {
      nama: ascii(nol < 0 ? namaBait : namaBait.subarray(0, nol)).trim(),
      tipe: String.fromCharCode(dv.getUint8(o + 11)).toUpperCase(),
      panjang: dv.getUint8(o + 16),
      posisi,
    };
    kepala.kolom.push(kolom);
    posisi += kolom.panjang;
  }
  if (posisi > kepala.panjangRekaman) throw new Error("Berkas .dbf rusak.");
  return kepala;
}

/** Pengurai teks .dbf dari isi .cpg (mis. "UTF-8", "1252"), atau bait bahasa di kepalanya. */
export function dekoderDbf(cpg, ldid) {
  const c = String(cpg || "").trim().toUpperCase().replace(/^ANSI\s*/, "");
  let label = "";
  if (/^(UTF-?8|65001)$/.test(c)) label = "utf-8";
  else if (/^(CP|WINDOWS-?)?1252$/.test(c)) label = "windows-1252";
  else if (/^(ISO-?)?8859-?1$/.test(c)) label = "iso-8859-1";
  else if (c) label = c.toLowerCase();
  else if (ldid === 0x57 || ldid === 0x03) label = "windows-1252";
  try {
    return new TextDecoder(label || "utf-8");
  } catch {
    return new TextDecoder("utf-8");
  }
}

function nilaiDbf(kolom, bait, dekoder) {
  if (kolom.tipe === "N" || kolom.tipe === "F") {
    const s = ascii(bait).trim();
    if (!s || /^\*+$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  if (kolom.tipe === "L") {
    const h = String.fromCharCode(bait[0] || 32).toUpperCase();
    return "YT".includes(h) ? true : "NF".includes(h) ? false : null;
  }
  if (kolom.tipe === "D") {
    const s = ascii(bait).trim();
    return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : null;
  }
  const s = dekoder.decode(bait).replace(/\0/g, "").trim();
  return s || null;
}

/**
 * Rekaman-rekaman .dbf dari potongan berisi rekaman utuh -> [{ kolom: nilai }],
 * null untuk rekaman yang ditandai terhapus. Teks dirapikan, angka jadi number,
 * kosong jadi null.
 */
export function bacaRekamanDbf(bait, kepala, dekoder) {
  const hasil = [];
  const p = kepala.panjangRekaman;
  for (let r = 0; r + p <= bait.length; r += p) {
    if (bait[r] === 0x2a) {
      hasil.push(null);
      continue;
    }
    const rek = {};
    for (const k of kepala.kolom) rek[k.nama] = nilaiDbf(k, bait.subarray(r + k.posisi, r + k.posisi + k.panjang), dekoder);
    hasil.push(rek);
  }
  return hasil;
}

/* ---------- atribut BPN ---------- */

/** Nama kolom yang dikenali untuk tiap keterangan utama (huruf besar; nama kolom .dbf paling panjang 10 huruf). */
const ALIAS = {
  nib: ["NIB", "NO_NIB", "NOMOR_NIB", "NOMORNIB", "NIB_BIDANG"],
  kodeWilayah: ["KODEWILAYA", "KODEWILAYAH", "KODE_WILAY", "KODE_WIL", "KD_WILAYAH", "KD_WIL", "KODEWIL"],
  kecamatan: ["KECAMATAN", "NAMA_KEC", "NAMAKEC", "KEC"],
  kelurahan: ["KELURAHAN", "DESA", "DESA_KEL", "KEL_DESA", "NAMA_DESA", "NAMADESA", "NAMA_KEL", "KEL"],
  tipeHak: ["TIPEHAK", "TIPE_HAK", "JENIS_HAK", "JENISHAK", "HAK"],
  luasPeta: ["LUASPETA", "LUAS_PETA", "LUAS"],
};

/** Kolom teknis buatan ArcGIS / QGIS yang tidak berguna bagi pemakai peta. */
const DIBUANG = new Set(["OBJECTID", "OBJECTID_1", "FID", "SHAPE_LENG", "SHAPE_AREA", "SHAPE_LEN", "SHAPE_LENGTH", "SHAPE_LE_1", "SHAPE_AR_1"]);

const teksNilai = (v) => (v === null || v === undefined ? "" : String(v).trim());

/**
 * Pemeta atribut sebuah berkas: kolom mana NIB, kelurahan, dst. (`kolom`), dan
 * `ubah(rekaman)` -> { nib, kodeWilayah, kecamatan, kelurahan, tipeHak,
 * luasPeta, atribut: kolom-kolom lain yang terisi }.
 */
export function pemetaAtribut(namaKolom) {
  const perBesar = new Map(namaKolom.map((n) => [n.toUpperCase(), n]));
  const kolom = {};
  for (const [k, alias] of Object.entries(ALIAS)) kolom[k] = alias.map((a) => perBesar.get(a)).find(Boolean) || null;
  const dipakai = new Set(Object.values(kolom).filter(Boolean));
  const lain = namaKolom.filter((n) => !dipakai.has(n) && !DIBUANG.has(n.toUpperCase()));

  return {
    kolom,
    ubah(rek) {
      const nilai = (k) => (kolom[k] ? rek[kolom[k]] : null);
      const luas = Number(nilai("luasPeta"));
      const atribut = {};
      for (const n of lain) {
        const v = rek[n];
        if (v === null || v === undefined || v === "") continue;
        atribut[n] = typeof v === "number" ? Math.round(v * 1000) / 1000 : v;
      }
      return {
        nib: teksNilai(nilai("nib")),
        kodeWilayah: teksNilai(nilai("kodeWilayah")),
        kecamatan: teksNilai(nilai("kecamatan")),
        kelurahan: teksNilai(nilai("kelurahan")),
        tipeHak: teksNilai(nilai("tipeHak")),
        luasPeta: nilai("luasPeta") !== null && Number.isFinite(luas) ? Math.round(luas * 100) / 100 : null,
        atribut,
      };
    },
  };
}

/* ---------- cincin -> GeoJSON ---------- */

const bulat6 = (n) => Math.round(n * 1e6) / 1e6;

/** Cincin searah jarum jam (= cincin luar di shapefile; lubang berlawanan arah). */
function searahJarum(c) {
  let s = 0;
  for (let i = 0; i < c.length - 1; i++) s += (c[i + 1][0] - c[i][0]) * (c[i + 1][1] + c[i][1]);
  return s > 0;
}

function dalamCincin(c, x, y) {
  let dalam = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, yi] = c[i];
    const [xj, yj] = c[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dalam = !dalam;
  }
  return dalam;
}

/**
 * Buang titik kembar berurutan (setelah dibulatkan) dan tutup cincinnya; null
 * bila titik berbedanya kurang dari tiga - aturan yang sama dengan server.
 * Data BPN memuat bidang yang bentuknya hanya garis walau luasnya tercatat.
 */
export function rapikanCincin(c) {
  const hasil = [];
  for (const p of c) {
    const akhir = hasil[hasil.length - 1];
    if (!akhir || akhir[0] !== p[0] || akhir[1] !== p[1]) hasil.push(p);
  }
  if (hasil.length > 1) {
    const [awal, akhir] = [hasil[0], hasil[hasil.length - 1]];
    if (awal[0] !== akhir[0] || awal[1] !== akhir[1]) hasil.push([awal[0], awal[1]]);
  }
  return hasil.length >= 4 ? hasil : null;
}

/**
 * Cincin-cincin shapefile (sudah berderajat) -> Polygon / MultiPolygon GeoJSON.
 * Shapefile tidak mengelompokkan cincin: cincin luar searah jarum jam, lubang
 * berlawanan, dan tiap lubang masuk ke cincin luar yang memuatnya.
 */
export function cincinKeGeometri(cincin) {
  const luar = [];
  const lubang = [];
  for (const c of cincin) if (c.length >= 4) (searahJarum(c) ? luar : lubang).push(c);
  // Semua berlawanan arah (penulisnya tidak mengikuti aturan): anggap semuanya cincin luar.
  if (luar.length === 0) luar.push(...lubang.splice(0));
  const poligon = luar.map((c) => [c]);
  for (const h of lubang) {
    const induk = poligon.find((p) => h.some(([x, y]) => dalamCincin(p[0], x, y)));
    if (induk) induk.push(h);
    else poligon.push([h]);
  }
  if (poligon.length === 0) return null;
  return poligon.length === 1 ? { type: "Polygon", coordinates: poligon[0] } : { type: "MultiPolygon", coordinates: poligon };
}

/* ---------- pembaca berkas ---------- */

/** Contoh bidang nyasar yang disebut di laporan, paling banyak. */
const CONTOH_NYASAR = 10;

/**
 * Buka satu shapefile persil.
 *
 * @param {{ nama: string, shp: Blob, dbf: Blob, prj?: Blob, cpg?: Blob }} berkas
 * @param {{ lat: number, lon: number, radiusKm: number }} wilayah  dari /api/konfigurasi
 * @returns {Promise<{ jumlah: number, prj: object | null, kolom: object, laporan: object,
 *          tahap: (n?: number) => AsyncGenerator<object[]> }>}
 *   `tahap(n)` menghasilkan bidang siap kirim ({ nib, ..., atribut, geometri })
 *   per n rekaman; `laporan` terisi selama dibaca:
 *   { dibaca, diambil, kosong, terhapus, nyasar, contohNyasar, rusak, contohRusak,
 *     perCrs: { nama: jumlah } }
 *   kosong = tanpa bentuk; rusak = bentuknya hanya garis / titik; nyasar = tidak
 *   jatuh di wilayah kerja dengan sistem koordinat mana pun.
 */
export async function bukaShapefile(berkas, wilayah) {
  const prj = bacaPrj(berkas.prj ? await berkas.prj.text() : "");
  const cpg = berkas.cpg ? await berkas.cpg.text() : "";

  const shp = await berkas.shp.arrayBuffer();
  const kepalaShp = bacaKepalaShp(shp);
  if (!TIPE_POLIGON.has(kepalaShp.tipe) && kepalaShp.tipe !== 0) {
    throw new Error(`Berkas berisi ${namaTipeShp(kepalaShp.tipe)}, bukan bidang (poligon).`);
  }

  const awal = await berkas.dbf.slice(0, 32).arrayBuffer();
  if (awal.byteLength < 32) throw new Error("Berkas .dbf tidak sah.");
  const panjangKepala = new DataView(awal).getUint16(8, true);
  const kepala = bacaKepalaDbf(await berkas.dbf.slice(0, panjangKepala).arrayBuffer());
  const dekoder = dekoderDbf(cpg, kepala.ldid);
  const pemeta = pemetaAtribut(kepala.kolom.map((k) => k.nama));
  const calon = calonCrs(wilayah, prj);

  const laporan = {
    dibaca: 0,
    diambil: 0,
    kosong: 0,
    terhapus: 0,
    nyasar: 0,
    contohNyasar: [],
    rusak: 0,
    contohRusak: [],
    perCrs: {},
  };

  const catatNyasar = (atr, x, y) => {
    laporan.nyasar++;
    if (laporan.contohNyasar.length < CONTOH_NYASAR) {
      laporan.contohNyasar.push({ nib: atr.nib, kelurahan: atr.kelurahan, x, y });
    }
  };
  const catatRusak = (atr) => {
    laporan.rusak++;
    if (laporan.contohRusak.length < CONTOH_NYASAR) laporan.contohRusak.push({ nib: atr.nib, kelurahan: atr.kelurahan });
  };

  /** Satu rekaman -> bidang siap kirim, atau null (dicatat di laporan). */
  function ubah(cincinMentah, rek) {
    laporan.dibaca++;
    if (!rek) {
      laporan.terhapus++;
      return null;
    }
    if (!cincinMentah || !cincinMentah.length || !cincinMentah[0].length) {
      laporan.kosong++;
      return null;
    }
    const atr = pemeta.ubah(rek);
    const [x0, y0] = cincinMentah[0][0];
    const k = pilihCrs(calon, x0, y0, wilayah);
    if (k < 0) {
      catatNyasar(atr, x0, y0);
      return null;
    }
    const crs = calon[k];
    const cincin = [];
    for (const c of cincinMentah) {
      const hasil = new Array(c.length);
      for (let t = 0; t < c.length; t++) {
        const [lon, lat] = ubahTitik(crs, c[t][0], c[t][1]);
        // Satu titik sudut saja yang nyasar sudah cukup membuat bidangnya tergambar melintang kota.
        if (!diWilayah(lon, lat, wilayah)) {
          catatNyasar(atr, c[t][0], c[t][1]);
          return null;
        }
        hasil[t] = [bulat6(lon), bulat6(lat)];
      }
      const rapi = rapikanCincin(hasil);
      if (rapi) cincin.push(rapi);
    }
    const geometri = cincinKeGeometri(cincin);
    if (!geometri) {
      catatRusak(atr);
      return null;
    }
    laporan.diambil++;
    laporan.perCrs[crs.nama] = (laporan.perCrs[crs.nama] || 0) + 1;
    return { ...atr, geometri };
  }

  async function* tahap(n = 1000) {
    const bentuk = bacaBentukShp(shp);
    const p = kepala.panjangRekaman;
    for (let mulai = 0; mulai < kepala.jumlah; mulai += n) {
      const banyak = Math.min(n, kepala.jumlah - mulai);
      const dari = kepala.panjangKepala + mulai * p;
      const bait = new Uint8Array(await berkas.dbf.slice(dari, dari + banyak * p).arrayBuffer());
      const rek = bacaRekamanDbf(bait, kepala, dekoder);
      if (rek.length < banyak) throw new Error("Berkas .dbf terpotong.");
      const fitur = [];
      for (let r = 0; r < banyak; r++) {
        const b = bentuk.next();
        if (b.done) throw new Error("Isi .shp dan .dbf tidak sepasang: bentuk di .shp lebih sedikit dari baris di .dbf.");
        const f = ubah(b.value, rek[r]);
        if (f) fitur.push(f);
      }
      yield fitur;
    }
  }

  return { jumlah: kepala.jumlah, prj, kolom: pemeta.kolom, laporan, tahap };
}

/**
 * Kelompokkan berkas pilihan admin per nama shapefile:
 * [{ nama, shp, dbf, prj, cpg, kurang: ["dbf"] }]. Huruf besar-kecil
 * ekstensi diabaikan; berkas lain (.shx, .sbn, .xml, ...) tidak dipakai.
 */
export function kelompokkanBerkas(daftar) {
  const per = new Map();
  for (const f of daftar) {
    const m = /^(.*)\.(shp|dbf|prj|cpg)$/i.exec(f.name || "");
    if (!m) continue;
    const nama = m[1];
    if (!per.has(nama)) per.set(nama, { nama });
    per.get(nama)[m[2].toLowerCase()] = f;
  }
  return [...per.values()]
    .map((g) => ({ ...g, kurang: ["shp", "dbf"].filter((e) => !g[e]) }))
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

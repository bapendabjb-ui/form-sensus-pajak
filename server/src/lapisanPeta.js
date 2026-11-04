"use strict";

/**
 * Lapisan peta dari GIS: pembaca dan perapi GeoJSON yang diunggah admin.
 *
 * Yang diterima hanya GeoJSON berkoordinat derajat WGS 84 (EPSG:4326) - format
 * yang dibaca langsung oleh peta Google maupun Leaflet. Data persil / blok dari
 * BPN atau SISMIOP biasanya ber-CRS UTM atau TM-3 (meter); berkas seperti itu
 * ditolak dengan petunjuk menyimpan ulang dari QGIS / ArcGIS, bukan diterima
 * lalu tergambar di tengah samudra.
 *
 * Perapian memperkecil berkas tanpa mengubah bentuknya: koordinat dibulatkan ke
 * 6 desimal (±11 cm), nilai ketinggian (Z) dibuang, atribut kosong dibuang.
 */

const { badRequest } = require("./http");

/**
 * Unggahan paling besar (berkas mentah dari QGIS, sebelum dirapikan). Di bawah
 * batas unggah Nginx 20m dari panduan server kantor (docs/migrasi-server-kantor.md),
 * supaya yang menolak berkas kebesaran adalah aplikasi, dengan pesan yang jelas.
 */
const UNGGAH_MAKS_MB = 18;

/**
 * Isi tersimpan paling besar. Batas paket MariaDB bawaan (max_allowed_packet)
 * 16 MB; satu INSERT yang lebih besar ditolak database.
 */
const ISI_MAKS_BYTE = 12 * 1024 * 1024;

/** Fitur paling banyak: lebih dari ini peta di HP tersendat saat digeser. */
const FITUR_MAKS = 50000;

const NAMA_MAKS = 100;
const WARNA_BAWAAN = "#2563EB";

/** Kedalaman larik koordinat tiap jenis geometri (0 = satu posisi [bujur, lintang]). */
const KEDALAMAN = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };

const PETUNJUK_CRS =
  "Simpan ulang dengan CRS EPSG:4326 - WGS 84. QGIS: klik kanan layer → Export → Save Features As…, " +
  "Format GeoJSON, CRS EPSG:4326. ArcGIS Pro: tool Features To JSON, centang Output to GeoJSON dan " +
  "Project to WGS_1984.";

/** Nama CRS GeoJSON lama (member `crs`) yang berarti derajat WGS 84. */
const CRS_WGS84 = /(CRS84|(^|:)4326)$/i;

const bulat = (n) => Math.round(n * 1e6) / 1e6;

/**
 * Satu posisi [bujur, lintang, (tinggi)] -> [bujur, lintang] bulat, atau null
 * bila bukan angka. Di luar rentang derajat = berkas ber-CRS lain: ditolak.
 */
function posisi(p) {
  if (!Array.isArray(p) || p.length < 2) return null;
  const [lon, lat] = p;
  if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
    throw badRequest(
      `Koordinat berkas ini bukan derajat lintang/bujur (mis. ${lon}, ${lat}) - kemungkinan UTM atau TM-3. ${PETUNJUK_CRS}`
    );
  }
  return [bulat(lon), bulat(lat)];
}

function rapikanKoordinat(c, kedalaman) {
  if (kedalaman === 0) return posisi(c);
  if (!Array.isArray(c)) return null;
  const isi = [];
  for (const x of c) {
    const r = rapikanKoordinat(x, kedalaman - 1);
    if (r) isi.push(r);
  }
  return isi.length ? isi : null;
}

/** Geometri GeoJSON -> versi rapi, atau null bila kosong / jenisnya tidak dikenal. */
function rapikanGeometri(g) {
  if (!g || typeof g !== "object") return null;
  if (g.type === "GeometryCollection") {
    const isi = (Array.isArray(g.geometries) ? g.geometries : []).map(rapikanGeometri).filter(Boolean);
    return isi.length ? { type: g.type, geometries: isi } : null;
  }
  if (!Object.hasOwn(KEDALAMAN, g.type)) return null;
  const coordinates = rapikanKoordinat(g.coordinates, KEDALAMAN[g.type]);
  return coordinates ? { type: g.type, coordinates } : null;
}

/** Atribut fitur: kosong dibuang, objek / larik diubah jadi teks supaya balonnya bisa membacanya. */
function rapikanAtribut(p) {
  const hasil = {};
  if (!p || typeof p !== "object" || Array.isArray(p)) return hasil;
  for (const [k, v] of Object.entries(p)) {
    if (k === "__proto__" || v === null || v === undefined || v === "") continue;
    hasil[k] = typeof v === "object" ? JSON.stringify(v) : v;
  }
  return hasil;
}

/**
 * Baca berkas GeoJSON unggahan.
 *
 * @param {Buffer | string} mentah
 * @returns {{ isi: string, jumlahFitur: number, dilewati: number, nama: string }}
 *          `isi` = FeatureCollection rapi siap simpan; `dilewati` = fitur tanpa
 *          geometri yang bisa digambar; `nama` = member `name` berkas (QGIS
 *          mengisinya dengan nama layer), "" bila tidak ada
 * @throws ApiError 400 dengan pesan yang bisa ditindaklanjuti admin
 */
function bacaGeojson(mentah) {
  const teks = (Buffer.isBuffer(mentah) ? mentah.toString("utf8") : String(mentah ?? "")).replace(/^\uFEFF/, "");
  let data;
  try {
    data = JSON.parse(teks);
  } catch {
    throw badRequest("Berkas tidak terbaca sebagai GeoJSON. Pilih berkas .geojson hasil ekspor QGIS / ArcGIS.");
  }
  if (!data || typeof data !== "object") throw badRequest("Isi berkas bukan GeoJSON.");

  const crs = data.crs?.properties?.name;
  if (typeof crs === "string" && !CRS_WGS84.test(crs.trim())) {
    throw badRequest(`Berkas memakai sistem koordinat ${crs}, sedangkan peta membutuhkan derajat WGS 84. ${PETUNJUK_CRS}`);
  }

  let mentahFitur = null;
  if (data.type === "FeatureCollection" && Array.isArray(data.features)) mentahFitur = data.features;
  else if (data.type === "Feature") mentahFitur = [data];
  else if (data.type === "GeometryCollection" || Object.hasOwn(KEDALAMAN, String(data.type))) mentahFitur = [{ type: "Feature", geometry: data }];
  if (!mentahFitur) {
    throw badRequest("Isi berkas bukan GeoJSON (harus FeatureCollection, Feature, atau geometri).");
  }

  const fitur = [];
  let dilewati = 0;
  for (const f of mentahFitur) {
    const geometry = f && typeof f === "object" ? rapikanGeometri(f.geometry) : null;
    if (!geometry) {
      dilewati++;
      continue;
    }
    fitur.push({ type: "Feature", geometry, properties: rapikanAtribut(f.properties) });
  }

  if (fitur.length === 0) throw badRequest("Tidak ada fitur bergeometri di berkas ini.");
  if (fitur.length > FITUR_MAKS) {
    throw badRequest(
      `Berkas berisi ${fitur.length.toLocaleString("id-ID")} fitur; paling banyak ${FITUR_MAKS.toLocaleString("id-ID")}. ` +
        "Pecah per kecamatan atau kelurahan, lalu unggah sebagai beberapa lapisan."
    );
  }

  const isi = JSON.stringify({ type: "FeatureCollection", features: fitur });
  const ukuran = Buffer.byteLength(isi);
  if (ukuran > ISI_MAKS_BYTE) {
    const mb = (n) => (n / 1024 / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 });
    throw badRequest(
      `Lapisan terlalu besar: ${mb(ukuran)} MB setelah dirapikan, paling besar ${mb(ISI_MAKS_BYTE)} MB. ` +
        "Sederhanakan garisnya di QGIS (Vector → Geometry Tools → Simplify) atau pecah per kecamatan / kelurahan."
    );
  }

  return { isi, jumlahFitur: fitur.length, dilewati, nama: typeof data.name === "string" ? data.name.trim() : "" };
}

/** Nama lapisan dari isian admin. */
function bacaNama(nilai) {
  const nama = String(nilai ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAMA_MAKS);
  if (!nama) throw badRequest("Isi nama lapisan, mis. Batas blok PBB.");
  return nama;
}

/** "batas-blok_pbb.geojson" -> "batas blok pbb". */
const namaDariBerkas = (nama) =>
  String(nama || "")
    .replace(/\.(geo)?json$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

/** Warna "#RRGGBB" (huruf besar, seperti bawaan kolomnya); selain itu `cadangan`. */
function bacaWarna(nilai, cadangan = WARNA_BAWAAN) {
  const w = String(nilai ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(w) ? w.toUpperCase() : cadangan;
}

module.exports = {
  UNGGAH_MAKS_MB,
  ISI_MAKS_BYTE,
  FITUR_MAKS,
  WARNA_BAWAAN,
  bacaGeojson,
  bacaNama,
  bacaWarna,
  namaDariBerkas,
};

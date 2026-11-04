"use strict";

/**
 * Ekspor titik hasil sensus untuk aplikasi peta: GeoJSON (QGIS, ArcGIS) dan
 * KML (Google Earth, Google My Maps).
 *
 * Isinya tabel yang sama dengan Excel/CSV (susunTabel di src/ekspor.js): satu
 * titik per baris, atribut = kolom-kolomnya. Koordinat titik diambil dari kolom
 * Lokasi pertama yang terisi di baris itu. Baris tanpa koordinat tidak ikut,
 * karena tidak bisa digambar - jumlahnya dikabarkan lewat header X-Tanpa-Titik.
 *
 * Koordinatnya derajat desimal WGS 84 (EPSG:4326), sama dengan yang direkam GPS
 * HP, jadi QGIS dan ArcGIS langsung mengenalinya tanpa memilih CRS.
 */

const { badRequest } = require("./http");

/** Judul kolom -> nama atribut yang unik: judul kembar diberi akhiran " (2)", " (3)", ... */
function namaAtribut(header) {
  const dipakai = new Set();
  return header.map((h) => {
    const dasar = String(h ?? "").trim() || "Kolom";
    let nama = dasar;
    for (let n = 2; dipakai.has(nama); n++) nama = `${dasar} (${n})`;
    dipakai.add(nama);
    return nama;
  });
}

/** Isi sel sebagai nilai atribut: angkanya bila ada, teksnya, atau null bila kosong. */
const nilaiSel = (c) => (c && c.angka !== undefined ? c.angka : c && c.teks ? c.teks : null);

const sahLat = (n) => Number.isFinite(n) && Math.abs(n) <= 90;
const sahLon = (n) => Number.isFinite(n) && Math.abs(n) <= 180;

/**
 * Tabel ekspor -> titik yang bisa digambar.
 *
 * @param {{ header: string[], baris: object[][], titik?: number[][] }} tabel
 *        `titik` = pasangan [indeks latitude, indeks longitude] kolom Lokasi, urut kolom
 * @returns {{ nama: string[], fitur: { lat: number, lon: number, sel: object[] }[], tanpaTitik: number }}
 */
function keFitur({ header, baris, titik = [] }) {
  const fitur = [];
  let tanpaTitik = 0;
  for (const sel of baris) {
    const pas = titik.find(([iLat, iLon]) => sahLat(sel[iLat]?.angka) && sahLon(sel[iLon]?.angka));
    if (!pas) {
      tanpaTitik++;
      continue;
    }
    fitur.push({ lat: sel[pas[0]].angka, lon: sel[pas[1]].angka, sel });
  }
  return { nama: namaAtribut(header), fitur, tanpaTitik };
}

/*
 * Berkas peta disusun potong demi potong (satu titik satu potong) dan dikirim
 * begitu jadi. Atribut ditulis ulang di setiap titik, jadi berkas seluruh data
 * bisa puluhan MB: menyusunnya utuh dulu di memori mendekatkan proses ke batas
 * restart PM2 (deploy/ecosystem.config.js), seperti Excel (src/ekspor.js keXlsx).
 */

/**
 * GeoJSON (RFC 7946), sebagai potongan teks. Semua atribut ditulis di setiap
 * titik, yang kosong sebagai null, supaya tiap aplikasi peta membentuk kolom
 * yang sama. `name` dipakai QGIS sebagai nama layer.
 */
function* potonganGeojson({ nama, fitur }, judul) {
  yield `{"type":"FeatureCollection","name":${JSON.stringify(String(judul || "Sensus Pajak"))},"features":[\n`;
  for (let n = 0; n < fitur.length; n++) {
    const { lon, lat, sel } = fitur[n];
    yield (n ? ",\n" : "") +
      JSON.stringify({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: Object.fromEntries(nama.map((k, i) => [k, nilaiSel(sel[i])])),
      });
  }
  yield "\n]}\n";
}

// Karakter yang tidak boleh ada di XML 1.0 sama sekali, bahkan di-escape.
const XML_TERLARANG = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;
const xml = (s) =>
  String(s ?? "")
    .replace(XML_TERLARANG, "")
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

/**
 * KML 2.2, sebagai potongan teks. Atributnya lewat Schema + SimpleData -
 * susunan yang juga ditulis QGIS/GDAL sendiri - supaya terbaca sebagai kolom,
 * bukan hanya teks balon. Nama tiap titik = nomor kertas kerja (kolom pertama).
 */
function* potonganKml({ nama, fitur }, judul) {
  // Kolom yang seluruh isinya angka ditandai double; selebihnya string.
  const jenis = nama.map((_, i) =>
    fitur.every(({ sel }) => sel[i]?.angka !== undefined || !nilaiSel(sel[i])) &&
    fitur.some(({ sel }) => sel[i]?.angka !== undefined)
      ? "double"
      : "string"
  );
  const skema = nama.map((n, i) => `<SimpleField name="${xml(n)}" type="${jenis[i]}"/>`).join("");
  const label = xml(judul || "Sensus Pajak");
  yield '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n' +
    `<name>${label}</name>\n<Schema name="sensus" id="sensus">${skema}</Schema>\n` +
    `<Folder><name>${label}</name>\n`;
  for (const { lon, lat, sel } of fitur) {
    let data = "";
    nama.forEach((n, i) => {
      const v = nilaiSel(sel[i]);
      if (v !== null) data += `<SimpleData name="${xml(n)}">${xml(v)}</SimpleData>`;
    });
    yield `<Placemark><name>${xml(sel[0]?.teks)}</name>` +
      `<ExtendedData><SchemaData schemaUrl="#sensus">${data}</SchemaData></ExtendedData>` +
      `<Point><coordinates>${lon},${lat}</coordinates></Point></Placemark>\n`;
  }
  yield "</Folder>\n</Document>\n</kml>\n";
}

/** GeoJSON utuh sebagai satu teks - untuk tes dan berkas kecil. */
const keGeojson = (hasil, judul) => [...potonganGeojson(hasil, judul)].join("");

/** KML utuh sebagai satu teks - untuk tes dan berkas kecil. */
const keKml = (hasil, judul) => [...potonganKml(hasil, judul)].join("");

const JENIS_PETA = {
  geojson: { ekstensi: "geojson", mime: "application/geo+json; charset=utf-8", potongan: potonganGeojson },
  kml: { ekstensi: "kml", mime: "application/vnd.google-earth.kml+xml; charset=utf-8", potongan: potonganKml },
};

/** Teks yang dikumpulkan sebelum ditulis ke jawaban (karakter): cukup besar supaya gzip efisien. */
const TULIS_PER_POTONG = 256 * 1024;

/**
 * Kirim tabel ekspor sebagai berkas peta, ditulis bertahap. Tanpa satu titik
 * pun dijawab 400 (berkas kosong tidak berguna dan membingungkan di QGIS).
 *
 * @param {"geojson" | "kml"} jenis
 */
async function kirimPeta(res, { nama, sheet, tabel }, jenis) {
  const j = JENIS_PETA[jenis];
  const hasil = keFitur(tabel);
  if (hasil.fitur.length === 0) {
    throw badRequest(
      "Belum ada data berkoordinat pada pilihan ini, jadi tidak ada titik untuk aplikasi peta. " +
        "Titik berasal dari pertanyaan Lokasi yang sudah diisi."
    );
  }
  res.setHeader("Content-Type", j.mime);
  res.setHeader("Content-Disposition", `attachment; filename="${nama}.${j.ekstensi}"`);
  res.setHeader("X-Jumlah-Titik", String(hasil.fitur.length));
  res.setHeader("X-Tanpa-Titik", String(hasil.tanpaTitik));

  // Satu pendengar "drain" dan satu "close" untuk seluruh pengiriman, bukan
  // satu per tunggu: middleware compression meneruskan pendengar "drain" ke
  // pemampatnya tetapi tidak meneruskan pelepasannya (termasuk lewat once).
  let putus = false;
  let bangunkan = null;
  const lanjutkan = () => {
    const b = bangunkan;
    bangunkan = null;
    if (b) b();
  };
  const saatPutus = () => {
    putus = true;
    lanjutkan();
  };
  res.on("drain", lanjutkan);
  res.once("close", saatPutus);
  try {
    let kumpulan = "";
    for (const potong of j.potongan(hasil, sheet)) {
      kumpulan += potong;
      if (kumpulan.length < TULIS_PER_POTONG) continue;
      const lega = res.write(kumpulan);
      kumpulan = "";
      // Penerima (atau pemampat) belum sanggup menampung lagi: tunggu, jangan menumpuk di memori.
      if (!lega && !putus) await new Promise((b) => (bangunkan = b));
      if (putus) return; // unduhan dibatalkan
    }
    res.end(kumpulan);
  } finally {
    res.off("close", saatPutus);
  }
}

module.exports = { namaAtribut, keFitur, keGeojson, keKml, kirimPeta };

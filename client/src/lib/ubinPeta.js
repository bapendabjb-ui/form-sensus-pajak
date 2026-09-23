/**
 * Sumber potongan peta (ubin) beserta cadangannya.
 *
 * Dipakai bersama oleh PetaLokasi.jsx dan PetaSebaran.jsx supaya daftar
 * sumbernya hanya ada di satu tempat - host di sini harus sama dengan img-src
 * pada server/src/keamanan.js, kalau tidak petanya kosong tanpa pesan galat.
 *
 * Kenapa perlu cadangan: tile.openstreetmap.org adalah server sukarelawan yang
 * memblokir aplikasi yang lalu lintasnya dianggap melanggar kebijakan pemakaian
 * mereka. Saat diblokir, ubin yang dikirim bukan galat jaringan melainkan
 * gambar bertuliskan "Access blocked" dengan status HTTP di luar 2xx - gambar
 * itu tetap tergambar di peta, jadi Leaflet tidak pernah memicu "tileerror".
 * Satu-satunya cara mengetahuinya lebih dulu adalah memeriksa status HTTP
 * sendiri sebelum lapisan dipasang.
 */

/** Ubin peta jalan utama: OpenStreetMap. */
const OSM = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  opsi: { maxZoom: 19, attribution: "&copy; OpenStreetMap" },
};

/** Cadangan peta jalan bila OSM memblokir: Esri, host yang sama dengan satelit. */
const ESRI_JALAN = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  opsi: { maxZoom: 19, attribution: "&copy; Esri" },
};

const ESRI_SATELIT = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  opsi: { maxZoom: 19, attribution: "&copy; Esri" },
};

/** Pilihan yang tampil sebagai tombol di atas peta. */
export const LAPISAN = {
  peta: { label: "Peta" },
  satelit: { label: "Satelit" },
};

/** Ubin sedunia pada zoom 0: sekali unduh, dipakai hanya untuk menguji akses. */
const UJI_OSM = "https://tile.openstreetmap.org/0/0/0.png";

const KUNCI_SIMPAN = "fk-ubin-jalan";

/**
 * Hasil pemeriksaan OSM: "osm" | "esri" | null (belum diperiksa).
 *
 * Disimpan di sessionStorage supaya peta yang dibuka berkali-kali dalam satu
 * sesi tidak menguji ulang, tapi blokir yang dicabut tetap terbaca lagi besok.
 */
let pilihan = null;
try {
  const tersimpan = sessionStorage.getItem(KUNCI_SIMPAN);
  if (tersimpan === "osm" || tersimpan === "esri") pilihan = tersimpan;
} catch {
  // Mode privat / penyimpanan diblokir: cukup periksa ulang tiap kali.
}

function ingat(nilai) {
  pilihan = nilai;
  try {
    sessionStorage.setItem(KUNCI_SIMPAN, nilai);
  } catch {
    // Tidak apa-apa: pilihan tetap hidup selama halaman belum ditutup.
  }
}

let sedangUji = null;

/**
 * Uji sekali apakah ubin OSM masih boleh dipakai dari aplikasi ini.
 *
 * Gagal fetch (luring, pemblokir iklan, CSP) bukan berarti diblokir, jadi
 * hasilnya tidak disimpan dan OSM tetap dicoba - blokir sungguhan selalu
 * menjawab dengan status HTTP di luar 2xx.
 */
function ujiOsm() {
  if (sedangUji) return sedangUji;
  sedangUji = fetch(UJI_OSM, { cache: "force-cache" })
    .then((r) => {
      ingat(r.ok ? "osm" : "esri");
      return pilihan;
    })
    .catch(() => "osm")
    .finally(() => {
      sedangUji = null;
    });
  return sedangUji;
}

/**
 * Sumber ubin untuk sebuah jenis peta.
 *
 * Satelit tidak pernah perlu diuji. Peta jalan dijawab langsung bila hasil uji
 * sudah diketahui, dan baru menunggu bila ini pemakaian pertama di sesi ini.
 *
 * jenis : "peta" | "satelit"
 * -> { url, opsi } | Promise<{ url, opsi }>
 */
export function sumberUbin(jenis) {
  if (jenis === "satelit") return ESRI_SATELIT;
  if (pilihan) return pilihan === "osm" ? OSM : ESRI_JALAN;
  return ujiOsm().then((p) => (p === "osm" ? OSM : ESRI_JALAN));
}

/**
 * Pasang lapisan ubin pada peta Leaflet, melepas lapisan lama lebih dulu.
 *
 * Mengembalikan fungsi pembatal untuk dipakai sebagai pembersih useEffect:
 * pemasangan bisa tertunda menunggu hasil uji, dan pada saat itu petanya bisa
 * saja sudah ditutup atau jenisnya sudah diganti lagi.
 *
 * L        : modul Leaflet
 * peta     : instance L.Map
 * jenis    : "peta" | "satelit"
 * simpan   : (lapisan) => void  - dipanggil dengan lapisan yang baru dipasang
 * lapisanLama : lapisan yang sedang terpasang, boleh null
 */
export function pasangUbin(L, peta, jenis, simpan, lapisanLama) {
  let batal = false;

  const pasang = (sumber) => {
    if (batal) return;
    if (lapisanLama) peta.removeLayer(lapisanLama);
    const lapisan = L.tileLayer(sumber.url, sumber.opsi);

    // Jaring terakhir: ubin yang benar-benar gagal dimuat (server mati, ubin
    // ditolak tanpa gambar). Blokir OSM tidak lewat sini - lihat catatan atas.
    if (jenis === "peta" && sumber === OSM) {
      let gagal = 0;
      lapisan.on("tileerror", () => {
        gagal += 1;
        if (gagal < 6 || batal) return;
        ingat("esri");
        pasang(ESRI_JALAN);
      });
    }

    lapisan.addTo(peta);
    lapisanLama = lapisan;
    simpan(lapisan);
  };

  const sumber = sumberUbin(jenis);
  if (typeof sumber.then === "function") sumber.then(pasang);
  else pasang(sumber);

  return () => {
    batal = true;
  };
}

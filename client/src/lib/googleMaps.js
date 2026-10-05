/**
 * Pemuat Google Maps JavaScript API, beserta pendeteksi kegagalannya.
 *
 * Peta Google adalah pilihan utama bila server punya GOOGLE_MAPS_API_KEY; bila
 * gagal, komponen peta beralih ke Leaflet (OpenStreetMap / Esri). "Gagal" di
 * sini mencakup semua yang membuat peta Google tidak berguna:
 *
 *   - skrip tidak termuat (jaringan, pemblokir, CSP) atau terlalu lama,
 *   - gm_authFailure: kunci ditolak / domain tidak diizinkan,
 *   - galat yang dicetak Google ke konsol sebagai "Google Maps JavaScript API
 *     error: ...", mis. OverQuotaMapError saat kuota harian habis dan
 *     BillingNotEnabledMapError. Google tidak menyediakan callback untuk ini,
 *     jadi console.error disadap - pesan tetap diteruskan apa adanya.
 *
 * Sekali gagal, peta cadangan dipakai sampai tab / aplikasi ditutup
 * (sessionStorage), supaya setiap peta berikutnya tidak menunggu kegagalan
 * yang sama dan tidak menambah hitungan pemakaian Google.
 */

const NAMA_CALLBACK = "__fkGoogleMapsSiap";
const BATAS_MUAT_MS = 12000;
const KUNCI_SESI = "fk-google-maps-gagal";
const POLA_GALAT = /^Google Maps JavaScript API error:\s*(\S+)/;

let gagal = false;
try {
  gagal = sessionStorage.getItem(KUNCI_SESI) === "1";
} catch {
  // Penyimpanan diblokir: cukup ingat selama halaman terbuka.
}

let janji = null;
const pendengar = new Set();

/** Peta Google sudah dinyatakan gagal di sesi ini? */
export const googleGagal = () => gagal;

/** Daftarkan fungsi yang dipanggil saat peta Google gagal. Mengembalikan pelepas. */
export function onGoogleGagal(fn) {
  pendengar.add(fn);
  return () => pendengar.delete(fn);
}

/** Nyatakan peta Google gagal; semua peta yang terbuka beralih ke cadangan. */
export function tandaiGoogleGagal(sebab) {
  if (gagal) return;
  gagal = true;
  try {
    sessionStorage.setItem(KUNCI_SESI, "1");
  } catch {
    /* lihat atas */
  }
  console.warn(`[Sensus Pajak] Peta Google tidak tersedia (${sebab}). Memakai peta cadangan.`);
  for (const fn of [...pendengar]) fn(sebab);
}

let terpantau = false;

function pantauGalatGoogle() {
  if (terpantau) return;
  terpantau = true;
  window.gm_authFailure = () => tandaiGoogleGagal("kunci API ditolak");
  const asli = console.error;
  console.error = (...arg) => {
    const cocok = typeof arg[0] === "string" && POLA_GALAT.exec(arg[0]);
    asli.apply(console, arg);
    if (cocok) tandaiGoogleGagal(cocok[1]);
  };
}

/**
 * Muat Maps JavaScript API sekali per halaman.
 * @returns {Promise<object>} gabungan google.maps dan pustaka core, maps, marker
 */
export function muatGoogleMaps(kunci) {
  if (gagal) return Promise.reject(new Error("Peta Google tidak tersedia."));
  if (janji) return janji;

  pantauGalatGoogle();
  janji = new Promise((resolve, reject) => {
    let selesai = false;
    const tolak = (sebab) => {
      if (selesai) return;
      selesai = true;
      clearTimeout(pewaktu);
      tandaiGoogleGagal(sebab);
      reject(new Error(sebab));
    };
    const pewaktu = setTimeout(() => tolak("waktu muat habis"), BATAS_MUAT_MS);
    // Kunci ditolak sebelum pustaka siap: jangan biarkan pemanggil menunggu sampai waktu habis.
    const lepas = onGoogleGagal((sebab) => tolak(sebab));

    window[NAMA_CALLBACK] = async () => {
      try {
        const gm = window.google.maps;
        const [core, maps, marker] = await Promise.all(["core", "maps", "marker"].map((n) => gm.importLibrary(n)));
        if (selesai) return;
        selesai = true;
        clearTimeout(pewaktu);
        lepas();
        resolve({ ...gm, ...core, ...maps, ...marker });
      } catch (e) {
        tolak(`pustaka gagal dimuat: ${e.message}`);
      }
    };

    const skrip = document.createElement("script");
    skrip.src =
      "https://maps.googleapis.com/maps/api/js?" +
      new URLSearchParams({
        key: kunci,
        v: "weekly",
        language: "id",
        region: "ID",
        loading: "async",
        callback: NAMA_CALLBACK,
      });
    skrip.async = true;
    skrip.onerror = () => tolak("skrip tidak dapat dimuat");
    document.head.appendChild(skrip);
  });
  // Penolakan sudah ditangani lewat tandaiGoogleGagal; jangan jadi "unhandled rejection".
  janji.catch(() => {});
  return janji;
}

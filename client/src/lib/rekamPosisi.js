/**
 * Perekaman posisi otomatis untuk layar isi data.
 *
 * Tujuannya memberi koordinat pada SETIAP data, termasuk data dari formulir
 * yang tidak punya pertanyaan lokasi, supaya cakupan sensus bisa dipetakan dan
 * diperiksa (bukti petugas memang datang ke lokasi objek).
 *
 * Yang disengaja di sini:
 *
 * 1. Posisi DIPANTAU selama layar terbuka (watchPosition), bukan diambil sekali.
 *    Pembacaan pertama biasanya berasal dari jaringan / Wi-Fi dan meleset
 *    ratusan meter; selama petugas mengisi, GPS sempat mengunci satelit dan
 *    pembacaan yang lebih teliti menggantikannya.
 *
 * 2. Statusnya diumumkan ke layar, supaya petugas tahu SEBELUM menyimpan bila
 *    lokasinya belum terekam, kasar, atau masih di kantor.
 *
 * 3. Kegagalan tidak pernah melempar. Izin ditolak, sinyal tidak dapat, browser
 *    tanpa GPS, laman bukan HTTPS - data tetap bisa disimpan (setelah petugas
 *    mengonfirmasi), hanya tanpa koordinat.
 *
 * Catatan: browser SELALU meminta izin lokasi ke pengguna. "Otomatis" di sini
 * berarti petugas tidak perlu menekan tombol apa pun, bukan berarti diam-diam.
 */

/** Batas menunggu satu pembacaan sebelum melapor gagal (pemantauan jalan terus). */
const TIMEOUT_MS = 20000;

/** Posisi hasil cache browser masih dipakai bila belum lebih tua dari ini. */
const UMUR_MAKS_MS = 120000;

/** Pembacaan terbaik diganti pembacaan baru bila sudah setua ini, walau kalah teliti. */
const SEGAR_MS = 30000;

/** Jeda maksimal yang boleh dibebankan pada saat menekan Simpan. */
const TUNGGU_SIMPAN_MS = 1500;

/**
 * Mode `ikuti` (titik biru "Lokasi saya"): pembacaan baru selalu dipakai, kecuali
 * jauh lebih kasar dari pembacaan yang masih segar - mis. lonjakan sesaat dari
 * jaringan (±1 km) di tengah GPS (±10 m). "Jauh lebih kasar" = lebih dari dua kali
 * dan lebih dari 25 m lebih kasar.
 */
export function pakaiPembacaan(lama, baru, { ikuti = false } = {}) {
  if (!lama) return true;
  const a = baru.akurasi ?? Infinity;
  const b = lama.akurasi ?? Infinity;
  if (!ikuti) return a <= b || baru.waktu - lama.waktu > SEGAR_MS;
  return a <= Math.max(b * 2, b + 25) || baru.waktu - lama.waktu > SEGAR_MS;
}

/** Jarak dua posisi { lat, lon } dalam meter (cukup teliti untuk jarak pendek). */
export function jarakMeter(a, b) {
  const y = (b.lat - a.lat) * 110574;
  const x = (b.lon - a.lon) * 111320 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(x, y);
}

/**
 * Peta perlu dipusatkan ulang ke posisi baru? Ya bila ketelitiannya membaik
 * nyata (GPS baru mengunci) atau posisinya berpindah lebih jauh dari
 * ketelitiannya - bukan setiap goyangan kecil.
 */
export function perluPusatkanUlang(lama, baru) {
  if (!lama) return true;
  const a = baru.akurasi ?? Infinity;
  const b = lama.akurasi ?? Infinity;
  if (a < b * 0.7) return true;
  return jarakMeter(lama, baru) > Math.max(10, Number.isFinite(a) ? a : 0);
}

const adaGps = () => typeof navigator !== "undefined" && "geolocation" in navigator;

function pesanGalat(err) {
  if (err && err.code === 1) return "Izin lokasi ditolak. Izinkan akses lokasi untuk situs ini di pengaturan browser.";
  if (err && err.code === 3) return "GPS belum mendapat sinyal.";
  return "Lokasi tidak dapat dibaca. Pastikan GPS / lokasi HP aktif.";
}

/**
 * Pantau posisi perangkat.
 *
 * @param {(keadaan: { status: "mencari"|"siap"|"gagal", posisi: object|null, galat: string }) => void} onUbah
 * @param {{ segar?: boolean, ikuti?: boolean }} [opsi] segar = tolak posisi hasil cache (dipakai rekam ulang);
 *   ikuti = titik biru "Lokasi saya" yang mengikuti perangkat: posisi cache ditolak dan pembacaan
 *   terbaru yang dipakai (pakaiPembacaan), bukan pembacaan tertelitinya - perangkat bisa berpindah
 * @returns {() => void} penghenti - panggil saat layar ditutup
 */
export function pantauPosisi(onUbah, { segar = false, ikuti = false } = {}) {
  if (!adaGps()) {
    onUbah({ status: "gagal", posisi: null, galat: "Perangkat atau browser ini tidak mendukung lokasi." });
    return () => {};
  }

  let terbaik = null;
  let id = null;
  onUbah({ status: "mencari", posisi: null, galat: "" });

  try {
    id = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos?.coords;
        if (!c || typeof c.latitude !== "number" || typeof c.longitude !== "number") return;
        const baru = {
          lat: c.latitude,
          lon: c.longitude,
          akurasi: typeof c.accuracy === "number" ? c.accuracy : null,
          waktu: Date.now(),
        };
        if (pakaiPembacaan(terbaik, baru, { ikuti })) terbaik = baru;
        onUbah({ status: "siap", posisi: terbaik, galat: "" });
      },
      (err) => {
        // Pembacaan yang sudah ada tetap dipakai; pemantauan berjalan terus.
        if (!terbaik) onUbah({ status: "gagal", posisi: null, galat: pesanGalat(err) });
      },
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: segar || ikuti ? 0 : UMUR_MAKS_MS }
    );
  } catch {
    // Beberapa browser melempar bila laman tidak aman (bukan HTTPS).
    onUbah({ status: "gagal", posisi: null, galat: "Lokasi hanya bisa dibaca lewat alamat https://." });
  }

  return () => {
    if (id !== null) navigator.geolocation.clearWatch(id);
  };
}

/**
 * Posisi untuk disertakan saat menyimpan. Bila GPS masih mencari, tunggu
 * sebentar (paling lama TUNGGU_SIMPAN_MS) daripada membuat petugas menunggu lama.
 *
 * @param {() => { status: string, posisi: object|null }} baca keadaan terkini
 * @returns {Promise<{ lat, lon, akurasi } | null>}
 */
export async function ambilPosisi(baca) {
  if (baca().status === "mencari") await new Promise((r) => setTimeout(r, TUNGGU_SIMPAN_MS));
  const p = baca().posisi;
  return p ? { lat: p.lat, lon: p.lon, akurasi: p.akurasi } : null;
}

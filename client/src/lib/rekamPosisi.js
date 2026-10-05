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
 * @param {{ segar?: boolean }} [opsi] segar = tolak posisi hasil cache (dipakai rekam ulang)
 * @returns {() => void} penghenti - panggil saat layar ditutup
 */
export function pantauPosisi(onUbah, { segar = false } = {}) {
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
        const lebihTeliti = !terbaik || (baru.akurasi ?? Infinity) <= (terbaik.akurasi ?? Infinity);
        if (lebihTeliti || baru.waktu - terbaik.waktu > SEGAR_MS) terbaik = baru;
        onUbah({ status: "siap", posisi: terbaik, galat: "" });
      },
      (err) => {
        // Pembacaan yang sudah ada tetap dipakai; pemantauan berjalan terus.
        if (!terbaik) onUbah({ status: "gagal", posisi: null, galat: pesanGalat(err) });
      },
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: segar ? 0 : UMUR_MAKS_MS }
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

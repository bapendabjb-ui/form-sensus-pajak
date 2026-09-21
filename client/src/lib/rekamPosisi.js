/**
 * Perekaman posisi otomatis untuk layar isi data.
 *
 * Tujuannya memberi koordinat pada SETIAP data, termasuk data dari formulir
 * yang tidak punya pertanyaan lokasi, supaya cakupan sensus bisa dipetakan.
 * Koordinatnya hanya boleh dilihat admin; penyaringannya di sisi server.
 *
 * Dua hal yang disengaja di sini:
 *
 * 1. Pengambilan dimulai saat layar isi data dibuka, bukan saat tombol Simpan
 *    ditekan. GPS dingin bisa perlu puluhan detik, dan menunggu selama itu di
 *    tengah penyimpanan akan terasa seperti aplikasi menggantung.
 *
 * 2. Kegagalan APA PUN menghasilkan null, tidak pernah melempar. Izin ditolak,
 *    sinyal tidak dapat, browser tanpa GPS, laman bukan HTTPS - semuanya berarti
 *    data tetap tersimpan tanpa koordinat. Pendataan tidak boleh terhalang
 *    urusan GPS.
 *
 * Catatan: browser SELALU meminta izin lokasi ke pengguna. "Otomatis" di sini
 * berarti petugas tidak perlu menekan tombol apa pun, bukan berarti diam-diam.
 */

/** Batas menunggu satu pembacaan. Lewat ini, data disimpan tanpa koordinat. */
const TIMEOUT_MS = 20000;

/** Posisi hasil cache browser masih dipakai bila belum lebih tua dari ini. */
const UMUR_MAKS_MS = 120000;

/** Jeda maksimal yang boleh dibebankan pada saat menekan Simpan. */
const TUNGGU_SIMPAN_MS = 1500;

const adaGps = () => typeof navigator !== "undefined" && "geolocation" in navigator;

/**
 * Mulai mengambil posisi. Kembalikan promise yang SELALU selesai - berisi
 * { lat, lon, akurasi } atau null. Panggil sekali saat layar dibuka.
 */
export function mulaiRekamPosisi() {
  if (!adaGps()) return Promise.resolve(null);

  return new Promise((resolve) => {
    let selesai = false;
    const sekali = (nilai) => {
      if (selesai) return;
      selesai = true;
      resolve(nilai);
    };

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = pos?.coords;
          if (!c || typeof c.latitude !== "number" || typeof c.longitude !== "number") return sekali(null);
          sekali({
            lat: c.latitude,
            lon: c.longitude,
            akurasi: typeof c.accuracy === "number" ? c.accuracy : null,
          });
        },
        () => sekali(null),
        { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: UMUR_MAKS_MS }
      );
    } catch {
      // Beberapa browser melempar bila laman tidak aman (bukan HTTPS).
      sekali(null);
    }
  });
}

/**
 * Ambil hasil perekaman untuk disertakan saat menyimpan.
 *
 * Menunggu paling lama TUNGGU_SIMPAN_MS: bila GPS belum mengunci, data tetap
 * disimpan tanpa koordinat daripada membuat petugas menunggu.
 *
 * @param {Promise<object|null>|null} janji hasil mulaiRekamPosisi()
 */
export async function ambilRekamPosisi(janji) {
  if (!janji) return null;
  let pewaktu;
  const batas = new Promise((r) => {
    pewaktu = setTimeout(() => r(null), TUNGGU_SIMPAN_MS);
  });
  try {
    return await Promise.race([janji, batas]);
  } catch {
    return null;
  } finally {
    clearTimeout(pewaktu);
  }
}

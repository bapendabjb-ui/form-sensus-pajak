/**
 * Pemeriksaan koordinat pertanyaan Lokasi di layar isi data - salinan
 * server/src/cekLokasi.js.
 *
 * Angkanya (titik kantor, batas akurasi) datang dari server lewat
 * /api/konfigurasi; di sini hanya rumusnya. Status yang dihitung server untuk
 * data yang sudah tersimpan tetap menjadi acuan.
 */

/** Jarak dua titik dalam meter (haversine). */
export function jarakMeter(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const adaTitik = (t) => !!t && typeof t.lat === "number" && typeof t.lon === "number";

/**
 * "baik" | "tanpa" | "kantor" | "kasar". `aturan` = konfigurasi.lokasi dari server;
 * tanpa aturan (konfigurasi belum termuat) area kantor & akurasi tidak diperiksa.
 */
export function nilaiTitik(t, aturan) {
  if (!adaTitik(t)) return "tanpa";
  if (t.manual || !aturan) return "baik";
  const { kantor, akurasiKasarM } = aturan;
  if (kantor && jarakMeter(t, kantor) <= kantor.radiusM) return "kantor";
  if (typeof t.akurasi === "number" && t.akurasi > akurasiKasarM) return "kasar";
  return "baik";
}

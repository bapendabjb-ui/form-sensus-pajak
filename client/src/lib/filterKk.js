/**
 * Filter daftar kertas kerja. Disimpan per tab browser supaya tetap terpakai saat
 * kembali dari detail, dan bisa dipasang dari Dashboard sebelum pindah layar.
 */

const KUNCI = "sensus-pajak:filter-kk";

export const FILTER_KK = [
  ["semua", "Semua"],
  ["draft", "Draft"],
  ["selesai", "Selesai"],
  ["kurang", "Berkas tidak lengkap"],
];

const sah = new Set(FILTER_KK.map(([k]) => k));

export function bacaFilterKk() {
  try {
    const f = sessionStorage.getItem(KUNCI);
    return sah.has(f) ? f : "semua";
  } catch {
    return "semua";
  }
}

export function simpanFilterKk(f) {
  try {
    sessionStorage.setItem(KUNCI, f);
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

/** Apakah kertas kerja ringkas `k` lolos filter `f`. */
export function cocokFilterKk(k, f) {
  if (f === "draft" || f === "selesai") return k.status === f;
  if (f === "kurang") return k.jumlahTidakLengkap > 0;
  return true;
}

/**
 * Apakah kertas kerja ringkas `k` cocok dengan kata kunci `kata`.
 *
 * Sengaja hanya mencocokkan nomor kertas kerja - nama petugas dan NIP tidak
 * ikut dicari. Untuk menelusuri petugas, gunakan menu Petugas.
 *
 * Nomor dicocokkan sebagai penggalan angka, jadi mengetik "4" sudah menemukan
 * "00004" tanpa perlu menghitung nolnya. Spasi diabaikan, dan huruf apa pun
 * yang terketik dibuang lebih dulu supaya nomor tetap ketemu.
 */
export function cocokCariKk(k, kata) {
  const q = String(kata || "").replace(/\D/g, "");
  if (!q) return true;
  return String(k.nomor || "").includes(q);
}

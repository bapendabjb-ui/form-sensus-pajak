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

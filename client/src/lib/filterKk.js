/**
 * Keadaan daftar kertas kerja - saringan, kata kunci pencarian, dan posisi
 * terakhir. Disimpan per tab browser supaya tetap terpakai saat kembali dari
 * detail, dan saringan bisa dipasang dari Dashboard sebelum pindah layar.
 */

const KUNCI = "sensus-pajak:filter-kk";

export const FILTER_KK = [
  ["semua", "Semua"],
  ["draft", "Draft"],
  ["selesai", "Selesai"],
  ["kurang", "Berkas tidak lengkap"],
  ["lokasi", "Lokasi perlu dicek"],
  // Hanya tampil untuk admin: kertas kerja yang lokasi sensusnya belum ditandai sudah dicek.
  ["belumdicek", "Lokasi belum dicek", { admin: true }],
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
  if (f === "lokasi") return lokasiPerluCek(k);
  if (f === "belumdicek") return k.jumlahData > 0 && !k.lokasiDicek;
  return true;
}

/** Kertas kerja ringkas yang titik lokasinya perlu dicek (sama dengan saringan server). */
export const lokasiPerluCek = (k) =>
  k.jumlahData > 0 && ["tanpa", "kantor", "kasar"].includes(k.lokasiStatus);

const KUNCI_CARI = "sensus-pajak:cari-kk";
const KUNCI_POSISI = "sensus-pajak:posisi-kk";

/** Kata kunci pencarian terakhir di daftar kertas kerja. */
export function bacaCariKk() {
  try {
    return sessionStorage.getItem(KUNCI_CARI) || "";
  } catch {
    return "";
  }
}

export function simpanCariKk(teks) {
  try {
    if (teks) sessionStorage.setItem(KUNCI_CARI, teks);
    else sessionStorage.removeItem(KUNCI_CARI);
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

/**
 * Posisi daftar saat sebuah kertas kerja dibuka: berapa halaman sudah dimuat
 * dan sejauh mana digulir. Dipulihkan sekali saat kembali ke daftar.
 */
export function simpanPosisiKk(hal, gulir) {
  try {
    sessionStorage.setItem(KUNCI_POSISI, JSON.stringify({ hal, gulir }));
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

/** Ambil lalu hapus posisi tersimpan. @returns {{ hal: number, gulir: number } | null} */
export function ambilPosisiKk() {
  try {
    const p = JSON.parse(sessionStorage.getItem(KUNCI_POSISI) || "null");
    sessionStorage.removeItem(KUNCI_POSISI);
    if (!p || !Number.isInteger(p.hal) || p.hal < 1 || typeof p.gulir !== "number") return null;
    return { hal: Math.min(p.hal, 20), gulir: Math.max(0, p.gulir) };
  } catch {
    return null;
  }
}

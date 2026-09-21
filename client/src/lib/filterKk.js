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

/** Angka sependek ini dianggap nomor kertas kerja, bukan penggalan NIP. */
const MIN_DIGIT_NIP = 4;

/**
 * Apakah kertas kerja ringkas `k` cocok dengan kata kunci `kata`.
 *
 * Dicocokkan ke nomor kertas kerja serta nama dan NIP anggota timnya - tiga hal
 * yang diingat petugas saat mencari pekerjaannya sendiri. Nomor dicocokkan
 * sebagai penggalan, jadi mengetik "4" sudah menemukan "00004" tanpa perlu
 * menghitung nolnya. NIP dibandingkan tanpa spasi, sama seperti di menu Petugas.
 *
 * NIP hanya ikut dicocokkan bila yang diketik minimal MIN_DIGIT_NIP digit:
 * NIP panjang (18 digit) hampir pasti memuat angka pendek apa pun, sehingga
 * mengetik "12" untuk mencari kertas kerja 00012 justru akan menarik semua
 * kertas kerja yang NIP petugasnya kebetulan mengandung "12".
 */
export function cocokCariKk(k, kata) {
  const q = String(kata || "").trim().toLowerCase();
  if (!q) return true;

  if (String(k.nomor || "").toLowerCase().includes(q)) return true;

  const angka = q.replace(/\s/g, "");
  const cariNip = angka.length >= MIN_DIGIT_NIP;
  return (k.petugas || []).some(
    (p) =>
      String(p.nama || "").toLowerCase().includes(q) ||
      (cariNip && String(p.nip || "").replace(/\s/g, "").includes(angka))
  );
}

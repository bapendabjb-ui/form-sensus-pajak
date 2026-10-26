/* Perkakas kecil yang dipakai bersama oleh keempat layar kertas kerja. */

export const urlKk = (id) => `/kertas-kerja/${id}`;

/**
 * Ekspor khusus admin, jadi unduhannya kini lewat fetch bertoken dan bisa
 * gagal (sesi habis, jaringan putus). Bungkus supaya galatnya sampai ke
 * pengguna, bukan tenggelam sebagai promise yang ditolak diam-diam.
 */
export const unduh = (toast) => (janji) => janji.catch((e) => toast(e.message, true));

/**
 * Susunan tampil halaman isi / lihat data. Pertanyaan berposisi kiri/kanan yang
 * berurutan dikumpulkan menjadi satu blok dua kolom; pertanyaan lebar penuh memutus blok.
 * @returns {Array<{ penuh: object } | { kiri: object[], kanan: object[] }>}
 */
export function susunTataLetak(pertanyaan) {
  const blok = [];
  for (const q of pertanyaan) {
    if (q.kolom !== "kiri" && q.kolom !== "kanan") {
      blok.push({ penuh: q });
      continue;
    }
    let akhir = blok[blok.length - 1];
    if (!akhir || akhir.penuh) {
      akhir = { kiri: [], kanan: [] };
      blok.push(akhir);
    }
    akhir[q.kolom].push(q);
  }
  return blok;
}

/** "Andi Saputra" atau "Andi Saputra +2" - cukup pendek untuk baris keterangan. */
export const ringkasTim = (petugas = []) => {
  if (!petugas.length) return "—";
  const lain = petugas.length - 1;
  return lain > 0 ? `${petugas[0].nama} +${lain}` : petugas[0].nama;
};

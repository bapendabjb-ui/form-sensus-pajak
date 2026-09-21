/* Perkakas kecil yang dipakai bersama oleh keempat layar kertas kerja. */

export const urlKk = (id) => `/kertas-kerja/${id}`;

/**
 * Ekspor khusus admin, jadi unduhannya kini lewat fetch bertoken dan bisa
 * gagal (sesi habis, jaringan putus). Bungkus supaya galatnya sampai ke
 * pengguna, bukan tenggelam sebagai promise yang ditolak diam-diam.
 */
export const unduh = (toast) => (janji) => janji.catch((e) => toast(e.message, true));

/** "Andi Saputra" atau "Andi Saputra +2" - cukup pendek untuk baris keterangan. */
export const ringkasTim = (petugas = []) => {
  if (!petugas.length) return "—";
  const lain = petugas.length - 1;
  return lain > 0 ? `${petugas[0].nama} +${lain}` : petugas[0].nama;
};

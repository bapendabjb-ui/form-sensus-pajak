/* Perkakas akun login yang dibuatkan admin (petugas & pejabat). */

/** Tanpa huruf yang mudah tertukar saat dibacakan (0/o, 1/l/i), sama dengan server. */
const HURUF_PASSWORD = "abcdefghjkmnpqrstuvwxyz23456789";

export function passwordAcak(panjang = 10) {
  const acak = new Uint32Array(panjang);
  crypto.getRandomValues(acak);
  return Array.from(acak, (n) => HURUF_PASSWORD[n % HURUF_PASSWORD.length]).join("");
}

/** Salin username & password ke papan klip. Mengembalikan true bila berhasil. */
export async function salinAkun({ username, password }) {
  try {
    await navigator.clipboard.writeText(`Username: ${username}\nPassword: ${password}`);
    return true;
  } catch {
    return false;
  }
}

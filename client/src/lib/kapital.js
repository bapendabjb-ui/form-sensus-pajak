/** Huruf pertama tiap kalimat (awal teks, setelah . ! ? atau baris baru) dijadikan kapital. */
export const kapitalAwalKalimat = (s) =>
  s.replace(/(^\s*|[.!?]\s+|\n\s*)(\p{Ll})/gu, (_, awal, huruf) => awal + huruf.toUpperCase());

/**
 * Huruf pertama tiap kata kapital, sisanya kecil: "RECKY AMIN s.kom" -> "Recky Amin S.Kom".
 * Samakan dengan server/src/nama.js.
 */
export const kapitalTiapKata = (s) =>
  s.toLowerCase().replace(/(^|[\s.\-])(\p{Ll})/gu, (_, awal, huruf) => awal + huruf.toUpperCase());

/**
 * onChange untuk input teks yang memformat nilai sambil diketik.
 * Nilai DOM diganti langsung dan posisi kursor dikembalikan, supaya kursor
 * tidak melompat ke akhir saat menyunting di tengah teks.
 */
export const ubahDengan = (format, onChange) => (e) => {
  const el = e.target;
  const baru = format(el.value);
  if (baru !== el.value) {
    const { selectionStart, selectionEnd } = el;
    el.value = baru;
    el.setSelectionRange(selectionStart, selectionEnd);
  }
  onChange(baru);
};

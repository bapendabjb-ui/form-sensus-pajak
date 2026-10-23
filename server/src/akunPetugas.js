"use strict";

/**
 * Aturan akun login petugas: bentuk username, pembuatan username dari nama,
 * dan password acak untuk akun yang dibuatkan admin. Semuanya murni (tanpa
 * database) supaya bisa diuji terpisah.
 */

const crypto = require("crypto");
const { PASSWORD_MIN, PASSWORD_MAKS } = require("./auth");

const USERNAME_MAKS = 64;

/** Username disimpan dan dicocokkan dalam huruf kecil: "Andi.S" sama dengan "andi.s". */
const normalUsername = (u) => String(u || "").trim().toLowerCase();

/** Pesan galat untuk username yang sudah dinormalkan, atau "" bila sah. */
function galatUsername(u) {
  if (!u) return "Username wajib diisi.";
  if (u.length < 3) return "Username minimal 3 karakter.";
  if (u.length > USERNAME_MAKS) return `Username maksimal ${USERNAME_MAKS} karakter.`;
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(u)) {
    return "Username hanya boleh huruf, angka, titik, garis bawah, dan tanda hubung, diawali huruf atau angka.";
  }
  return "";
}

/** Pesan galat untuk password baru, atau "" bila sah. */
function galatPassword(p) {
  const s = String(p || "");
  if (s.length < PASSWORD_MIN) return `Password minimal ${PASSWORD_MIN} karakter.`;
  if (Buffer.byteLength(s) > PASSWORD_MAKS) return `Password maksimal ${PASSWORD_MAKS} karakter.`;
  return "";
}

/**
 * Username dasar dari nama: dua kata pertama, huruf kecil, dipisah titik.
 * Gelar dibuang - bagian setelah koma ("Andi Saputra, S.Kom") dan kata bertitik
 * ("Drs.", "H.") - begitu pula tanda diakritik ("Zé" -> "ze").
 *   "H. Ahmad Fauzi, S.E."  -> "ahmad.fauzi"
 */
function usernameDariNama(nama) {
  const kata = String(nama || "")
    .split(",")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter((k) => k && !k.includes("."))
    .map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  const dasar = kata.slice(0, 2).join(".").slice(0, USERNAME_MAKS - 4);
  return dasar.length >= 3 ? dasar : `petugas${dasar ? `.${dasar}` : ""}`;
}

/**
 * Username yang belum terpakai: dasarnya sendiri, atau diberi angka di
 * belakang ("andi.saputra2"). `terpakai` (Set huruf kecil) ikut diisi supaya
 * pemanggil yang membuat banyak akun sekaligus tidak menghasilkan kembaran.
 */
function usernameUnik(dasar, terpakai) {
  let calon = dasar;
  for (let i = 2; terpakai.has(calon); i++) calon = `${dasar}${i}`;
  terpakai.add(calon);
  return calon;
}

/**
 * Tanpa huruf/angka yang mudah tertukar saat dibacakan atau disalin dari
 * kertas: 0/o, 1/l/i. 31 simbol x 10 karakter ~ 2^49 kemungkinan - jauh di
 * luar jangkauan penebak yang dibatasi 10 kegagalan per 15 menit.
 */
const HURUF_PASSWORD = "abcdefghjkmnpqrstuvwxyz23456789";

function buatPassword(panjang = 10) {
  let hasil = "";
  for (let i = 0; i < panjang; i++) hasil += HURUF_PASSWORD[crypto.randomInt(HURUF_PASSWORD.length)];
  return hasil;
}

module.exports = {
  USERNAME_MAKS,
  HURUF_PASSWORD,
  normalUsername,
  galatUsername,
  galatPassword,
  usernameDariNama,
  usernameUnik,
  buatPassword,
};

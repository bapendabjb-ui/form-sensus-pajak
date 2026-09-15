"use strict";

/**
 * Huruf pertama tiap kata kapital, sisanya kecil: "RECKY AMIN s.kom" -> "Recky Amin S.Kom".
 * Samakan dengan client/src/lib/kapital.js.
 */
const kapitalTiapKata = (s) =>
  String(s).toLowerCase().replace(/(^|[\s.\-])(\p{Ll})/gu, (_, awal, huruf) => awal + huruf.toUpperCase());

module.exports = { kapitalTiapKata };

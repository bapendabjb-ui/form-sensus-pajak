"use strict";

/**
 * Titik masuk PM2 di server kantor (lihat deploy/ecosystem.config.js).
 *
 * Sebelum aplikasi dimuat, kode dikembalikan ke versi Git bila ada yang
 * menyuntingnya langsung di server (deploy/jaga-kode.js). Karena PM2 menjalankan
 * berkas ini setiap kali aplikasi start, restart, atau hidup lagi setelah crash,
 * suntingan yang merusak kode tidak bisa membuat situs mati berkepanjangan.
 */

const path = require("path");
const { pulihkanKode, laporkan } = require("./jaga-kode");

try {
  laporkan(pulihkanKode());
} catch (e) {
  // Git bermasalah tidak boleh menahan aplikasi start; penjagaannya saja yang terlewat.
  console.error("[Sensus Pajak] pemeriksaan kode terhadap Git dilewati:", e.message);
}

require(path.join(__dirname, "..", "server", "index.js"));

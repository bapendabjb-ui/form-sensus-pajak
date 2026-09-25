"use strict";

/**
 * Konfigurasi PM2 untuk server kantor (aaPanel).
 *
 *   pm2 start deploy/ecosystem.config.js     (pertama kali)
 *   pm2 reload sensus-pajak                  (setelah pembaruan - lihat deploy/perbarui.sh)
 *   pm2 save                                 (agar ikut hidup lagi setelah server reboot)
 *
 * Semua pengaturan aplikasi tetap dibaca dari .env di root repo; di sini hanya
 * cara menjalankan prosesnya. Satu instance saja: pembatas laju login dan cek
 * NOP menyimpan hitungannya di memori proses (lihat server/src/laju.js), dan
 * penyapuan foto yatim cukup dijalankan satu proses.
 */

const path = require("path");

module.exports = {
  apps: [
    {
      name: "sensus-pajak",
      cwd: path.join(__dirname, ".."),
      script: "server/index.js",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "512M",
      // Beri waktu server menutup koneksi dan Prisma (lihat shutdown di server/index.js).
      kill_timeout: 12000,
      time: true,
    },
  ],
};

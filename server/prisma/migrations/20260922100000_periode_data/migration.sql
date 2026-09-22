-- Sensus Pajak: penanda periode data.
--
-- Draf isian petugas tersimpan di localStorage perangkat masing-masing dan tidak
-- terjangkau server. Angka ini dinaikkan setiap kali seluruh kertas kerja
-- di-reset (server/scripts/reset-kertas-kerja.js); browser yang mendapati angka
-- berbeda dari yang ia simpan membuang semua draf lamanya.

-- AlterTable
ALTER TABLE `nomor_counter` ADD COLUMN `periode` INTEGER NOT NULL DEFAULT 0;

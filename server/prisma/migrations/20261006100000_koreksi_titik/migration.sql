-- Sensus Pajak: koreksi titik objek lewat peta.
--
-- GPS asli (kolom rekam_*) tetap disimpan sebagai bukti kunjungan; koreksi
-- menggantikannya sebagai titik objek di Peta Sensus dan pemeriksaan lokasi.
-- Data lama tidak berubah: semua kolom baru kosong.

-- AlterTable
ALTER TABLE `entri` ADD COLUMN `koreksi_lat` DOUBLE NULL,
    ADD COLUMN `koreksi_lon` DOUBLE NULL,
    ADD COLUMN `koreksi_oleh` VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN `koreksi_waktu` DATETIME(3) NULL;

-- Sensus Pajak: sumber isi otomatis dari data EPBB (hasil cek NOP) per pertanyaan.
-- Kosong = tidak diisi otomatis. Nilai yang dikenal: lihat SUMBER_EPBB di server/src/epbb.js.

-- AlterTable
ALTER TABLE `pertanyaan` ADD COLUMN `isi_epbb` VARCHAR(30) NOT NULL DEFAULT '';

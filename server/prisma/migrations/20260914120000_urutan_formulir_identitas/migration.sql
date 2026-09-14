-- FormKita:
--   1. Urutan bank formulir yang bisa disusun ulang admin (seret / drag & drop).
--   2. Tipe pertanyaan baru "rtrw" (RT & RW 3 digit), "nik" (16 digit),
--      dan "npwp" (15-17 digit).

-- AlterTable
ALTER TABLE `formulir` ADD COLUMN `urutan` INTEGER NOT NULL DEFAULT 0;

-- Formulir lama belum punya urutan. Isi mengikuti urutan pembuatan supaya
-- susunan yang selama ini tampil di bank formulir tidak berubah.
SET @baris := 0;
UPDATE `formulir` SET `urutan` = (@baris := @baris + 1) ORDER BY `created_at` ASC, `id` ASC;

-- AlterTable
ALTER TABLE `pertanyaan` MODIFY `tipe` ENUM('text', 'paragraph', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'range', 'linetariff', 'foto', 'wilayah', 'lokasi', 'rtrw', 'nik', 'npwp') NOT NULL;

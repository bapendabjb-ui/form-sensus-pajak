-- FormKita: judul kertas kerja yang diketik petugas saat membuat.
-- Menggantikan nama petugas sebagai identitas kertas kerja di daftar.

-- AlterTable
ALTER TABLE `kertas_kerja` ADD COLUMN `judul` VARCHAR(200) NOT NULL DEFAULT '';

-- Kertas kerja lama belum punya judul. Isi dari nomornya supaya tidak ada
-- baris yang tampil tanpa judul di daftar.
UPDATE `kertas_kerja` SET `judul` = CONCAT('Kertas kerja ', `nomor`) WHERE `judul` = '';

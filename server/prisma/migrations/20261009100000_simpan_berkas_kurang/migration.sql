-- Sensus Pajak: formulir yang boleh disimpan tanpa isian wajib bila berkasnya
-- ditandai tidak lengkap (pertanyaan Lokasi tetap wajib). Bawaan mati, jadi
-- semua formulir yang ada tetap berperilaku seperti sebelumnya.

-- AlterTable
ALTER TABLE `formulir` ADD COLUMN `simpan_berkas_kurang` BOOLEAN NOT NULL DEFAULT false;

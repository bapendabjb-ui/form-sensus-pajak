-- FormKita: ikon per formulir (nama ikon Lucide, mis. "store"). Kosong = tampilkan nomor urut.

-- AlterTable
ALTER TABLE `formulir` ADD COLUMN `ikon` VARCHAR(40) NOT NULL DEFAULT '';

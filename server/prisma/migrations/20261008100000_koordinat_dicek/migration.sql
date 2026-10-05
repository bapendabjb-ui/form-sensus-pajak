-- Sensus Pajak: tanda "sudah dicek" dari admin untuk lokasi sensus (per
-- kertas kerja) dan koordinat objek (per data). Yang sudah dicek terkunci:
-- hanya admin yang bisa mengubahnya. Data lama tidak berubah: semua belum dicek.

-- AlterTable
ALTER TABLE `kertas_kerja` ADD COLUMN `lokasi_dicek_at` DATETIME(3) NULL,
    ADD COLUMN `lokasi_dicek_oleh` VARCHAR(64) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `entri` ADD COLUMN `koordinat_dicek_at` DATETIME(3) NULL,
    ADD COLUMN `koordinat_dicek_oleh` VARCHAR(64) NOT NULL DEFAULT '';

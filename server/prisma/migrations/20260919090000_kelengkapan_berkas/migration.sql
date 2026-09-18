-- Sensus Pajak: penanda "berkas tidak lengkap" per data, beserta catatan kekurangannya.

-- AlterTable
ALTER TABLE `entri` ADD COLUMN `berkas_lengkap` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `catatan_berkas` VARCHAR(500) NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX `entri_berkas_lengkap_idx` ON `entri`(`berkas_lengkap`);

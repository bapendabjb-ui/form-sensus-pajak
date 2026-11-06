-- Sensus Pajak: integrasi NIB BPN dengan NOP PBB.
--
-- 1. Tipe pertanyaan baru "nib" (Bidang Tanah BPN): petugas mencatat satu atau
--    beberapa bidang BPN yang ditempati objek pajak, dipilih di peta atau
--    diketik dari sertifikat, atau menandai tanah belum bersertifikat.
-- 2. Tabel entri_nib: bentuk ternormalisasi jawaban itu bersama NOP datanya,
--    untuk mencocokkan NIB dengan NOP di seluruh data (src/integrasi.js).
-- 3. Indeks persil (aktif, kode_wilayah, nib): mencari bidang dari NIB yang dicatat.
--
-- Tidak ada data lama yang berubah.

-- AlterTable
ALTER TABLE `pertanyaan` MODIFY `tipe` ENUM('text', 'paragraph', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'range', 'linetariff', 'foto', 'wilayah', 'lokasi', 'rtrw', 'nik', 'npwp', 'nop', 'niknpwp', 'telepon', 'luas', 'nib') NOT NULL;

-- CreateTable
CREATE TABLE `entri_nib` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entri_id` INTEGER NOT NULL,
    `pertanyaan_id` INTEGER NOT NULL,
    `kode_wilayah` VARCHAR(20) NOT NULL DEFAULT '',
    `nib` VARCHAR(30) NOT NULL,
    `nop` VARCHAR(18) NOT NULL DEFAULT '',
    `sumber` VARCHAR(12) NOT NULL DEFAULT '',
    `luas_peta` DOUBLE NULL,
    `urutan` INTEGER NOT NULL DEFAULT 0,

    INDEX `entri_nib_kunci_idx`(`kode_wilayah`, `nib`),
    INDEX `entri_nib_nop_idx`(`nop`),
    INDEX `entri_nib_entri_id_idx`(`entri_id`),
    INDEX `entri_nib_pertanyaan_id_idx`(`pertanyaan_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `entri_nib` ADD CONSTRAINT `entri_nib_entri_id_fkey` FOREIGN KEY (`entri_id`) REFERENCES `entri`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entri_nib` ADD CONSTRAINT `entri_nib_pertanyaan_id_fkey` FOREIGN KEY (`pertanyaan_id`) REFERENCES `pertanyaan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX `persil_kode_nib_idx` ON `persil`(`aktif`, `kode_wilayah`, `nib`);

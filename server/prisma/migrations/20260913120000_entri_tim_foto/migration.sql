-- FormKita: kertas kerja berisi banyak entri per formulir, tim petugas (1-8),
-- dan tipe pertanyaan foto. Data lama dipindahkan, bukan dibuang:
--   * petugas tunggal       -> baris pertama kertas_kerja_petugas
--   * formulir terpilih yang sudah punya jawaban -> satu entri
--   * jawaban & rincian_tarif -> ditautkan ke entri tersebut
-- Kolom kertas_kerja.nama_objek dihapus; nama objek kini diisi lewat formulir.

-- AlterTable: tipe pertanyaan baru "foto"
ALTER TABLE `pertanyaan` MODIFY `tipe` ENUM('text', 'paragraph', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'range', 'linetariff', 'foto') NOT NULL;

-- CreateTable: tim petugas
CREATE TABLE `kertas_kerja_petugas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kertas_kerja_id` INTEGER NOT NULL,
    `petugas_id` INTEGER NOT NULL,
    `urutan` INTEGER NOT NULL DEFAULT 0,

    INDEX `kertas_kerja_petugas_petugas_id_idx`(`petugas_id`),
    UNIQUE INDEX `kertas_kerja_petugas_unik`(`kertas_kerja_id`, `petugas_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `kertas_kerja_petugas` (`kertas_kerja_id`, `petugas_id`, `urutan`)
SELECT `id`, `petugas_id`, 0 FROM `kertas_kerja`;

-- CreateTable: entri
CREATE TABLE `entri` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kertas_kerja_id` INTEGER NOT NULL,
    `formulir_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `entri_kertas_kerja_id_idx`(`kertas_kerja_id`),
    INDEX `entri_formulir_id_idx`(`formulir_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `entri` (`kertas_kerja_id`, `formulir_id`, `created_at`, `updated_at`)
SELECT kkf.`kertas_kerja_id`, kkf.`formulir_id`, kk.`created_at`, CURRENT_TIMESTAMP(3)
FROM `kertas_kerja_formulir` kkf
JOIN `kertas_kerja` kk ON kk.`id` = kkf.`kertas_kerja_id`
WHERE EXISTS (
    SELECT 1 FROM `jawaban` j
    JOIN `pertanyaan` p ON p.`id` = j.`pertanyaan_id`
    WHERE j.`kertas_kerja_id` = kkf.`kertas_kerja_id` AND p.`formulir_id` = kkf.`formulir_id`
)
ORDER BY kkf.`kertas_kerja_id`, kkf.`urutan`;

-- AlterTable: jawaban -> milik entri
ALTER TABLE `jawaban` ADD COLUMN `entri_id` INTEGER NULL;

UPDATE `jawaban` j
JOIN `pertanyaan` p ON p.`id` = j.`pertanyaan_id`
JOIN `entri` e ON e.`kertas_kerja_id` = j.`kertas_kerja_id` AND e.`formulir_id` = p.`formulir_id`
SET j.`entri_id` = e.`id`;

DELETE FROM `jawaban` WHERE `entri_id` IS NULL;

ALTER TABLE `jawaban` DROP FOREIGN KEY `jawaban_kertas_kerja_id_fkey`;
ALTER TABLE `jawaban` DROP INDEX `jawaban_kertas_kerja_id_pertanyaan_id_key`;
ALTER TABLE `jawaban` DROP COLUMN `kertas_kerja_id`, MODIFY `entri_id` INTEGER NOT NULL;
CREATE UNIQUE INDEX `jawaban_entri_id_pertanyaan_id_key` ON `jawaban`(`entri_id`, `pertanyaan_id`);

-- AlterTable: rincian_tarif -> milik entri
ALTER TABLE `rincian_tarif` ADD COLUMN `entri_id` INTEGER NULL;

UPDATE `rincian_tarif` rt
JOIN `pertanyaan` p ON p.`id` = rt.`pertanyaan_id`
JOIN `entri` e ON e.`kertas_kerja_id` = rt.`kertas_kerja_id` AND e.`formulir_id` = p.`formulir_id`
SET rt.`entri_id` = e.`id`;

DELETE FROM `rincian_tarif` WHERE `entri_id` IS NULL;

ALTER TABLE `rincian_tarif` DROP FOREIGN KEY `rincian_tarif_kertas_kerja_id_fkey`;
ALTER TABLE `rincian_tarif` DROP INDEX `rincian_tarif_kertas_kerja_id_idx`;
ALTER TABLE `rincian_tarif` DROP COLUMN `kertas_kerja_id`, MODIFY `entri_id` INTEGER NOT NULL;
CREATE INDEX `rincian_tarif_entri_id_idx` ON `rincian_tarif`(`entri_id`);

-- CreateTable: foto
CREATE TABLE `foto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entri_id` INTEGER NULL,
    `pertanyaan_id` INTEGER NULL,
    `berkas` VARCHAR(200) NOT NULL,
    `nama_asli` VARCHAR(200) NOT NULL DEFAULT '',
    `mime` VARCHAR(40) NOT NULL,
    `ukuran` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `foto_berkas_key`(`berkas`),
    INDEX `foto_entri_id_idx`(`entri_id`),
    INDEX `foto_pertanyaan_id_idx`(`pertanyaan_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: kertas_kerja tidak lagi menyimpan petugas tunggal & nama objek
ALTER TABLE `kertas_kerja` DROP FOREIGN KEY `kertas_kerja_petugas_id_fkey`;
ALTER TABLE `kertas_kerja` DROP INDEX `kertas_kerja_petugas_id_idx`;
ALTER TABLE `kertas_kerja` DROP COLUMN `petugas_id`, DROP COLUMN `nama_objek`;

-- DropTable: pemilihan formulir di awal digantikan entri
DROP TABLE `kertas_kerja_formulir`;

-- AddForeignKey
ALTER TABLE `kertas_kerja_petugas` ADD CONSTRAINT `kertas_kerja_petugas_kertas_kerja_id_fkey` FOREIGN KEY (`kertas_kerja_id`) REFERENCES `kertas_kerja`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kertas_kerja_petugas` ADD CONSTRAINT `kertas_kerja_petugas_petugas_id_fkey` FOREIGN KEY (`petugas_id`) REFERENCES `petugas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entri` ADD CONSTRAINT `entri_kertas_kerja_id_fkey` FOREIGN KEY (`kertas_kerja_id`) REFERENCES `kertas_kerja`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entri` ADD CONSTRAINT `entri_formulir_id_fkey` FOREIGN KEY (`formulir_id`) REFERENCES `formulir`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jawaban` ADD CONSTRAINT `jawaban_entri_id_fkey` FOREIGN KEY (`entri_id`) REFERENCES `entri`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rincian_tarif` ADD CONSTRAINT `rincian_tarif_entri_id_fkey` FOREIGN KEY (`entri_id`) REFERENCES `entri`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `foto` ADD CONSTRAINT `foto_entri_id_fkey` FOREIGN KEY (`entri_id`) REFERENCES `entri`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `foto` ADD CONSTRAINT `foto_pertanyaan_id_fkey` FOREIGN KEY (`pertanyaan_id`) REFERENCES `pertanyaan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

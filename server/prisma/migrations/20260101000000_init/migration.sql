-- FormKita: migrasi awal (MySQL 8)

-- CreateTable
CREATE TABLE `admin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(64) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,

    UNIQUE INDEX `admin_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `petugas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(150) NOT NULL,
    `nip` VARCHAR(40) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `formulir` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `judul` VARCHAR(200) NOT NULL,
    `deskripsi` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pertanyaan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `formulir_id` INTEGER NOT NULL,
    `tipe` ENUM('text', 'paragraph', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'range', 'linetariff') NOT NULL,
    `label` VARCHAR(300) NOT NULL,
    `wajib` BOOLEAN NOT NULL DEFAULT false,
    `range_harga` BOOLEAN NOT NULL DEFAULT false,
    `urutan` INTEGER NOT NULL DEFAULT 0,

    INDEX `pertanyaan_formulir_id_idx`(`formulir_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pertanyaan_opsi` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pertanyaan_id` INTEGER NOT NULL,
    `nilai` VARCHAR(200) NOT NULL,
    `urutan` INTEGER NOT NULL DEFAULT 0,

    INDEX `pertanyaan_opsi_pertanyaan_id_idx`(`pertanyaan_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kertas_kerja` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nomor` CHAR(5) NOT NULL,
    `nama_objek` VARCHAR(200) NOT NULL,
    `petugas_id` INTEGER NOT NULL,
    `status` ENUM('draft', 'selesai') NOT NULL DEFAULT 'draft',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `kertas_kerja_nomor_key`(`nomor`),
    INDEX `kertas_kerja_petugas_id_idx`(`petugas_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kertas_kerja_formulir` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kertas_kerja_id` INTEGER NOT NULL,
    `formulir_id` INTEGER NOT NULL,
    `urutan` INTEGER NOT NULL DEFAULT 0,

    INDEX `kertas_kerja_formulir_formulir_id_idx`(`formulir_id`),
    UNIQUE INDEX `kertas_kerja_formulir_unik`(`kertas_kerja_id`, `formulir_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jawaban` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kertas_kerja_id` INTEGER NOT NULL,
    `pertanyaan_id` INTEGER NOT NULL,
    `nilai` JSON NOT NULL,

    INDEX `jawaban_pertanyaan_id_idx`(`pertanyaan_id`),
    UNIQUE INDEX `jawaban_kertas_kerja_id_pertanyaan_id_key`(`kertas_kerja_id`, `pertanyaan_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rincian_tarif` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kertas_kerja_id` INTEGER NOT NULL,
    `pertanyaan_id` INTEGER NOT NULL,
    `layanan` VARCHAR(200) NOT NULL,
    `jenis` VARCHAR(100) NOT NULL DEFAULT '',
    `harga_min` DECIMAL(18, 2) NULL,
    `harga_max` DECIMAL(18, 2) NULL,
    `urutan` INTEGER NOT NULL DEFAULT 0,

    INDEX `rincian_tarif_kertas_kerja_id_idx`(`kertas_kerja_id`),
    INDEX `rincian_tarif_pertanyaan_id_idx`(`pertanyaan_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `nomor_counter` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `last_nomor` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pertanyaan` ADD CONSTRAINT `pertanyaan_formulir_id_fkey` FOREIGN KEY (`formulir_id`) REFERENCES `formulir`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pertanyaan_opsi` ADD CONSTRAINT `pertanyaan_opsi_pertanyaan_id_fkey` FOREIGN KEY (`pertanyaan_id`) REFERENCES `pertanyaan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kertas_kerja` ADD CONSTRAINT `kertas_kerja_petugas_id_fkey` FOREIGN KEY (`petugas_id`) REFERENCES `petugas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kertas_kerja_formulir` ADD CONSTRAINT `kertas_kerja_formulir_kertas_kerja_id_fkey` FOREIGN KEY (`kertas_kerja_id`) REFERENCES `kertas_kerja`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kertas_kerja_formulir` ADD CONSTRAINT `kertas_kerja_formulir_formulir_id_fkey` FOREIGN KEY (`formulir_id`) REFERENCES `formulir`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jawaban` ADD CONSTRAINT `jawaban_kertas_kerja_id_fkey` FOREIGN KEY (`kertas_kerja_id`) REFERENCES `kertas_kerja`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jawaban` ADD CONSTRAINT `jawaban_pertanyaan_id_fkey` FOREIGN KEY (`pertanyaan_id`) REFERENCES `pertanyaan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rincian_tarif` ADD CONSTRAINT `rincian_tarif_kertas_kerja_id_fkey` FOREIGN KEY (`kertas_kerja_id`) REFERENCES `kertas_kerja`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rincian_tarif` ADD CONSTRAINT `rincian_tarif_pertanyaan_id_fkey` FOREIGN KEY (`pertanyaan_id`) REFERENCES `pertanyaan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: satu baris counter penomoran
INSERT INTO `nomor_counter` (`id`, `last_nomor`) VALUES (1, 0);

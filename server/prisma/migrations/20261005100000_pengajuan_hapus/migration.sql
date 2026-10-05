-- Sensus Pajak: pengajuan hapus kertas kerja / data oleh petugas.
--
-- Petugas tidak boleh menghapus sendiri; mereka mengajukan beserta alasannya,
-- lalu admin menyetujui (sasarannya dihapus) atau menolak. Barisnya tetap
-- disimpan sebagai jejak: tautan menjadi NULL saat sasaran terhapus, sementara
-- nomor kertas kerja dan judul data sudah disalin ke kolomnya sendiri.

-- CreateTable
CREATE TABLE `pengajuan_hapus` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `jenis` ENUM('kertas_kerja', 'entri') NOT NULL,
    `kertas_kerja_id` INTEGER NULL,
    `entri_id` INTEGER NULL,
    `nomor_kk` CHAR(5) NOT NULL,
    `judul` VARCHAR(300) NOT NULL DEFAULT '',
    `alasan` VARCHAR(500) NOT NULL,
    `pengaju` VARCHAR(150) NOT NULL,
    `status` ENUM('menunggu', 'disetujui', 'ditolak') NOT NULL DEFAULT 'menunggu',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `diputuskan_at` DATETIME(3) NULL,
    `diputuskan_oleh` VARCHAR(64) NOT NULL DEFAULT '',

    INDEX `pengajuan_hapus_status_idx`(`status`),
    INDEX `pengajuan_hapus_kertas_kerja_id_idx`(`kertas_kerja_id`),
    INDEX `pengajuan_hapus_entri_id_idx`(`entri_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pengajuan_hapus` ADD CONSTRAINT `pengajuan_hapus_kertas_kerja_id_fkey` FOREIGN KEY (`kertas_kerja_id`) REFERENCES `kertas_kerja`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pengajuan_hapus` ADD CONSTRAINT `pengajuan_hapus_entri_id_fkey` FOREIGN KEY (`entri_id`) REFERENCES `entri`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

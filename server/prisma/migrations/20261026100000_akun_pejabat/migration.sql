-- Sensus Pajak: akun pejabat.
--
-- Pejabat (pimpinan) masuk dengan akunnya sendiri untuk melihat kertas kerja,
-- data, dan peta. Server menolak semua permintaan tulis dari akun ini. Tabel
-- baru saja; tidak ada data lama yang berubah.

-- CreateTable
CREATE TABLE `pejabat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(150) NOT NULL,
    `username` VARCHAR(64) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `token_versi` INTEGER NOT NULL DEFAULT 0,
    `masuk_terakhir` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pejabat_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

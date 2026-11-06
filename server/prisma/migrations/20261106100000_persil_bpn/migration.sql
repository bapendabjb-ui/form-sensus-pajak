-- Sensus Pajak: persil (bidang tanah) dari peta pendaftaran BPN.
--
-- Admin mengimpor shapefile persil per kecamatan; Peta Sensus memuatnya per
-- petak (sel_lat / sel_lon) dan ekspor mencantumkan NIB bidang tempat titik
-- sensus berada. Tabel baru saja; tidak ada data lama yang berubah.

-- CreateTable
CREATE TABLE `persil` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nib` VARCHAR(30) NOT NULL DEFAULT '',
    `kode_wilayah` VARCHAR(20) NOT NULL DEFAULT '',
    `kecamatan` VARCHAR(100) NOT NULL DEFAULT '',
    `kelurahan` VARCHAR(100) NOT NULL DEFAULT '',
    `tipe_hak` VARCHAR(60) NOT NULL DEFAULT '',
    `luas_peta` DOUBLE NULL,
    `atribut` TEXT NOT NULL,
    `geometri` MEDIUMTEXT NOT NULL,
    `min_lat` DOUBLE NOT NULL,
    `min_lon` DOUBLE NOT NULL,
    `max_lat` DOUBLE NOT NULL,
    `max_lon` DOUBLE NOT NULL,
    `sel_lat` INTEGER NOT NULL,
    `sel_lon` INTEGER NOT NULL,
    `besar` BOOLEAN NOT NULL DEFAULT false,
    `kunci_wilayah` VARCHAR(250) NOT NULL,
    `impor` VARCHAR(24) NOT NULL,
    `aktif` BOOLEAN NOT NULL DEFAULT false,
    `dibuat_oleh` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `persil_petak_idx`(`aktif`, `besar`, `sel_lat`, `sel_lon`),
    INDEX `persil_wilayah_idx`(`aktif`, `kunci_wilayah`),
    INDEX `persil_nib_idx`(`nib`),
    INDEX `persil_impor_idx`(`impor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

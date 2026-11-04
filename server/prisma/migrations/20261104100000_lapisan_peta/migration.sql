-- Sensus Pajak: lapisan peta dari GIS.
--
-- Admin mengunggah GeoJSON (mis. batas blok PBB atau persil dari QGIS / ArcGIS)
-- yang digambar di atas Peta Sensus. Tabel baru saja; tidak ada data lama yang
-- berubah.

-- CreateTable
CREATE TABLE `lapisan_peta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(100) NOT NULL,
    `warna` VARCHAR(7) NOT NULL DEFAULT '#2563EB',
    `tampil` BOOLEAN NOT NULL DEFAULT true,
    `isi` LONGTEXT NOT NULL,
    `jumlah_fitur` INTEGER NOT NULL,
    `ukuran` INTEGER NOT NULL,
    `dibuat_oleh` VARCHAR(64) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

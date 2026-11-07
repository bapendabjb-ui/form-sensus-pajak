-- Sensus Pajak: pemadanan NIB-NOP per bidang (lapisan Terintegrasi).
--
-- Tabel padanan_bidang: keputusan petugas / admin untuk bidang yang punya
-- beberapa NOP, atau yang NOP-nya juga tercatat di bidang lain - NOP mana yang
-- benar untuk bidang itu, dan apa yang perlu dilakukan dengan NOP lainnya
-- (terdaftar dua kali, digabung, milik bidang lain, atau semua sah dan
-- bidangnya perlu dipecah). Satu baris per bidang.
--
-- Tidak ada data lama yang berubah.

-- CreateTable
CREATE TABLE `padanan_bidang` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kode_wilayah` VARCHAR(20) NOT NULL DEFAULT '',
    `nib` VARCHAR(30) NOT NULL,
    `hasil` VARCHAR(10) NOT NULL,
    `nop_utama` VARCHAR(18) NOT NULL DEFAULT '',
    `rincian` JSON NOT NULL,
    `catatan` VARCHAR(200) NOT NULL DEFAULT '',
    `oleh_peran` VARCHAR(10) NOT NULL DEFAULT '',
    `oleh_id` INTEGER NULL,
    `oleh_nama` VARCHAR(150) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `padanan_bidang_unik`(`kode_wilayah`, `nib`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

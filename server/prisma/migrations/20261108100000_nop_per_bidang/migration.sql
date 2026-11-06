-- Sensus Pajak: NOP PBB per bidang BPN, dicatat langsung dari Peta Sensus.
--
-- Tabel bidang_nop: NOP yang ditambahkan petugas / admin pada sebuah bidang
-- lewat tab NOP di panel bidang, tanpa formulir. Bersama entri_nib membentuk
-- lapisan NOP PBB (src/integrasi.js). Satu bidang boleh beberapa NOP, satu NOP
-- boleh beberapa bidang; pasangan yang sama hanya sekali.
--
-- Tidak ada data lama yang berubah.

-- CreateTable
CREATE TABLE `bidang_nop` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kode_wilayah` VARCHAR(20) NOT NULL DEFAULT '',
    `nib` VARCHAR(30) NOT NULL,
    `nop` VARCHAR(18) NOT NULL,
    `keterangan` VARCHAR(200) NOT NULL DEFAULT '',
    `oleh_peran` VARCHAR(10) NOT NULL DEFAULT '',
    `oleh_id` INTEGER NULL,
    `oleh_nama` VARCHAR(150) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `bidang_nop_unik`(`kode_wilayah`, `nib`, `nop`),
    INDEX `bidang_nop_nop_idx`(`nop`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

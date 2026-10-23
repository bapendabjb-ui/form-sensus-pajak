-- Sensus Pajak: login petugas.
--
-- Petugas kini punya akun (username + password dari admin) dan sesi yang
-- diingat di HP. Kewajiban login dikendalikan admin lewat tabel pengaturan,
-- jadi deploy ini sendiri tidak mengunci siapa pun: saklarnya mati sampai admin
-- menyalakannya setelah akun petugas dibagikan.

-- AlterTable
ALTER TABLE `petugas`
    ADD COLUMN `username` VARCHAR(64) NULL,
    ADD COLUMN `password_hash` VARCHAR(255) NULL,
    ADD COLUMN `token_versi` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `masuk_terakhir` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `petugas_username_key` ON `petugas`(`username`);

-- AlterTable: siapa yang menyimpan / terakhir mengubah data.
ALTER TABLE `entri`
    ADD COLUMN `dibuat_oleh` VARCHAR(150) NOT NULL DEFAULT '',
    ADD COLUMN `diubah_oleh` VARCHAR(150) NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE `pengaturan` (
    `id` INTEGER NOT NULL,
    `wajib_login_petugas` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `pengaturan` (`id`, `wajib_login_petugas`) VALUES (1, false);

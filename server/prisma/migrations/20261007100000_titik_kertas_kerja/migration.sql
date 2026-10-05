-- Sensus Pajak: titik objek pindah dari data (entri) ke kertas kerja.
--
-- Satu kertas kerja = satu rumah / bidang, jadi titiknya satu. GPS asli tetap
-- direkam per data (kolom entri.rekam_*) sebagai bukti kunjungan. Koordinat
-- objek lain (mis. rumah kedua pada PBB-P2) tetap lewat pertanyaan Lokasi.
--
-- Koreksi per data dari migrasi sebelumnya dipindahkan: koreksi terbaru di
-- setiap kertas kerja menjadi titik kertas kerja itu, lalu kolomnya dihapus.
-- lokasi_status dibiarkan NULL; server menghitungnya saat start.

-- AlterTable
ALTER TABLE `kertas_kerja` ADD COLUMN `lokasi_status` VARCHAR(10) NULL,
    ADD COLUMN `titik_akurasi` DOUBLE NULL,
    ADD COLUMN `titik_lat` DOUBLE NULL,
    ADD COLUMN `titik_lon` DOUBLE NULL,
    ADD COLUMN `titik_oleh` VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN `titik_sumber` VARCHAR(10) NOT NULL DEFAULT '',
    ADD COLUMN `titik_waktu` DATETIME(3) NULL;

-- Pindahkan koreksi terbaru per kertas kerja.
UPDATE `kertas_kerja` kk
JOIN (
    SELECT e.`kertas_kerja_id`, e.`koreksi_lat`, e.`koreksi_lon`, e.`koreksi_waktu`, e.`koreksi_oleh`
    FROM `entri` e
    JOIN (
        SELECT `kertas_kerja_id`, MAX(`koreksi_waktu`) AS `terakhir`
        FROM `entri`
        WHERE `koreksi_lat` IS NOT NULL AND `koreksi_lon` IS NOT NULL
        GROUP BY `kertas_kerja_id`
    ) t ON t.`kertas_kerja_id` = e.`kertas_kerja_id` AND t.`terakhir` = e.`koreksi_waktu`
    WHERE e.`koreksi_lat` IS NOT NULL AND e.`koreksi_lon` IS NOT NULL
) k ON k.`kertas_kerja_id` = kk.`id`
SET kk.`titik_lat` = k.`koreksi_lat`,
    kk.`titik_lon` = k.`koreksi_lon`,
    kk.`titik_sumber` = 'peta',
    kk.`titik_waktu` = k.`koreksi_waktu`,
    kk.`titik_oleh` = k.`koreksi_oleh`;

-- AlterTable
ALTER TABLE `entri` DROP COLUMN `koreksi_lat`,
    DROP COLUMN `koreksi_lon`,
    DROP COLUMN `koreksi_oleh`,
    DROP COLUMN `koreksi_waktu`;

-- CreateIndex
CREATE INDEX `kertas_kerja_lokasi_status_idx` ON `kertas_kerja`(`lokasi_status`);

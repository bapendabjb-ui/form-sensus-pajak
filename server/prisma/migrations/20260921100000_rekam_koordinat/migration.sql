-- Sensus Pajak: koordinat perangkat petugas yang direkam otomatis saat sebuah
-- data pertama kali disimpan. Tidak berasal dari pertanyaan di formulir, jadi
-- data dari formulir tanpa pertanyaan lokasi (mis. PBB-P2) tetap bisa dipetakan.
--
-- Boleh NULL: izin lokasi bisa ditolak petugas dan GPS bisa gagal, dan dalam
-- keadaan itu data tetap harus bisa disimpan.
--
-- Isinya hanya boleh dilihat admin; penyaringannya dilakukan di lapisan API.

-- AlterTable
ALTER TABLE `entri` ADD COLUMN `rekam_lat` DOUBLE NULL,
    ADD COLUMN `rekam_lon` DOUBLE NULL,
    ADD COLUMN `rekam_akurasi` DOUBLE NULL,
    ADD COLUMN `rekam_waktu` DATETIME(3) NULL;

-- Peta admin menyaring entri yang punya koordinat rekaman.
CREATE INDEX `entri_rekam_lat_idx` ON `entri`(`rekam_lat`);

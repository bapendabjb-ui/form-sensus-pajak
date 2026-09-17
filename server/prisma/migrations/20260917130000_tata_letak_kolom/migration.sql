-- Sensus Pajak: tata letak dua kolom pada halaman isi data.
--   pertanyaan.kolom           : '' = lebar penuh, 'kiri' / 'kanan' = bersanding
--   formulir.judul_kolom_kiri  : judul di atas kolom kiri (mis. "Subjek Pajak"), boleh kosong
--   formulir.judul_kolom_kanan : judul di atas kolom kanan (mis. "Objek Pajak"), boleh kosong

-- AlterTable
ALTER TABLE `pertanyaan` ADD COLUMN `kolom` VARCHAR(10) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `formulir` ADD COLUMN `judul_kolom_kiri` VARCHAR(100) NOT NULL DEFAULT '',
    ADD COLUMN `judul_kolom_kanan` VARCHAR(100) NOT NULL DEFAULT '';

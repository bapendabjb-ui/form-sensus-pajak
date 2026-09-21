-- Sensus Pajak: penanda versi token admin.
--
-- Token admin berupa JWT yang tidak bisa ditarik kembali setelah diterbitkan,
-- sehingga mengganti password tidak menghentikan sesi lain yang sedang berjalan
-- sampai tokennya kedaluwarsa (12 jam). Angka ini ikut ditulis ke dalam token
-- dan dinaikkan setiap password diganti; token dengan angka lama lalu ditolak.

-- AlterTable
ALTER TABLE `admin` ADD COLUMN `token_versi` INTEGER NOT NULL DEFAULT 0;

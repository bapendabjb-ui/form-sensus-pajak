-- FormKita: keterangan (petunjuk pengisian) per pertanyaan, tampil di bawah judulnya.

-- AlterTable
ALTER TABLE `pertanyaan` ADD COLUMN `keterangan` VARCHAR(500) NOT NULL DEFAULT '';

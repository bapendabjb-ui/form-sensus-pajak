-- Sensus Pajak: penanda jawaban yang diisi otomatis dari data EPBB (hasil cek NOP)
-- dan belum diubah petugas.

-- AlterTable
ALTER TABLE `jawaban` ADD COLUMN `dari_epbb` BOOLEAN NOT NULL DEFAULT false;

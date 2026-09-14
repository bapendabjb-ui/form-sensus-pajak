-- Sensus Pajak: tipe pertanyaan "lokasi" (titik koordinat GPS).

-- AlterTable
ALTER TABLE `pertanyaan` MODIFY `tipe` ENUM('text', 'paragraph', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'range', 'linetariff', 'foto', 'wilayah', 'lokasi') NOT NULL;

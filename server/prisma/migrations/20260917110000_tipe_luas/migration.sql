-- Sensus Pajak: tipe pertanyaan "luas" — luas tanah & luas bangunan (m²) dalam satu pertanyaan,
-- disimpan sebagai { tanah, bangunan }.

-- AlterTable
ALTER TABLE `pertanyaan` MODIFY `tipe` ENUM('text', 'paragraph', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'range', 'linetariff', 'foto', 'wilayah', 'lokasi', 'rtrw', 'nik', 'npwp', 'nop', 'niknpwp', 'telepon', 'luas') NOT NULL;

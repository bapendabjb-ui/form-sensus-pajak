-- FormKita: tipe pertanyaan "nop" — Nomor Objek Pajak PBB, 18 digit.

-- AlterTable
ALTER TABLE `pertanyaan` MODIFY `tipe` ENUM('text', 'paragraph', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'range', 'linetariff', 'foto', 'wilayah', 'lokasi', 'rtrw', 'nik', 'npwp', 'nop') NOT NULL;

-- FormKita: tipe pertanyaan "wilayah" (kecamatan & kelurahan bertingkat).

-- AlterTable
ALTER TABLE `pertanyaan` MODIFY `tipe` ENUM('text', 'paragraph', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'range', 'linetariff', 'foto', 'wilayah') NOT NULL;

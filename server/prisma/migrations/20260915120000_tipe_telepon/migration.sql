-- FormKita: tipe pertanyaan "telepon" — satu atau lebih nomor telepon berketerangan,
-- disimpan sebagai array { keterangan, nomor }.

-- AlterTable
ALTER TABLE `pertanyaan` MODIFY `tipe` ENUM('text', 'paragraph', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'range', 'linetariff', 'foto', 'wilayah', 'lokasi', 'rtrw', 'nik', 'npwp', 'nop', 'niknpwp', 'telepon') NOT NULL;

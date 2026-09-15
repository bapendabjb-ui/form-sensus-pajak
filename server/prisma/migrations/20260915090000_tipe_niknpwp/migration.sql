-- FormKita: tipe pertanyaan "niknpwp" — NIK dan NPWP dalam satu pertanyaan,
-- disimpan sebagai { nik, npwp }. Wajib diisi berarti minimal salah satunya terisi.

-- AlterTable
ALTER TABLE `pertanyaan` MODIFY `tipe` ENUM('text', 'paragraph', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'range', 'linetariff', 'foto', 'wilayah', 'lokasi', 'rtrw', 'nik', 'npwp', 'nop', 'niknpwp') NOT NULL;

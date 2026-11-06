import { useTitipan, hapusTitipan } from "../lib/titipanBidang.js";
import { nibLengkap } from "../lib/nib.js";
import { formatNop } from "../lib/format.js";

/**
 * Pengingat di halaman kertas kerja selama ada bidang yang dititipkan dari
 * Peta Sensus ("Isi formulir PBB" di tab NOP, lib/titipanBidang.js): bidang
 * dan NOP-nya terisi otomatis di formulir PBB berikutnya.
 *
 * di : "daftar" (pilih kertas kerja dulu) | "detail" (tinggal Tambah data)
 */
export default function PitaTitipan({ di = "daftar" }) {
  const t = useTitipan();
  if (!t) return null;
  const nib = nibLengkap(t.bidang.kode, t.bidang.nib);
  const langkah =
    di === "detail"
      ? "Tekan Tambah data lalu pilih formulir PBB"
      : "Buka kertas kerja (atau buat baru), tekan Tambah data, lalu pilih formulir PBB";
  return (
    <div className="fk-titipan" role="status">
      <span>
        Mencatat bidang <b>NIB {nib}</b>
        {t.nop && (
          <>
            {" "}
            dengan <b>NOP {formatNop(t.nop)}</b>
          </>
        )}
        . {langkah}: bidangnya terisi otomatis.
      </span>
      <button type="button" className="fk-mini" onClick={hapusTitipan}>
        Batal
      </button>
    </div>
  );
}

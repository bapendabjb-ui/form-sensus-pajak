import { useCallback, useRef, useState } from "react";
import { useOutside } from "../../lib/useOutside.js";
import { useMobile } from "../../lib/useMobile.js";
import Sheet from "../Sheet.jsx";
import KelolaLapisan from "../KelolaLapisan.jsx";
import { CheckIcon, IkonLapisan } from "../Icons.jsx";
import { ContohLapisan } from "./bersama.jsx";

/**
 * Tombol "Lapisan" di bilah alat Peta Sensus: nyalakan / matikan lapisan dari
 * GIS (batas blok, persil, ...). Komputer: panel di bawah tombol. HP: lembar
 * dari bawah layar, seperti CustomSelect. Pilihannya tersimpan per browser
 * (lib/lapisanPeta.js).
 *
 * Admin mendapat "Kelola lapisan…" (KelolaLapisan.jsx). Di komputer isinya
 * dibuka di lembar tengah; di HP lembar yang sama berganti isi. Membuka lembar
 * kedua dari lembar pertama tidak bisa: lembar pertama membuang entri
 * riwayatnya secara asinkron saat ditutup, dan itu ikut menutup lembar kedua.
 *
 * lapisan : hasil useLapisanPeta()
 * admin   : boleh mengelola lapisan
 */
export default function PilihLapisan({ lapisan, admin = false }) {
  const { daftar, menyala, ubahNyala, status, muatUlang } = lapisan;
  const [buka, setBuka] = useState(false);
  const [kelola, setKelola] = useState(false);
  const ref = useRef(null);
  const hp = useMobile();
  const tutup = useCallback(() => {
    setBuka(false);
    setKelola(false);
  }, []);
  // Di HP lembarnya dirender di luar komponen, jadi "klik di luar" tidak dipakai.
  useOutside(ref, tutup, buka && !hp);

  // Bukan admin dan belum ada lapisan: tombolnya tidak berguna.
  if (!admin && daftar.length === 0) return null;

  const jumlahNyala = daftar.filter(menyala).length;

  const isi = (
    <div className="fk-lapisan-daftar">
      {daftar.length === 0 && (
        <div className="fk-select-empty">Belum ada lapisan. Unggah GeoJSON dari QGIS / ArcGIS lewat Kelola lapisan.</div>
      )}
      {daftar.map((l) => {
        const on = menyala(l);
        const st = status(l);
        const galat = st && st !== "memuat";
        return (
          <button
            type="button"
            key={l.id}
            role="checkbox"
            aria-checked={on}
            className={"fk-lapisan-opsi" + (on ? " is-on" : "")}
            onClick={() => ubahNyala(l, !on)}
          >
            <span className="fk-ind fk-ind-check">{on && <CheckIcon />}</span>
            <ContohLapisan warna={l.warna} />
            <span className="fk-lapisan-teks">
              <span className="fk-lapisan-nama">{l.nama}</span>
              <span className={"fk-hint-kecil" + (galat ? " fk-lapisan-galat" : "")}>
                {st === "memuat"
                  ? "Memuat…"
                  : galat
                    ? `Gagal dimuat: ${st}`
                    : `${l.jumlahFitur.toLocaleString("id-ID")} fitur`}
              </span>
            </span>
          </button>
        );
      })}
      {admin && (
        <button
          type="button"
          className="fk-mini fk-lapisan-kelola"
          onClick={() => {
            if (!hp) setBuka(false);
            setKelola(true);
          }}
        >
          Kelola lapisan…
        </button>
      )}
    </div>
  );

  return (
    <div className="fk-lapisan" ref={ref}>
      <button
        type="button"
        className={"fk-mini fk-lapisan-btn" + (jumlahNyala ? " is-aktif" : "")}
        onClick={() => setBuka((b) => !b)}
        aria-expanded={buka}
        aria-haspopup="dialog"
        aria-label={`Lapisan peta${jumlahNyala ? `, ${jumlahNyala} menyala` : ""}`}
        title="Lapisan dari GIS (QGIS / ArcGIS)"
      >
        <IkonLapisan />
        <span className="fk-lapisan-label">Lapisan</span>
        {jumlahNyala > 0 && <span className="fk-lapisan-jumlah">{jumlahNyala}</span>}
      </button>

      {buka && !hp && (
        <div className="fk-pop fk-lapisan-panel" role="dialog" aria-label="Lapisan peta">
          {isi}
        </div>
      )}

      {hp && (
        <Sheet open={buka} onClose={tutup} title={kelola ? "Kelola lapisan peta" : "Lapisan peta"}>
          {kelola ? (
            <>
              <button type="button" className="fk-mini fk-lapisan-kembali" onClick={() => setKelola(false)}>
                ← Kembali ke daftar lapisan
              </button>
              <KelolaLapisan daftar={daftar} onBerubah={muatUlang} />
            </>
          ) : (
            isi
          )}
        </Sheet>
      )}

      {!hp && admin && (
        <Sheet open={kelola} onClose={tutup} title="Kelola lapisan peta" tengah>
          <KelolaLapisan daftar={daftar} onBerubah={muatUlang} />
        </Sheet>
      )}
    </div>
  );
}

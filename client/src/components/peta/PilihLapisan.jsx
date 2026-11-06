import { useCallback, useRef, useState } from "react";
import { useOutside } from "../../lib/useOutside.js";
import { useMobile } from "../../lib/useMobile.js";
import { WARNA_PERSIL, PERSIL_ZOOM_MIN } from "../../lib/persilBpn.js";
import Sheet from "../Sheet.jsx";
import KelolaLapisan from "../KelolaLapisan.jsx";
import KelolaPersil from "../KelolaPersil.jsx";
import { CheckIcon, IkonLapisan } from "../Icons.jsx";
import { ContohLapisan } from "./bersama.jsx";

/**
 * Tombol "Lapisan" di bilah alat Peta Sensus: nyalakan / matikan persil BPN
 * dan lapisan dari GIS (batas blok, ...). Komputer: panel di bawah tombol. HP:
 * lembar dari bawah layar, seperti CustomSelect. Pilihannya tersimpan per
 * browser (lib/persilBpn.js, lib/lapisanPeta.js).
 *
 * Admin mendapat "Kelola persil BPN…" (KelolaPersil.jsx) dan "Kelola lapisan…"
 * (KelolaLapisan.jsx). Di komputer isinya dibuka di lembar tengah; di HP lembar
 * yang sama berganti isi. Membuka lembar kedua dari lembar pertama tidak bisa:
 * lembar pertama membuang entri riwayatnya secara asinkron saat ditutup, dan
 * itu ikut menutup lembar kedua.
 *
 * lapisan : hasil useLapisanPeta()
 * persil  : hasil usePersilBpn()
 * admin   : boleh mengelola lapisan dan persil
 */

const JUDUL_KELOLA = { lapisan: "Kelola lapisan peta", persil: "Kelola persil BPN" };

export default function PilihLapisan({ lapisan, persil, admin = false }) {
  const { daftar, menyala, ubahNyala, status, muatUlang } = lapisan;
  const [buka, setBuka] = useState(false);
  const [kelola, setKelola] = useState(null); // null | "lapisan" | "persil"
  const ref = useRef(null);
  const hp = useMobile();
  const tutup = useCallback(() => {
    setBuka(false);
    setKelola(null);
  }, []);
  // Di HP lembarnya dirender di luar komponen, jadi "klik di luar" tidak dipakai.
  useOutside(ref, tutup, buka && !hp);

  // Bukan admin dan belum ada apa-apa: tombolnya tidak berguna.
  if (!admin && daftar.length === 0 && !persil.ada) return null;

  const jumlahNyala = daftar.filter(menyala).length + (persil.ada && persil.nyala ? 1 : 0);

  const bukaKelola = (jenis) => {
    if (!hp) setBuka(false);
    setKelola(jenis);
  };

  const isi = (
    <div className="fk-lapisan-daftar">
      {persil.ada && (
        <button
          type="button"
          role="checkbox"
          aria-checked={persil.nyala}
          className={"fk-lapisan-opsi" + (persil.nyala ? " is-on" : "")}
          onClick={() => persil.ubahNyala(!persil.nyala)}
        >
          <span className="fk-ind fk-ind-check">{persil.nyala && <CheckIcon />}</span>
          <ContohLapisan warna={WARNA_PERSIL} />
          <span className="fk-lapisan-teks">
            <span className="fk-lapisan-nama">Persil BPN</span>
            <span className="fk-hint-kecil">
              {persil.ringkasan.jumlah.toLocaleString("id-ID")} bidang · tampil dari zoom {PERSIL_ZOOM_MIN}
            </span>
          </span>
        </button>
      )}
      {daftar.length === 0 && !persil.ada && (
        <div className="fk-select-empty">
          Belum ada lapisan. Impor persil BPN dari shapefile, atau unggah GeoJSON dari QGIS / ArcGIS.
        </div>
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
        <div className="fk-lapisan-kelola">
          <button type="button" className="fk-mini" onClick={() => bukaKelola("persil")}>
            Kelola persil BPN…
          </button>
          <button type="button" className="fk-mini" onClick={() => bukaKelola("lapisan")}>
            Kelola lapisan…
          </button>
        </div>
      )}
    </div>
  );

  const isiKelola =
    kelola === "persil" ? (
      <KelolaPersil ringkasan={persil.ringkasan} onBerubah={persil.muatUlang} />
    ) : (
      <KelolaLapisan daftar={daftar} onBerubah={muatUlang} />
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
        title="Persil BPN dan lapisan dari GIS (QGIS / ArcGIS)"
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
        <Sheet open={buka} onClose={tutup} title={kelola ? JUDUL_KELOLA[kelola] : "Lapisan peta"}>
          {kelola ? (
            <>
              <button type="button" className="fk-mini fk-lapisan-kembali" onClick={() => setKelola(null)}>
                ← Kembali ke daftar lapisan
              </button>
              {isiKelola}
            </>
          ) : (
            isi
          )}
        </Sheet>
      )}

      {!hp && admin && (
        <Sheet open={Boolean(kelola)} onClose={tutup} title={JUDUL_KELOLA[kelola] || ""} tengah>
          {kelola && isiKelola}
        </Sheet>
      )}
    </div>
  );
}

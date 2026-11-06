import { useCallback, useRef, useState } from "react";
import * as api from "../../api.js";
import { useOutside } from "../../lib/useOutside.js";
import { useMobile } from "../../lib/useMobile.js";
import { formatLuas } from "../../lib/persilBpn.js";
import Sheet from "../Sheet.jsx";
import { IkonCari } from "../Icons.jsx";

/**
 * Tombol "Cari NIB" di bilah alat Peta Sensus: cari bidang persil BPN menurut
 * NIB, lalu peta menuju bidangnya (PetaPage menyorotnya lewat prop `sorot`).
 * Komputer: panel di bawah tombol; HP: lembar dari bawah, seperti PilihLapisan.
 *
 * NIB 5 digit bisa kembar di kelurahan berbeda - hasilnya ditampilkan untuk
 * dipilih. NIB lengkap 13 digit (kode wilayah + NIB) langsung satu bidang.
 *
 * onPilih : (bidang) => void - hasil server/src/persil.js cariNib
 */
export default function CariNib({ onPilih }) {
  const [buka, setBuka] = useState(false);
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState(null); // null = belum mencari
  const [mencari, setMencari] = useState(false);
  const [galat, setGalat] = useState("");
  const ref = useRef(null);
  const hp = useMobile();
  const tutup = useCallback(() => setBuka(false), []);
  useOutside(ref, tutup, buka && !hp);

  const pilih = (b) => {
    setBuka(false);
    onPilih(b);
  };

  const cari = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setMencari(true);
    setGalat("");
    try {
      const daftar = await api.cariPersil(q.trim());
      if (daftar.length === 1) {
        setHasil(null);
        pilih(daftar[0]);
      } else {
        setHasil(daftar);
      }
    } catch (err) {
      setGalat(err.message);
      setHasil(null);
    } finally {
      setMencari(false);
    }
  };

  const isi = (
    <div className="fk-cari-nib">
      <form className="fk-cari-nib-form" onSubmit={cari}>
        <input
          className="fk-input"
          value={q}
          inputMode="numeric"
          placeholder="NIB, mis. 03612"
          aria-label="NIB yang dicari"
          onChange={(e) => setQ(e.target.value)}
          autoFocus={!hp}
        />
        <button type="submit" className="fk-btn" disabled={mencari || !q.trim()}>
          {mencari ? "Mencari…" : "Cari"}
        </button>
      </form>
      <span className="fk-hint-kecil">NIB 5 digit, atau NIB lengkap 13 digit (kode wilayah + NIB).</span>
      {galat && <span className="fk-err">{galat}</span>}
      {hasil && hasil.length === 0 && <span className="fk-hint-kecil">Tidak ada bidang dengan NIB itu.</span>}
      {hasil && hasil.length > 1 && (
        <div className="fk-lapisan-daftar">
          <span className="fk-hint-kecil">
            {hasil.length >= 20 ? "20 bidang pertama" : `${hasil.length} bidang`} dengan NIB itu - pilih kelurahannya:
          </span>
          {hasil.map((b) => (
            <button type="button" key={b.id} className="fk-lapisan-opsi" onClick={() => pilih(b)}>
              <span className="fk-lapisan-teks">
                <span className="fk-lapisan-nama">
                  {b.kelurahan || "(tanpa kelurahan)"}
                  {b.kecamatan ? `, Kec. ${b.kecamatan}` : ""}
                </span>
                <span className="fk-hint-kecil">
                  {[b.nibLengkap, b.tipeHak, formatLuas(b.luasPeta)].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="fk-lapisan" ref={ref}>
      <button
        type="button"
        className="fk-mini fk-lapisan-btn"
        onClick={() => setBuka((b) => !b)}
        aria-expanded={buka}
        aria-haspopup="dialog"
        aria-label="Cari NIB persil BPN"
        title="Cari bidang persil BPN menurut NIB"
      >
        <IkonCari />
        <span className="fk-lapisan-label">Cari NIB</span>
      </button>

      {buka && !hp && (
        <div className="fk-pop fk-lapisan-panel fk-cari-nib-panel" role="dialog" aria-label="Cari NIB">
          {isi}
        </div>
      )}

      {hp && (
        <Sheet open={buka} onClose={tutup} title="Cari NIB persil BPN">
          {isi}
        </Sheet>
      )}
    </div>
  );
}

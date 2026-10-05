import { useId, useState } from "react";
import * as api from "../api.js";
import { bacaKoordinatTeks, tautanPendek } from "../lib/koordinatTeks.js";

/**
 * Tempel koordinat dari aplikasi Google Maps - cara gratis menunjuk titik
 * dengan peta Google, tanpa kuota apa pun. Diterima: teks koordinat hasil
 * tekan lama, derajat-menit-detik, tautan lengkap, dan tautan Bagikan
 * (maps.app.goo.gl, dibuka lewat server).
 *
 * onDapat : (lat, lon) => void
 */
export default function TempelKoordinat({ onDapat }) {
  const id = useId();
  const [teks, setTeks] = useState("");
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const pakai = async () => {
    const isi = teks.trim();
    if (!isi) return;
    setGalat("");

    let k = bacaKoordinatTeks(isi);
    if (!k && tautanPendek(isi)) {
      setSibuk(true);
      try {
        k = await api.bacaTautanPeta(isi);
      } catch (e) {
        setGalat(e.message);
        return;
      } finally {
        setSibuk(false);
      }
    }
    if (!k) {
      setGalat("Koordinat tidak terbaca. Contoh yang benar: -3.439325, 114.829525");
      return;
    }
    onDapat(k.lat, k.lon);
    setTeks("");
  };

  return (
    <div className="fk-tempel">
      <label className="fk-tempel-label" htmlFor={id}>
        Atau tempel dari Google Maps
      </label>
      <div className="fk-tempel-baris">
        <input
          id={id}
          className={"fk-input" + (galat ? " is-invalid" : "")}
          placeholder="-3.439325, 114.829525 atau tautan Bagikan"
          value={teks}
          onChange={(e) => {
            setTeks(e.target.value);
            setGalat("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              pakai();
            }
          }}
          enterKeyHint="done"
          autoComplete="off"
        />
        <button type="button" className="fk-btn-ghost" onClick={pakai} disabled={sibuk || !teks.trim()}>
          {sibuk ? "Membaca..." : "Pakai"}
        </button>
      </div>
      {galat && <span className="fk-err">{galat}</span>}
      <span className="fk-hint-kecil">
        Di aplikasi Google Maps, tekan lama letak objek lalu salin koordinat yang muncul di kotak pencarian, atau
        tekan Bagikan lalu salin tautannya.
      </span>
    </div>
  );
}

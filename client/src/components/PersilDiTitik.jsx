import { useEffect, useState } from "react";
import * as api from "../api.js";
import { formatLuas } from "../lib/persilBpn.js";

/**
 * Bidang persil BPN tempat sebuah titik Lokasi berada, di bawah jawaban
 * Lokasi (layar isi data dan lihat data): NIB, tipe hak, luas peta - luasnya
 * bisa dibandingkan dengan luas tanah isian petugas.
 *
 * Tidak tampil apa pun bila belum ada persil tersimpan, atau server tidak bisa
 * dihubungi (mis. petugas tanpa sinyal): ini keterangan tambahan, bukan isian.
 */
export default function PersilDiTitik({ lat, lon }) {
  const [hasil, setHasil] = useState(null);

  useEffect(() => {
    setHasil(null);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
    let batal = false;
    // Titik bisa berpindah-pindah saat petugas menggeser peta: tunggu sampai diam.
    const t = setTimeout(() => {
      api
        .persilDiTitik(lat, lon)
        .then((h) => !batal && setHasil(h))
        .catch(() => {});
    }, 400);
    return () => {
      batal = true;
      clearTimeout(t);
    };
  }, [lat, lon]);

  if (!hasil || !hasil.ada) return null;
  const p = hasil.persil;
  if (!p) {
    return <p className="fk-persil-titik is-kosong">Tidak ada bidang persil BPN di titik ini.</p>;
  }
  const rincian = [p.tipeHak, p.luasPeta !== null && `luas peta ${formatLuas(p.luasPeta)}`, p.kelurahan].filter(Boolean);
  return (
    <p className="fk-persil-titik">
      <span className="fk-persil-titik-label">Persil BPN</span>
      <span>
        NIB <strong>{p.nibLengkap || p.nib || "—"}</strong>
        {rincian.length > 0 && ` · ${rincian.join(" · ")}`}
      </span>
    </p>
  );
}

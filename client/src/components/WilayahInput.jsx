import { useEffect, useState } from "react";
import * as api from "../api.js";
import CustomSelect from "./CustomSelect.jsx";
import { kapitalTiapKata, ubahDengan } from "../lib/kapital.js";

const PEMISAH = " — Kec. ";

/**
 * Kecamatan & kelurahan bertingkat.
 *   - Setelah kecamatan dipilih, daftar kelurahan hanya berisi kelurahan kecamatan itu.
 *   - Bila kelurahan dipilih lebih dulu, kecamatannya terisi otomatis.
 *   - Mengganti kecamatan mengosongkan kelurahan yang tidak lagi cocok.
 *   - Alamat di luar Banjarbaru (mis. KTP subjek pajak dari daerah lain) bisa diketik manual.
 *
 * value : { kecamatan, kelurahan, manual? }
 */
export default function WilayahInput({ value, onChange, invalid }) {
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    let batal = false;
    api
      .getWilayah()
      .then((d) => !batal && setData(d))
      .catch((e) => !batal && setGalat(e.message));
    return () => {
      batal = true;
    };
  }, []);

  const v = value && typeof value === "object" ? value : { kecamatan: "", kelurahan: "" };

  if (v.manual || galat) {
    const ubah = (patch) => onChange({ kecamatan: v.kecamatan, kelurahan: v.kelurahan, ...patch, manual: true });
    return (
      <div className="fk-wilayah">
        <label className="fk-wilayah-kolom">
          <span className="fk-wilayah-cap">Kecamatan</span>
          <input
            className={`fk-input${invalid && !v.kecamatan ? " is-invalid" : ""}`}
            value={v.kecamatan}
            maxLength={100}
            placeholder="Ketik kecamatan"
            autoCapitalize="words"
            onChange={ubahDengan(kapitalTiapKata, (kecamatan) => ubah({ kecamatan }))}
          />
        </label>
        <label className="fk-wilayah-kolom">
          <span className="fk-wilayah-cap">Kelurahan / Desa</span>
          <input
            className={`fk-input${invalid && !v.kelurahan ? " is-invalid" : ""}`}
            value={v.kelurahan}
            maxLength={100}
            placeholder="Ketik kelurahan / desa"
            autoCapitalize="words"
            onChange={ubahDengan(kapitalTiapKata, (kelurahan) => ubah({ kelurahan }))}
          />
        </label>
        <span className="fk-hint-kecil fk-wilayah-hint">
          {galat ? (
            <span className="fk-err">Data wilayah gagal dimuat ({galat}) — silakan ketik manual.</span>
          ) : (
            <>
              Diketik manual untuk alamat di luar Kota Banjarbaru.{" "}
              <button
                type="button"
                className="fk-textbtn fk-wilayah-alih"
                onClick={() => onChange({ kecamatan: "", kelurahan: "" })}
              >
                Pilih dari daftar Banjarbaru
              </button>
            </>
          )}
        </span>
      </div>
    );
  }

  if (!data) return <span className="fk-hint-kecil">Memuat data wilayah...</span>;

  const kec = data.find((k) => k.nama === v.kecamatan) || null;

  const opsiKelurahan = kec
    ? kec.kelurahan.map((l) => l.nama)
    : data.flatMap((k) => k.kelurahan.map((l) => `${l.nama}${PEMISAH}${k.nama}`));

  const pilihKecamatan = (nama) => {
    const k = data.find((x) => x.nama === nama);
    const masihCocok = k && k.kelurahan.some((l) => l.nama === v.kelurahan);
    onChange({ kecamatan: nama, kelurahan: masihCocok ? v.kelurahan : "" });
  };

  const pilihKelurahan = (label) => {
    if (kec) {
      onChange({ kecamatan: kec.nama, kelurahan: label });
      return;
    }
    const [kelurahan, kecamatan] = label.split(PEMISAH);
    onChange({ kecamatan, kelurahan });
  };

  return (
    <div className="fk-wilayah">
      <div className="fk-wilayah-kolom">
        <span className="fk-wilayah-cap">Kecamatan</span>
        <CustomSelect
          value={v.kecamatan}
          options={data.map((k) => k.nama)}
          placeholder="Pilih Kecamatan"
          invalid={invalid && !v.kecamatan}
          onChange={pilihKecamatan}
        />
      </div>
      <div className="fk-wilayah-kolom">
        <span className="fk-wilayah-cap">Kelurahan</span>
        <CustomSelect
          value={v.kelurahan}
          options={opsiKelurahan}
          placeholder="Pilih Kelurahan"
          invalid={invalid && !v.kelurahan}
          onChange={pilihKelurahan}
        />
      </div>
      <span className="fk-hint-kecil fk-wilayah-hint">
        {!kec && "Pilih kecamatan dulu, atau langsung pilih kelurahan — kecamatannya terisi otomatis. "}
        Alamat di luar Banjarbaru?{" "}
        <button
          type="button"
          className="fk-textbtn fk-wilayah-alih"
          onClick={() => onChange({ kecamatan: v.kecamatan, kelurahan: v.kelurahan, manual: true })}
        >
          Ketik manual
        </button>
      </span>
    </div>
  );
}

import { useEffect, useState } from "react";
import * as api from "../api.js";
import CustomSelect from "./CustomSelect.jsx";

const PEMISAH = " — Kec. ";

/**
 * Kecamatan & kelurahan bertingkat.
 *   - Setelah kecamatan dipilih, daftar kelurahan hanya berisi kelurahan kecamatan itu.
 *   - Bila kelurahan dipilih lebih dulu, kecamatannya terisi otomatis.
 *   - Mengganti kecamatan mengosongkan kelurahan yang tidak lagi cocok.
 *
 * value : { kecamatan, kelurahan }
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

  if (galat) return <span className="fk-err">Data wilayah gagal dimuat: {galat}</span>;
  if (!data) return <span className="fk-hint-kecil">Memuat data wilayah...</span>;

  const v = value && typeof value === "object" ? value : { kecamatan: "", kelurahan: "" };
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
          placeholder="Pilih kecamatan"
          invalid={invalid && !v.kecamatan}
          onChange={pilihKecamatan}
        />
      </div>
      <div className="fk-wilayah-kolom">
        <span className="fk-wilayah-cap">Kelurahan</span>
        <CustomSelect
          value={v.kelurahan}
          options={opsiKelurahan}
          placeholder="Pilih kelurahan"
          invalid={invalid && !v.kelurahan}
          onChange={pilihKelurahan}
        />
      </div>
      {!kec && (
        <span className="fk-hint-kecil fk-wilayah-hint">
          Pilih kecamatan dulu, atau langsung pilih kelurahan — kecamatannya terisi otomatis.
        </span>
      )}
    </div>
  );
}

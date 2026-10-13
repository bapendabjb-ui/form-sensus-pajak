import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api.js";
import CustomSelect from "./CustomSelect.jsx";
import Sheet from "./Sheet.jsx";
import { Chevron, CheckIcon } from "./Icons.jsx";
import { useOutside } from "../lib/useOutside.js";
import { useMobile } from "../lib/useMobile.js";
import { groupNum } from "../lib/format.js";
import { kapitalTiapKata, ubahDengan } from "../lib/kapital.js";

const PEMISAH = " — Kec. ";
/** Kota Banjarbaru dalam kode wilayah Kemendagri. */
const KODE_BANJARBARU = "63.72.";
/** Samakan dengan CARI_MIN_HURUF di server/src/wilayahIndonesia.js. */
const CARI_MIN_HURUF = 3;
const JEDA_CARI_MS = 250;

const KOSONG = { kecamatan: "", kelurahan: "" };
const LUAR = { ...KOSONG, luar: true };

/**
 * Kecamatan & kelurahan, tiga cara mengisi:
 *   - Daftar Banjarbaru (bawaan), bertingkat: setelah kecamatan dipilih daftar kelurahan hanya
 *     berisi kelurahan kecamatan itu; memilih kelurahan lebih dulu mengisi kecamatannya;
 *     mengganti kecamatan mengosongkan kelurahan yang tidak lagi cocok.
 *   - Di luar Banjarbaru (mis. KTP subjek pajak dari daerah lain): cari kelurahan/desa
 *     se-Indonesia, lengkap dengan kecamatan, kabupaten/kota, dan provinsinya.
 *   - Ketik manual, bila tidak ketemu di data mana pun.
 *
 * value : { kecamatan, kelurahan } | { ..., kabupaten, provinsi, kode_kemendagri, luar }
 *       | { ..., kabupaten, provinsi, manual }
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

  const v = value && typeof value === "object" ? value : KOSONG;

  const alih = (label, nilai) => (
    <button type="button" className="fk-textbtn fk-wilayah-alih" onClick={() => onChange(nilai)}>
      {label}
    </button>
  );

  if (v.manual || galat) {
    const ubah = (patch) =>
      onChange({
        kecamatan: v.kecamatan,
        kelurahan: v.kelurahan,
        kabupaten: v.kabupaten || "",
        provinsi: v.provinsi || "",
        ...patch,
        manual: true,
      });
    const kolom = (kunci, judul, wajib) => (
      <label className="fk-wilayah-kolom">
        <span className="fk-wilayah-cap">{judul}</span>
        <input
          className={`fk-input${invalid && wajib && !v[kunci] ? " is-invalid" : ""}`}
          value={v[kunci] || ""}
          maxLength={100}
          placeholder={`Ketik ${judul.toLowerCase()}`}
          autoCapitalize="words"
          onChange={ubahDengan(kapitalTiapKata, (isi) => ubah({ [kunci]: isi }))}
        />
      </label>
    );
    return (
      <div className="fk-wilayah">
        {kolom("kecamatan", "Kecamatan", true)}
        {kolom("kelurahan", "Kelurahan / Desa", true)}
        {kolom("kabupaten", "Kabupaten / Kota")}
        {kolom("provinsi", "Provinsi")}
        <span className="fk-hint-kecil fk-wilayah-hint">
          {galat ? (
            <span className="fk-err">Data wilayah gagal dimuat ({galat}) — silakan ketik manual.</span>
          ) : (
            <>
              Diketik manual untuk alamat yang tidak ada di data wilayah. {alih("Cari se-Indonesia", LUAR)} ·{" "}
              {alih("Pilih dari daftar Banjarbaru", KOSONG)}
            </>
          )}
        </span>
      </div>
    );
  }

  if (v.luar) {
    const pilih = (h) => {
      // Kelurahan Banjarbaru kembali ke daftar Banjarbaru supaya kode SISMIOP-nya ikut tersimpan.
      const kec = h.kode.startsWith(KODE_BANJARBARU) && data?.find((k) => k.nama === h.kecamatan);
      if (kec && kec.kelurahan.some((l) => l.nama === h.kelurahan)) {
        onChange({ kecamatan: h.kecamatan, kelurahan: h.kelurahan });
        return;
      }
      onChange({
        kecamatan: h.kecamatan,
        kelurahan: h.kelurahan,
        kabupaten: h.kabupaten,
        provinsi: h.provinsi,
        kode_kemendagri: h.kode,
        luar: true,
      });
    };
    return (
      <div className="fk-wilayah">
        <div className="fk-wilayah-kolom fk-wilayah-penuh">
          <span className="fk-wilayah-cap">Kelurahan / Desa di luar Banjarbaru</span>
          <CariWilayah value={v} invalid={invalid && !v.kelurahan} onPilih={pilih} />
          {v.kelurahan && (
            <span className="fk-wilayah-rinci">
              Kec. {v.kecamatan}
              {v.kabupaten && ` · ${v.kabupaten}`}
              {v.provinsi && ` · ${v.provinsi}`}
            </span>
          )}
        </div>
        <span className="fk-hint-kecil fk-wilayah-hint">
          Data kelurahan/desa se-Indonesia (Kemendagri). {alih("Kembali ke daftar Banjarbaru", KOSONG)} · Tidak
          ketemu?{" "}
          {alih("Ketik manual", {
            kecamatan: v.kecamatan,
            kelurahan: v.kelurahan,
            kabupaten: v.kabupaten || "",
            provinsi: v.provinsi || "",
            manual: true,
          })}
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
        Alamat di luar Banjarbaru? {alih("Cari se-Indonesia", LUAR)}
      </span>
    </div>
  );
}

/**
 * Pencarian kelurahan/desa se-Indonesia. Tampilannya sama dengan CustomSelect (panel di
 * komputer, lembar dari bawah di HP), tetapi daftarnya dicari di server sambil mengetik:
 * datanya (±84 ribu kelurahan/desa) terlalu besar untuk dikirim utuh ke browser.
 */
function CariWilayah({ value, invalid, onPilih }) {
  const [open, setOpen] = useState(false);
  const [kata, setKata] = useState("");
  const [hasil, setHasil] = useState(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState("");
  const ref = useRef(null);
  const hp = useMobile();

  const tutup = useCallback(() => setOpen(false), []);
  // Di HP lembar pilihan dirender di luar komponen, jadi "klik di luar" tidak dipakai.
  useOutside(ref, tutup, open && !hp);

  const q = kata.trim();
  const cukup = q.replace(/[^a-z0-9]/gi, "").length >= CARI_MIN_HURUF;

  useEffect(() => {
    if (!open || !cukup) {
      setHasil(null);
      setGalat("");
      setMemuat(false);
      return undefined;
    }
    // Balasan untuk ketikan yang sudah berubah diabaikan; yang tampil selalu milik ketikan terakhir.
    let batal = false;
    setMemuat(true);
    const jeda = setTimeout(() => {
      api
        .cariWilayah(q)
        .then((r) => {
          if (batal) return;
          setHasil(r);
          setGalat("");
        })
        .catch((e) => !batal && setGalat(e.message))
        .finally(() => !batal && setMemuat(false));
    }, JEDA_CARI_MS);
    return () => {
      batal = true;
      clearTimeout(jeda);
    };
  }, [q, open, cukup]);

  const pilih = (h) => {
    onPilih(h);
    tutup();
  };

  const kotakCari = (
    <input
      type="search"
      className="fk-input fk-select-cari"
      placeholder="Cari kelurahan / desa..."
      value={kata}
      maxLength={100}
      onChange={(e) => setKata(e.target.value)}
      enterKeyHint="search"
      autoFocus
      aria-label="Cari kelurahan / desa"
    />
  );

  const daftar = (kelas) => {
    if (!cukup) {
      return (
        <div className="fk-select-empty">
          Ketik minimal {CARI_MIN_HURUF} huruf nama kelurahan / desa. Tambahkan nama kecamatan atau kabupaten
          supaya lebih tepat, mis. “sukamaju bogor”.
        </div>
      );
    }
    if (galat) return <div className="fk-select-empty fk-err">{galat}</div>;
    if (!hasil || (memuat && !hasil.hasil.length)) return <div className="fk-select-empty">Mencari...</div>;
    if (!hasil.hasil.length) {
      return <div className="fk-select-empty">Tidak ada kelurahan / desa yang cocok dengan “{q}”.</div>;
    }
    return (
      <>
        {hasil.hasil.map((h) => {
          const dipilih = h.kode === value.kode_kemendagri;
          return (
            <button
              type="button"
              key={h.kode}
              role="option"
              aria-selected={dipilih}
              className={`${kelas} fk-opsi-wilayah${dipilih ? " is-selected" : ""}`}
              onClick={() => pilih(h)}
            >
              <span>
                {h.kelurahan}
                <small>
                  Kec. {h.kecamatan}, {h.kabupaten}, {h.provinsi}
                </small>
              </span>
              {dipilih && <CheckIcon />}
            </button>
          );
        })}
        {hasil.total > hasil.hasil.length && (
          <div className="fk-select-empty">
            {hasil.hasil.length} teratas dari {groupNum(hasil.total)} hasil. Tambahkan nama kecamatan atau kabupaten
            supaya lebih tepat.
          </div>
        )}
      </>
    );
  };

  return (
    <div className="fk-select" ref={ref}>
      <button
        type="button"
        className={
          "fk-select-btn" + (open ? " is-open" : "") + (invalid ? " is-invalid" : "") + (value.kelurahan ? "" : " is-ph")
        }
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{value.kelurahan || "Cari kelurahan / desa"}</span>
        <Chevron open={open} />
      </button>

      {open && !hp && (
        <div className="fk-pop fk-select-panel fk-cari-wilayah" role="listbox">
          {kotakCari}
          {daftar("fk-option")}
        </div>
      )}

      {hp && (
        <Sheet open={open} onClose={tutup} title="Cari kelurahan / desa">
          {kotakCari}
          <div className="fk-sheet-daftar" role="listbox">
            {daftar("fk-sheet-opsi")}
          </div>
        </Sheet>
      )}
    </div>
  );
}

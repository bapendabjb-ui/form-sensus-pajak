import { useState } from "react";
import * as api from "../api.js";
import CustomSelect from "./CustomSelect.jsx";
import { useToast } from "./Toast.jsx";

export const PETUGAS_MAKS = 8;

const labelPetugas = (p) => (p.nip ? `${p.nama} — ${p.nip}` : p.nama);

/**
 * Penyusun tim petugas (1–8 orang) untuk sebuah kertas kerja.
 *
 * petugas       : daftar master petugas (sumber dropdown)
 * value         : array id petugas; null = baris yang belum dipilih
 * onChange      : (arrayBaru) => void
 * onPetugasBaru : (petugas) => void, dipanggil setelah petugas baru didaftarkan
 */
export default function PetugasTim({ petugas, value, onChange, onPetugasBaru, galat }) {
  const toast = useToast();
  const baris = value && value.length ? value : [null];
  const [formBaru, setFormBaru] = useState(null); // { nama, nip } | null
  const [menyimpan, setMenyimpan] = useState(false);

  const terisi = baris.filter(Boolean).length;
  const penuh = baris.length >= PETUGAS_MAKS;

  const pilih = (i, id) => onChange(baris.map((x, j) => (j === i ? id : x)));
  const hapus = (i) => onChange(baris.filter((_, j) => j !== i));
  const tambahBaris = () => !penuh && onChange([...baris, null]);

  const simpanBaru = async () => {
    if (!formBaru.nama.trim()) {
      toast("Nama petugas wajib diisi.", true);
      return;
    }
    setMenyimpan(true);
    try {
      const p = await api.createPetugas(formBaru.nama.trim(), formBaru.nip.trim());
      onPetugasBaru(p);

      const kosong = baris.indexOf(null);
      if (kosong >= 0) onChange(baris.map((x, j) => (j === kosong ? p.id : x)));
      else if (!penuh) onChange([...baris, p.id]);
      else toast(`Petugas terdaftar, tetapi tim sudah berisi ${PETUGAS_MAKS} orang.`, true);

      setFormBaru(null);
      toast(`${p.nama} ditambahkan ke tim.`);
    } catch (e) {
      toast(e.message, true);
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <div className="fk-tim">
      <div className="fk-tim-head">
        <span className="fk-q-name" style={{ margin: 0 }}>
          Petugas pendataan <span className="fk-star">*</span>
        </span>
        <span className={"fk-tim-hitung" + (terisi >= PETUGAS_MAKS ? " is-penuh" : "")}>
          {terisi} dari {PETUGAS_MAKS}
        </span>
      </div>

      {baris.map((id, i) => {
        const dipilih = petugas.find((p) => p.id === id) || null;
        // Petugas yang sudah dipilih di baris lain tidak ditawarkan lagi.
        const tersedia = petugas.filter((p) => p.id === id || !baris.includes(p.id));
        return (
          <div className="fk-tim-row" key={i}>
            <span className="fk-tim-no">{i + 1}</span>
            <div className="fk-tim-isi">
              <CustomSelect
                value={dipilih ? labelPetugas(dipilih) : ""}
                options={tersedia.map(labelPetugas)}
                placeholder={i === 0 ? "Pilih penanggung jawab" : "Pilih petugas"}
                emptyText="Belum ada petugas — daftarkan di bawah"
                invalid={Boolean(galat) && i === 0 && !id}
                onChange={(label) => {
                  const p = tersedia.find((x) => labelPetugas(x) === label);
                  pilih(i, p ? p.id : null);
                }}
              />
            </div>
            {baris.length > 1 && (
              <button type="button" className="fk-tim-hapus" onClick={() => hapus(i)} aria-label={`Hapus petugas baris ${i + 1}`}>
                ✕
              </button>
            )}
          </div>
        );
      })}

      {galat && <span className="fk-err">{galat}</span>}

      {!penuh && (
        <button type="button" className="fk-tim-tambah" onClick={tambahBaris}>
          + Tambah petugas
        </button>
      )}

      {formBaru ? (
        <div className="fk-tim-baru">
          <span className="fk-opts-cap">Daftarkan petugas baru</span>
          <div className="fk-newpet">
            <input
              className="fk-input"
              placeholder="Nama petugas"
              value={formBaru.nama}
              onChange={(e) => setFormBaru((s) => ({ ...s, nama: e.target.value }))}
              autoFocus
            />
            <input
              className="fk-input"
              placeholder="NIP (opsional)"
              inputMode="numeric"
              value={formBaru.nip}
              onChange={(e) => setFormBaru((s) => ({ ...s, nip: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && simpanBaru()}
            />
            <button type="button" className="fk-btn" onClick={simpanBaru} disabled={menyimpan}>
              {menyimpan ? "Menyimpan..." : "Simpan"}
            </button>
            <button type="button" className="fk-btn-ghost" onClick={() => setFormBaru(null)}>
              Batal
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="fk-add-opt" onClick={() => setFormBaru({ nama: "", nip: "" })}>
          + Petugas belum terdaftar
        </button>
      )}

      <p className="fk-hint" style={{ marginTop: 0 }}>
        Petugas nomor 1 menjadi penanggung jawab. Maksimal {PETUGAS_MAKS} orang per kertas kerja.
      </p>
    </div>
  );
}

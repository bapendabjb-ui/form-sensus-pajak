/*
 * Bagian bersama untuk pemeriksaan koordinat objek (pertanyaan Lokasi di
 * formulir) oleh admin: tombol centang "sudah dicek" dan nama pemeriksanya.
 *
 * Fitur "lokasi sensus" per kertas kerja (Tetapkan di peta, Rekam di sini,
 * centang lokasi sensus sudah dicek) sudah dihapus.
 */

import { useState } from "react";
import { useToast } from "./Toast.jsx";
import { formatWaktu } from "../lib/format.js";

/** "admin (budi)", atau cukup "admin" bila tidak ada nama lain untuk disebut. */
export const namaAdmin = (oleh) => (!oleh || oleh.toLowerCase() === "admin" ? "admin" : `admin (${oleh})`);

/**
 * Tombol centang "sudah dicek" milik admin. Sudah dicek = terkunci untuk petugas.
 * Dipakai untuk koordinat objek per data.
 *
 * @param {object} props
 * @param {object|null} props.dicek  { oleh, waktu } atau null
 * @param {() => Promise<void>} props.onUbah  membalik tanda; melempar galat bila gagal
 * @param {string} [props.label]
 */
export function TombolDicek({ dicek, onUbah, label = "Sudah dicek" }) {
  const toast = useToast();
  const [sibuk, setSibuk] = useState(false);
  const ubah = async (e) => {
    e.stopPropagation();
    setSibuk(true);
    try {
      await onUbah();
    } catch (err) {
      toast(err.message, true);
    } finally {
      setSibuk(false);
    }
  };
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={Boolean(dicek)}
      className={"fk-dicek" + (dicek ? " is-on" : "")}
      onClick={ubah}
      disabled={sibuk}
      title={dicek ? `Dicek ${namaAdmin(dicek.oleh)}, ${formatWaktu(dicek.waktu)}. Ketuk untuk membuka kunci.` : "Tandai sudah dicek dan kunci"}
    >
      <span className="fk-dicek-kotak" aria-hidden="true">
        {dicek ? "✓" : ""}
      </span>
      <span>{label}</span>
    </button>
  );
}

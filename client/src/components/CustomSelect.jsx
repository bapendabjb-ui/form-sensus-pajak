import { useRef, useState, useCallback } from "react";
import { useOutside } from "../lib/useOutside.js";
import { useMobile } from "../lib/useMobile.js";
import { Chevron, CheckIcon } from "./Icons.jsx";
import Sheet from "./Sheet.jsx";

/** Daftar yang lebih panjang dari ini mendapat kotak pencarian. */
const BATAS_CARI = 8;

/**
 * Dropdown kustom (BUKAN <select> bawaan browser) supaya tampilannya konsisten.
 * Desktop: panel opsi di bawah tombol. HP: lembar pilihan dari bawah layar
 * dengan opsi setinggi sentuhan jari.
 */
export default function CustomSelect({
  value,
  options = [],
  onChange,
  placeholder = "Pilih...",
  title,
  invalid = false,
  disabled = false,
  emptyText = "Belum ada data",
}) {
  const [open, setOpen] = useState(false);
  const [cari, setCari] = useState("");
  const ref = useRef(null);
  const hp = useMobile();

  const tutup = useCallback(() => {
    setOpen(false);
    setCari("");
  }, []);
  // Di HP lembar pilihan dirender di luar komponen, jadi "klik di luar" tidak dipakai.
  useOutside(ref, tutup, open && !hp);

  const pilih = (opt) => {
    onChange(opt);
    tutup();
  };

  const kata = cari.trim().toLowerCase();
  const tersaring = kata ? options.filter((o) => o.toLowerCase().includes(kata)) : options;

  const kotakCari = options.length > BATAS_CARI && (
    <input
      type="search"
      className="fk-input fk-select-cari"
      placeholder="Cari..."
      value={cari}
      onChange={(e) => setCari(e.target.value)}
      enterKeyHint="search"
      autoFocus={!hp}
      aria-label="Cari pilihan"
    />
  );

  const daftar = (kelas) => (
    <>
      {options.length === 0 && <div className="fk-select-empty">{emptyText}</div>}
      {options.length > 0 && tersaring.length === 0 && (
        <div className="fk-select-empty">Tidak ada yang cocok dengan “{cari}”.</div>
      )}
      {tersaring.map((opt, i) => (
        <button
          type="button"
          key={`${opt}-${i}`}
          role="option"
          aria-selected={opt === value}
          className={kelas + (opt === value ? " is-selected" : "")}
          onClick={() => pilih(opt)}
        >
          <span>{opt}</span>
          {opt === value && <CheckIcon />}
        </button>
      ))}
    </>
  );

  return (
    <div className="fk-select" ref={ref}>
      <button
        type="button"
        className={
          "fk-select-btn" +
          (open ? " is-open" : "") +
          (invalid ? " is-invalid" : "") +
          (value ? "" : " is-ph")
        }
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{value || placeholder}</span>
        <Chevron open={open} />
      </button>

      {open && !hp && (
        <div className="fk-pop fk-select-panel" role="listbox">
          {kotakCari}
          {daftar("fk-option")}
        </div>
      )}

      {hp && (
        <Sheet open={open} onClose={tutup} title={title || placeholder}>
          {kotakCari}
          <div className="fk-sheet-daftar" role="listbox">
            {daftar("fk-sheet-opsi")}
          </div>
        </Sheet>
      )}
    </div>
  );
}

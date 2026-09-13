import { useRef, useState, useCallback } from "react";
import { useOutside } from "../lib/useOutside.js";
import { Chevron, CheckIcon } from "./Icons.jsx";

/**
 * Dropdown kustom (panel opsi sendiri, BUKAN <select> bawaan browser)
 * supaya tampilannya konsisten di semua browser.
 */
export default function CustomSelect({
  value,
  options = [],
  onChange,
  placeholder = "Pilih...",
  invalid = false,
  disabled = false,
  emptyText = "Belum ada data",
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const tutup = useCallback(() => setOpen(false), []);
  useOutside(ref, tutup, open);

  const pilih = (opt) => {
    onChange(opt);
    setOpen(false);
  };

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

      {open && (
        <div className="fk-pop fk-select-panel" role="listbox">
          {options.length === 0 && <div className="fk-select-empty">{emptyText}</div>}
          {options.map((opt, i) => (
            <button
              type="button"
              key={`${opt}-${i}`}
              role="option"
              aria-selected={opt === value}
              className={"fk-option" + (opt === value ? " is-selected" : "")}
              onClick={() => pilih(opt)}
            >
              <span>{opt}</span>
              {opt === value && <CheckIcon />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

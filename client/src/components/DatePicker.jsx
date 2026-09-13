import { useRef, useState, useCallback } from "react";
import { useOutside } from "../lib/useOutside.js";
import { useMobile } from "../lib/useMobile.js";
import { CalIcon } from "./Icons.jsx";
import Sheet from "./Sheet.jsx";
import { MONTHS, WEEKDAYS, toISO, todayISO, formatDateID } from "../lib/format.js";

/** Bulan & tahun awal kalender berdasarkan nilai terpilih (atau hari ini). */
function bulanAwal(value) {
  if (value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) return { vy: Number(m[1]), vm: Number(m[2]) - 1 };
  }
  const t = new Date();
  return { vy: t.getFullYear(), vm: t.getMonth() };
}

/**
 * Date picker kustom (BUKAN <input type="date">) supaya tampilan & bahasa
 * konsisten. Desktop: popover kalender. HP: kalender di lembar pilihan
 * dengan tanggal berukuran besar.
 */
export default function DatePicker({ value, onChange, invalid = false, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [tampil, setTampil] = useState(() => bulanAwal(value));
  const ref = useRef(null);
  const hp = useMobile();
  const tutup = useCallback(() => setOpen(false), []);
  useOutside(ref, tutup, open && !hp);

  const { vy, vm } = tampil;
  const today = todayISO();

  const buka = () => {
    setTampil(bulanAwal(value)); // selalu mulai dari bulan nilai terpilih
    setOpen((o) => !o);
  };

  const geserBulan = (delta) => {
    setTampil(({ vy: y, vm: m }) => {
      const total = y * 12 + m + delta;
      return { vy: Math.floor(total / 12), vm: ((total % 12) + 12) % 12 };
    });
  };
  const geserTahun = (delta) => setTampil(({ vy: y, vm: m }) => ({ vy: y + delta, vm: m }));

  const hariPertama = new Date(vy, vm, 1).getDay();
  const jumlahHari = new Date(vy, vm + 1, 0).getDate();
  const sel = [];
  for (let i = 0; i < hariPertama; i++) sel.push(null);
  for (let d = 1; d <= jumlahHari; d++) sel.push(d);

  const pilih = (iso) => {
    onChange(iso);
    setOpen(false);
  };

  const kalender = (
    <>
      <div className="fk-cal-head">
        <div className="fk-cal-navgrp">
          <button type="button" className="fk-cal-nav" onClick={() => geserTahun(-1)} aria-label="Tahun sebelumnya">«</button>
          <button type="button" className="fk-cal-nav" onClick={() => geserBulan(-1)} aria-label="Bulan sebelumnya">‹</button>
        </div>
        <div className="fk-cal-title">{MONTHS[vm]} {vy}</div>
        <div className="fk-cal-navgrp">
          <button type="button" className="fk-cal-nav" onClick={() => geserBulan(1)} aria-label="Bulan berikutnya">›</button>
          <button type="button" className="fk-cal-nav" onClick={() => geserTahun(1)} aria-label="Tahun berikutnya">»</button>
        </div>
      </div>

      <div className="fk-cal-grid fk-cal-wd">
        {WEEKDAYS.map((w) => (
          <div key={w} className="fk-wd">{w}</div>
        ))}
      </div>

      <div className="fk-cal-grid">
        {sel.map((d, i) => {
          if (d === null) return <div key={`e${i}`} className="fk-day is-empty" />;
          const iso = toISO(vy, vm, d);
          const cls =
            "fk-day" +
            (iso === value ? " is-selected" : "") +
            (iso === today && iso !== value ? " is-today" : "");
          return (
            <button type="button" key={iso} className={cls} onClick={() => pilih(iso)}>
              {d}
            </button>
          );
        })}
      </div>

      <div className="fk-cal-foot">
        <button type="button" className="fk-textbtn" onClick={() => pilih("")}>Hapus</button>
        <button type="button" className="fk-textbtn is-brand" onClick={() => pilih(today)}>Hari ini</button>
      </div>
    </>
  );

  return (
    <div className="fk-date" ref={ref}>
      <button
        type="button"
        className={
          "fk-date-btn" +
          (open ? " is-open" : "") +
          (invalid ? " is-invalid" : "") +
          (value ? "" : " is-ph")
        }
        onClick={buka}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalIcon />
        <span>{value ? formatDateID(value) : "Pilih tanggal"}</span>
      </button>

      {open && !hp && (
        <div className="fk-pop fk-cal" role="dialog" aria-label="Pilih tanggal">
          {kalender}
        </div>
      )}

      {hp && (
        <Sheet open={open} onClose={tutup} title="Pilih tanggal">
          <div className="fk-cal is-sheet">{kalender}</div>
        </Sheet>
      )}
    </div>
  );
}

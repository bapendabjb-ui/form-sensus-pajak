import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { buangEntriSementara } from "../lib/router.js";

/**
 * Lembar pilihan dari bawah layar (bottom sheet) untuk HP.
 *
 * - Tombol Kembali HP menutup lembar, bukan meninggalkan halaman: saat dibuka,
 *   satu entri riwayat beralamat sama ditambahkan (router mengabaikannya).
 * - Halaman di belakangnya dikunci agar tidak ikut tergulir.
 */
export default function Sheet({ open, onClose, title, children }) {
  const tutupRef = useRef(onClose);
  tutupRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    window.history.pushState({ ...(window.history.state || {}), fkSheet: true }, "");
    const saatKembali = () => tutupRef.current();
    const saatTombol = (e) => e.key === "Escape" && tutupRef.current();
    window.addEventListener("popstate", saatKembali);
    document.addEventListener("keydown", saatTombol);

    const html = document.documentElement;
    const overflowLama = html.style.overflow;
    html.style.overflow = "hidden";

    return () => {
      window.removeEventListener("popstate", saatKembali);
      document.removeEventListener("keydown", saatTombol);
      html.style.overflow = overflowLama;
      // Ditutup lewat pilihan / tombol Tutup: buang entri riwayat milik lembar ini.
      buangEntriSementara();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fk-sheet-latar" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fk-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="fk-sheet-pegangan" aria-hidden="true" />
        <div className="fk-sheet-head">
          <span className="fk-sheet-judul">{title}</span>
          <button type="button" className="fk-sheet-tutup" onClick={onClose}>
            Tutup
          </button>
        </div>
        <div className="fk-sheet-isi">{children}</div>
      </div>
    </div>,
    document.body
  );
}

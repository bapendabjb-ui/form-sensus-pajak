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
  const latarRef = useRef(null);

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

    // Keyboard HP tidak memperkecil layar untuk elemen fixed, jadi latar dipasang
    // tepat di area yang masih terlihat (visualViewport) agar lembar duduk di atas keyboard.
    // Saat keyboard terbuka (area terlihat jauh lebih pendek dari tinggi penuh), lembar
    // boleh memakai seluruh ruang di atas keyboard supaya daftar tidak perlu digulir.
    const vv = window.visualViewport;
    let tinggiPenuh = Math.max(window.innerHeight, vv?.height || 0);
    const ikutiLayar = () => {
      const el = latarRef.current;
      if (!el || !vv) return;
      tinggiPenuh = Math.max(tinggiPenuh, vv.height);
      el.style.top = `${vv.offsetTop}px`;
      el.style.height = `${vv.height}px`;
      el.style.bottom = "auto";
      el.classList.toggle("is-keyboard", vv.height < tinggiPenuh * 0.8);
    };
    ikutiLayar();
    vv?.addEventListener("resize", ikutiLayar);
    vv?.addEventListener("scroll", ikutiLayar);

    return () => {
      window.removeEventListener("popstate", saatKembali);
      document.removeEventListener("keydown", saatTombol);
      vv?.removeEventListener("resize", ikutiLayar);
      vv?.removeEventListener("scroll", ikutiLayar);
      html.style.overflow = overflowLama;
      // Ditutup lewat pilihan / tombol Tutup: buang entri riwayat milik lembar ini.
      buangEntriSementara();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fk-sheet-latar" ref={latarRef} onClick={(e) => e.target === e.currentTarget && onClose()}>
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

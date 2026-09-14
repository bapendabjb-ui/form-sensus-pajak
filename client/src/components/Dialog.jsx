import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buangEntriSementara, pasangTanyaKeluar } from "../lib/router.js";

/**
 * Dialog konfirmasi milik aplikasi — menggantikan window.confirm bawaan browser.
 *
 * Dialog bawaan tidak bisa ditata, bahasanya ikut sistem, dan di HP tampil
 * sebagai kotak kecil di tengah yang tidak nyaman disentuh. Dialog ini:
 *   - memakai bahasa, warna, dan ukuran sentuh yang sama dengan aplikasi,
 *   - menempel di bawah layar pada HP (mudah dijangkau ibu jari),
 *   - ditutup oleh Escape, ketukan di luar kartu, dan tombol Kembali HP.
 *
 * Pemakaian:
 *   const { konfirmasi } = useDialog();
 *   if (!(await konfirmasi({ judul: "Hapus data?", ya: "Hapus", bahaya: true }))) return;
 */

const DialogContext = createContext(null);

/** @returns {{ konfirmasi: (opsi) => Promise<boolean> }} */
export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog dipakai di luar DialogProvider.");
  return ctx;
}

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  // Dipegang di ref supaya penutupan tidak bergantung pada urutan render.
  const aktif = useRef(null);

  /** Tutup lewat tombol: buang dulu entri riwayatnya, baru jawab pemanggil. */
  const tutup = useCallback((hasil) => {
    const d = aktif.current;
    aktif.current = null;
    setDialog(null);
    buangEntriSementara(() => d && d.resolve(hasil));
  }, []);

  const konfirmasi = useCallback(
    (opsi = {}) =>
      new Promise((resolve) => {
        const d = {
          judul: opsi.judul || "Lanjutkan?",
          pesan: opsi.pesan || "",
          ya: opsi.ya || "Lanjutkan",
          tidak: opsi.tidak || "Batal",
          bahaya: Boolean(opsi.bahaya),
          resolve,
        };
        aktif.current = d;
        // Entri riwayat sementara: tombol Kembali HP menutup dialog, bukan halaman.
        window.history.pushState({ ...(window.history.state || {}), fkSheet: true }, "");
        setDialog(d);
      }),
    []
  );

  // Konfirmasi "isian belum disimpan" milik router memakai dialog yang sama.
  // Tanpa keterangan tambahan: judulnya sudah menjelaskan pilihannya.
  useEffect(
    () =>
      pasangTanyaKeluar(() =>
        konfirmasi({
          judul: "Tinggalkan halaman ini?",
          ya: "Tinggalkan",
          tidak: "Tetap di sini",
          bahaya: true,
        })
      ),
    [konfirmasi]
  );

  useEffect(() => {
    if (!dialog) return undefined;

    // Tombol Kembali HP: entri sudah dibuang browser, jadi jangan dibuang lagi.
    const saatKembali = () => {
      const d = aktif.current;
      aktif.current = null;
      setDialog(null);
      if (d) d.resolve(false);
    };
    const saatTombol = (e) => {
      if (e.key === "Escape") tutup(false);
    };

    window.addEventListener("popstate", saatKembali);
    document.addEventListener("keydown", saatTombol);

    const html = document.documentElement;
    const overflowLama = html.style.overflow;
    html.style.overflow = "hidden";

    return () => {
      window.removeEventListener("popstate", saatKembali);
      document.removeEventListener("keydown", saatTombol);
      html.style.overflow = overflowLama;
    };
  }, [dialog, tutup]);

  return (
    <DialogContext.Provider value={{ konfirmasi }}>
      {children}
      {dialog &&
        createPortal(
          <div
            className="fk-dialog-latar"
            onClick={(e) => e.target === e.currentTarget && tutup(false)}
          >
            {/* Tanpa keterangan, kartunya dibuat lebih ringkas supaya tidak kosong melompong. */}
            <div
              className={"fk-dialog" + (dialog.pesan ? "" : " is-ringkas")}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="fk-dialog-judul"
            >
              <h2 className="fk-dialog-judul" id="fk-dialog-judul">
                {dialog.judul}
              </h2>
              {dialog.pesan && <p className="fk-dialog-pesan">{dialog.pesan}</p>}
              <div className="fk-dialog-aksi">
                <button type="button" className="fk-btn-ghost" onClick={() => tutup(false)}>
                  {dialog.tidak}
                </button>
                <button
                  type="button"
                  className={dialog.bahaya ? "fk-btn-danger" : "fk-btn"}
                  onClick={() => tutup(true)}
                  autoFocus
                >
                  {dialog.ya}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </DialogContext.Provider>
  );
}

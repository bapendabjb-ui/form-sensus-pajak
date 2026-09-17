import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cekNop } from "../api.js";
import { formatNop } from "../lib/format.js";
import { buangEntriSementara } from "../lib/router.js";
import { useToast } from "./Toast.jsx";

const formatLuas = (n) => `${Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 })} m²`;

/**
 * Modal informasi objek pajak dari EPBB untuk satu NOP 18 digit.
 * Tampil di tengah pada desktop dan menempel di dasar layar pada HP,
 * sama seperti dialog konfirmasi. Tombol Kembali HP menutup modal.
 *
 * isiEpbb (opsional): { target: [{ id, label, terisi }], terapkan(data) -> Promise<jumlah> }.
 * Bila ada, modal menampilkan kolom formulir yang akan diisi dan tombol konfirmasi
 * "Isi ke Formulir".
 */
export default function ModalCekNop({ nop, onClose, isiEpbb }) {
  const toast = useToast();
  const [muat, setMuat] = useState({ status: "memuat" });
  const [mengisi, setMengisi] = useState(false);
  const tutupRef = useRef(onClose);
  tutupRef.current = onClose;

  const ambil = useCallback(() => {
    let batal = false;
    setMuat({ status: "memuat" });
    cekNop(nop)
      .then((data) => !batal && setMuat({ status: "ok", data }))
      .catch((e) => !batal && setMuat({ status: "gagal", pesan: e.message, ulang: e.status !== 404 && e.status !== 400 }));
    return () => {
      batal = true;
    };
  }, [nop]);

  useEffect(ambil, [ambil]);

  useEffect(() => {
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
      buangEntriSementara();
    };
  }, []);

  const d = muat.data;
  const bisaIsi = muat.status === "ok" && isiEpbb && isiEpbb.target.length > 0;
  const adaTimpa = bisaIsi && isiEpbb.target.some((t) => t.terisi);

  const isiFormulir = async () => {
    setMengisi(true);
    try {
      const jumlah = await isiEpbb.terapkan(d);
      toast(jumlah ? `${jumlah} kolom diisi dari data EPBB.` : "Data EPBB tidak punya isian untuk kolom formulir ini.");
      onClose();
    } catch (e) {
      toast(e.message || "Gagal mengisi formulir.", true);
      setMengisi(false);
    }
  };

  return createPortal(
    <div className="fk-dialog-latar" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fk-dialog fk-nop-modal" role="dialog" aria-modal="true" aria-labelledby="fk-nop-judul">
        <h2 className="fk-dialog-judul" id="fk-nop-judul">
          Informasi Objek Pajak
        </h2>

        {muat.status === "memuat" && <p className="fk-dialog-pesan">Mengambil data dari EPBB...</p>}

        {muat.status === "gagal" && (
          <div className="fk-nop-gagal">
            <span className="fk-nop-nop">{formatNop(nop)}</span>
            <p className="fk-dialog-pesan">{muat.pesan}</p>
          </div>
        )}

        {muat.status === "ok" && (
          <dl className="fk-nop-info">
            <div className="fk-nop-baris">
              <dt>NOP</dt>
              <dd className="fk-nop-nop">{formatNop(d.nop)}</dd>
            </div>
            <div className="fk-nop-baris">
              <dt>Nama WP</dt>
              <dd>{d.namaWp || "-"}</dd>
            </div>
            <div className="fk-nop-baris">
              <dt>Letak SP</dt>
              <dd>{d.letakSp || "-"}</dd>
            </div>
            <div className="fk-nop-baris">
              <dt>Letak OP</dt>
              <dd>{d.letakOp || "-"}</dd>
            </div>
            <div className="fk-nop-luas">
              <div className="fk-nop-baris">
                <dt>Luas Tanah</dt>
                <dd>{formatLuas(d.luasTanah)}</dd>
              </div>
              <div className="fk-nop-baris">
                <dt>Luas Bangunan</dt>
                <dd>{formatLuas(d.luasBangunan)}</dd>
              </div>
            </div>
            <div className="fk-nop-baris">
              <dt>Status Bayar</dt>
              <dd>
                {d.belumBayar.length === 0 ? (
                  <span className="fk-pill is-done">Lunas</span>
                ) : (
                  <div className="fk-nop-tunggak">
                    <span className="fk-pill is-draft">Belum Bayar</span>
                    <span className="fk-nop-tahun">{d.belumBayar.join(", ")}</span>
                  </div>
                )}
              </dd>
            </div>
          </dl>
        )}

        {bisaIsi && (
          <div className="fk-nop-isi">
            <span className="fk-nop-isi-judul">Isi ke formulir:</span>
            <ul className="fk-nop-isi-daftar">
              {isiEpbb.target.map((t) => (
                <li key={t.id}>
                  {t.label}
                  {t.terisi && <span className="fk-nop-isi-ganti"> (diganti)</span>}
                </li>
              ))}
            </ul>
            {adaTimpa && <span className="fk-hint-kecil">Kolom yang sudah terisi akan diganti dengan data EPBB.</span>}
          </div>
        )}

        <div className="fk-dialog-aksi">
          {muat.status === "gagal" && muat.ulang && (
            <button type="button" className="fk-btn-ghost" onClick={ambil}>
              Coba Lagi
            </button>
          )}
          {bisaIsi ? (
            <>
              <button type="button" className="fk-btn-ghost" onClick={onClose} disabled={mengisi}>
                Tutup
              </button>
              <button type="button" className="fk-btn" onClick={isiFormulir} disabled={mengisi} autoFocus>
                {mengisi ? "Mengisi..." : "Isi ke Formulir"}
              </button>
            </>
          ) : (
            <button type="button" className="fk-btn" onClick={onClose} autoFocus>
              Tutup
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

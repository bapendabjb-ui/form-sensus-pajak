import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cekNop, cariNop } from "../api.js";
import { formatNik, formatNop, hanyaDigit, PANJANG_NIK } from "../lib/format.js";
import { buangEntriSementara } from "../lib/router.js";
import { useLayarTerlihat } from "../lib/useLayarTerlihat.js";
import { useMobile } from "../lib/useMobile.js";
import { useToast } from "./Toast.jsx";

const formatLuas = (n) => `${Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 })} m²`;

/** Samakan dengan CARI_MIN_HURUF di server/src/epbb.js. */
const CARI_MIN_HURUF = 3;
const huruf = (s) => s.replace(/[^a-z0-9]/gi, "").length;

/**
 * Modal informasi objek pajak dari EPBB untuk satu NOP 18 digit.
 * Tampil di tengah pada desktop dan menempel di dasar layar pada HP,
 * sama seperti dialog konfirmasi. Tombol Kembali HP menutup modal.
 *
 * isiEpbb (opsional): { target: [{ id, label, terisi }], terapkan(data) -> Promise<jumlah> }.
 * Bila ada, modal menampilkan kolom formulir yang akan diisi dan tombol konfirmasi
 * "Isi ke Formulir".
 *
 * cari (opsional): modal dibuka pada pencarian NOP menurut nama WP, NIK, atau letak objek.
 * Memilih hasil menampilkan informasinya; tombol "Pakai" memanggil onPakai(nop) lalu,
 * bila ada isiEpbb, ikut mengisi kolom bersumber EPBB.
 */
export default function ModalCekNop({ nop, onClose, isiEpbb, cari = false, onPakai }) {
  const toast = useToast();
  const [nopTampil, setNopTampil] = useState(cari ? null : nop);
  const [muat, setMuat] = useState({ status: "memuat" });
  const [mengisi, setMengisi] = useState(false);
  const tutupRef = useRef(onClose);
  tutupRef.current = onClose;
  const latarRef = useRef(null);

  // Pencarian punya kolom isian: modal harus duduk di atas keyboard HP, tidak tertutup olehnya.
  useLayarTerlihat(latarRef);

  const ambil = useCallback(() => {
    if (!nopTampil) return undefined;
    let batal = false;
    setMuat({ status: "memuat" });
    cekNop(nopTampil)
      .then((data) => !batal && setMuat({ status: "ok", data }))
      .catch((e) => !batal && setMuat({ status: "gagal", pesan: e.message, ulang: e.status !== 404 && e.status !== 400 }));
    return () => {
      batal = true;
    };
  }, [nopTampil]);

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
  const bisaIsi = Boolean(nopTampil) && muat.status === "ok" && isiEpbb && isiEpbb.target.length > 0;
  const adaTimpa = bisaIsi && isiEpbb.target.some((t) => t.terisi);
  const lihatHasil = cari && nopTampil;

  // Kosongkan data hasil sebelumnya lebih dulu supaya tidak sempat tampil untuk NOP lain.
  const pilih = (n) => {
    setMuat({ status: "memuat" });
    setNopTampil(n);
  };

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

  const pakai = async () => {
    setMengisi(true);
    try {
      onPakai(d.nop);
      if (bisaIsi) {
        const jumlah = await isiEpbb.terapkan(d);
        toast(jumlah ? `NOP dipakai, ${jumlah} kolom diisi dari data EPBB.` : "NOP dipakai.");
      } else {
        toast("NOP dipakai.");
      }
      onClose();
    } catch (e) {
      toast(e.message || "Gagal mengisi formulir.", true);
      setMengisi(false);
    }
  };

  return createPortal(
    <div className="fk-dialog-latar" ref={latarRef} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fk-dialog fk-nop-modal" role="dialog" aria-modal="true" aria-labelledby="fk-nop-judul">
        <h2 className="fk-dialog-judul" id="fk-nop-judul">
          {nopTampil ? "Informasi Objek Pajak" : "Cari NOP di EPBB"}
        </h2>

        {/* Tetap terpasang saat melihat satu hasil, supaya ketikan & hasilnya utuh saat kembali. */}
        {cari && <CariNop hidden={Boolean(nopTampil)} onPilih={pilih} onClose={onClose} />}

        {nopTampil && muat.status === "memuat" && <p className="fk-dialog-pesan">Mengambil data dari EPBB...</p>}

        {nopTampil && muat.status === "gagal" && (
          <div className="fk-nop-gagal">
            <span className="fk-nop-nop">{formatNop(nopTampil)}</span>
            <p className="fk-dialog-pesan">{muat.pesan}</p>
          </div>
        )}

        {nopTampil && muat.status === "ok" && (
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
              <dt>Letak Subjek Pajak</dt>
              <dd>{d.letakSp || "-"}</dd>
            </div>
            <div className="fk-nop-baris">
              <dt>Letak Objek Pajak</dt>
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

        {nopTampil && (
          <div className="fk-dialog-aksi">
            {muat.status === "gagal" && muat.ulang && (
              <button type="button" className="fk-btn-ghost" onClick={ambil}>
                Coba Lagi
              </button>
            )}
            {lihatHasil ? (
              <>
                <button type="button" className="fk-btn-ghost" onClick={() => setNopTampil(null)} disabled={mengisi}>
                  Kembali
                </button>
                {muat.status === "ok" && (
                  <button type="button" className="fk-btn" onClick={pakai} disabled={mengisi} autoFocus>
                    {mengisi ? "Mengisi..." : bisaIsi ? "Pakai & Isi Formulir" : "Pakai NOP Ini"}
                  </button>
                )}
              </>
            ) : bisaIsi ? (
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
        )}
      </div>
    </div>,
    document.body
  );
}

/** "005/002"; bagian yang kosong ditulis "-". */
const rtRw = (h) => (h.rt || h.rw ? `${h.rt || "-"}/${h.rw || "-"}` : "-");

/**
 * Pencarian objek pajak di EPBB. Semua isian yang diisi harus cocok; nama dan letak
 * dicocokkan per kata, NIK harus persis. Hasilnya 50 per halaman; "Lihat lebih banyak"
 * meminta halaman berikutnya dengan kata kunci yang sama (server membatasi 500 seluruhnya).
 */
function CariNop({ hidden, onPilih, onClose }) {
  // Di HP keyboard yang langsung muncul menutupi separuh isian; biarkan petugas memilih kolomnya.
  const hp = useMobile();
  const [kunci, setKunci] = useState({ nama: "", nik: "", letak: "" });
  // status awal | memuat | ok | gagal. Saat ok: daftar, lebih, dibatasi, dicari (kata kunci
  // pencarian ini, dipakai lagi oleh "Lihat lebih banyak"), dan tambah { status, pesan }.
  const [hasil, setHasil] = useState({ status: "awal" });
  const hasilRef = useRef(null);

  // Di HP daftar hasil jatuh di bawah formulir: gulir ke sana begitu pencarian baru selesai
  // (bukan saat halaman berikutnya ditambahkan).
  useEffect(() => {
    if (hasil.status === "ok" || hasil.status === "gagal") {
      hasilRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [hasil.status]);

  const ubah = (k) => (e) => setKunci((s) => ({ ...s, [k]: k === "nik" ? hanyaDigit(e.target.value, PANJANG_NIK) : e.target.value }));
  const siap =
    huruf(kunci.nama) >= CARI_MIN_HURUF || huruf(kunci.letak) >= CARI_MIN_HURUF || kunci.nik.length === PANJANG_NIK;

  const kirim = async (e) => {
    e.preventDefault();
    if (!siap || hasil.status === "memuat") return;
    // Tutup keyboard HP supaya hasilnya terlihat.
    document.activeElement?.blur();
    const dicari = { ...kunci };
    setHasil({ status: "memuat" });
    try {
      const data = await cariNop(dicari);
      setHasil({ status: "ok", daftar: data.hasil, lebih: data.lebih, dibatasi: data.dibatasi, dicari, tambah: {} });
    } catch (err) {
      setHasil({ status: "gagal", pesan: err.message });
    }
  };

  const lihatLebih = async () => {
    const { dicari, daftar } = hasil;
    setHasil((h) => ({ ...h, tambah: { status: "memuat" } }));
    try {
      const data = await cariNop({ ...dicari, mulai: daftar.length });
      setHasil((h) => {
        // Sudah diganti pencarian baru selagi menunggu: halaman ini milik pencarian lama.
        if (h.dicari !== dicari) return h;
        const ada = new Set(h.daftar.map((x) => x.nop));
        return {
          ...h,
          daftar: [...h.daftar, ...data.hasil.filter((x) => !ada.has(x.nop))],
          lebih: data.lebih,
          dibatasi: data.dibatasi,
          tambah: {},
        };
      });
    } catch (err) {
      setHasil((h) => (h.dicari === dicari ? { ...h, tambah: { status: "gagal", pesan: err.message } } : h));
    }
  };

  const daftar = hasil.status === "ok" ? hasil.daftar : [];

  return (
    <div className="fk-cari-nop" hidden={hidden}>
      <form className="fk-cari-nop-form" onSubmit={kirim}>
        <label className="fk-cari-nop-isian">
          <span>Nama wajib pajak</span>
          <input
            className="fk-input"
            value={kunci.nama}
            onChange={ubah("nama")}
            placeholder="Mis. Siti Aminah"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={60}
            autoFocus={!hp}
          />
        </label>
        <label className="fk-cari-nop-isian">
          <span>NIK</span>
          <input
            className="fk-input fk-digit-in"
            value={formatNik(kunci.nik)}
            onChange={ubah("nik")}
            placeholder="16 digit"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
        <label className="fk-cari-nop-isian">
          <span>Letak objek</span>
          <input
            className="fk-input"
            value={kunci.letak}
            onChange={ubah("letak")}
            placeholder="Jalan, kelurahan, atau kecamatan"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={60}
          />
        </label>
        <div className="fk-dialog-aksi">
          <button type="button" className="fk-btn-ghost" onClick={onClose}>
            Tutup
          </button>
          <button type="submit" className="fk-btn" disabled={!siap || hasil.status === "memuat"}>
            {hasil.status === "memuat" ? "Mencari..." : "Cari"}
          </button>
        </div>
      </form>

      <div ref={hasilRef} className="fk-cari-nop-jangkar" aria-hidden="true" />

      {hasil.status === "gagal" && <p className="fk-dialog-pesan fk-cari-nop-gagal">{hasil.pesan}</p>}

      {hasil.status === "ok" && daftar.length === 0 && (
        <p className="fk-dialog-pesan">Tidak ada objek pajak yang cocok.</p>
      )}

      {daftar.length > 0 && (
        <>
          <ul className="fk-cari-nop-hasil">
            {daftar.map((h) => (
              <li key={h.nop}>
                <button type="button" className="fk-cari-nop-item" onClick={() => onPilih(h.nop)}>
                  <span className="fk-cari-nop-nama">{h.namaWp || "-"}</span>
                  <span className="fk-nop-nop">{formatNop(h.nop)}</span>
                  {h.jalanOp && <span className="fk-cari-nop-jalan">{h.jalanOp}</span>}
                  <span className="fk-cari-nop-rinci">
                    <span className="fk-cari-nop-baris is-tiga">
                      <span>
                        <small>RT/RW</small>
                        {rtRw(h)}
                      </span>
                      <span>
                        <small>Luas tanah</small>
                        {formatLuas(h.luasTanah)}
                      </span>
                      <span>
                        <small>Luas bangunan</small>
                        {formatLuas(h.luasBangunan)}
                      </span>
                    </span>
                    <span className="fk-cari-nop-baris">
                      <span>
                        <small>Kelurahan</small>
                        {h.kelurahan || "-"}
                      </span>
                      <span>
                        <small>Kecamatan</small>
                        {h.kecamatan || "-"}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <span className="fk-hint-kecil fk-cari-nop-jumlah">
            {hasil.dibatasi
              ? `Menampilkan ${daftar.length} objek pertama. Tambahkan kata kunci untuk mempersempit.`
              : hasil.lebih
                ? `Menampilkan ${daftar.length} objek.`
                : `${daftar.length} objek ditemukan.`}
          </span>
          {hasil.tambah.status === "gagal" && (
            <p className="fk-dialog-pesan fk-cari-nop-gagal">{hasil.tambah.pesan}</p>
          )}
          {hasil.lebih && (
            <button
              type="button"
              className="fk-btn-ghost fk-cari-nop-lebih"
              onClick={lihatLebih}
              disabled={hasil.tambah.status === "memuat"}
            >
              {hasil.tambah.status === "memuat" ? "Memuat..." : "Lihat lebih banyak"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

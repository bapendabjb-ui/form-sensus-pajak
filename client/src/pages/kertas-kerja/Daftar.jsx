/* Daftar kertas kerja: pencarian, penyaringan, dan pintu ke tiap detail. */

import { useCallback, useEffect, useState } from "react";
import * as api from "../../api.js";
import { useToast } from "../../components/Toast.jsx";
import { useDialog } from "../../components/Dialog.jsx";
import { PageHead, Loading, ErrorBox, Empty, StatusPill, BerkasPill } from "../../components/Ui.jsx";
import { formatTimestamp } from "../../lib/format.js";
import { FILTER_KK, bacaFilterKk, simpanFilterKk, cocokFilterKk, cocokCariKk } from "../../lib/filterKk.js";
import { useAdmin } from "../../lib/admin.js";
import { navigate } from "../../lib/router.js";
import { urlKk, unduh, ringkasTim } from "./bersama.js";

export function DaftarKertasKerja() {
  const toast = useToast();
  const { konfirmasi } = useDialog();
  const admin = useAdmin();
  const unduhKe = unduh(toast);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState(bacaFilterKk);
  const [cari, setCari] = useState("");

  const pilihFilter = (f) => {
    setFilter(f);
    simpanFilterKk(f);
  };

  const muat = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setList(await api.listKertasKerja());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const hapus = async (k) => {
    const ya = await konfirmasi({
      judul: `Hapus kertas kerja ${k.nomor}?`,
      pesan: k.jumlahData
        ? `${k.jumlahData} data beserta fotonya ikut terhapus. Tindakan ini tidak dapat dibatalkan.`
        : "Kertas kerja ini belum berisi data.",
      ya: "Hapus",
      bahaya: true,
    });
    if (!ya) return;
    try {
      await api.deleteKertasKerja(k.id);
      await muat();
      toast("Kertas kerja dihapus.");
    } catch (e) {
      toast(e.message, true);
    }
  };

  const buat = () => navigate("/kertas-kerja/baru");
  // Pencarian dulu, baru saringan: angka pada tombol saringan ikut menyusut
  // mengikuti kata kunci, supaya tidak menjanjikan hasil yang tak akan muncul.
  const dicari = list.filter((k) => cocokCariKk(k, cari));
  const tampil = dicari.filter((k) => cocokFilterKk(k, filter));
  const kata = cari.trim();

  return (
    <>
      <PageHead title="Kertas Kerja" sub="Satu Nomor, Satu Tim Petugas, Data Per Formulir.">
        <button type="button" className="fk-btn" onClick={buat}>
          + Buat kertas kerja
        </button>
      </PageHead>

      {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}

      {loading ? (
        <Loading label="Memuat kertas kerja..." />
      ) : list.length === 0 ? (
        <Empty
          action={
            <button type="button" className="fk-btn" onClick={buat}>
              Buat kertas kerja
            </button>
          }
        >
          Belum ada kertas kerja.
        </Empty>
      ) : (
        <>
          {/* Angka saja: nomor kertas kerja memang hanya angka, dan menyaring di
              sini membuat isi kotak selalu persis sama dengan yang dicari. */}
          <input
            type="search"
            className="fk-input fk-cari"
            placeholder="Cari nomor kertas kerja..."
            value={cari}
            onChange={(e) => setCari(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            enterKeyHint="search"
            aria-label="Cari nomor kertas kerja"
          />
          <div className="fk-filter" role="tablist" aria-label="Saring kertas kerja">
            {FILTER_KK.map(([kunci, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={filter === kunci}
                key={kunci}
                className={"fk-filter-btn" + (filter === kunci ? " is-on" : "") + (kunci === "kurang" ? " is-kurang" : "")}
                onClick={() => pilihFilter(kunci)}
              >
                {label}
                <span className="fk-filter-jumlah">{dicari.filter((k) => cocokFilterKk(k, kunci)).length}</span>
              </button>
            ))}
          </div>
          {/* Pesan kosong membedakan sebabnya: kata kunci tidak menemukan apa pun,
              atau kata kunci menemukan tetapi saringannya yang menyisihkan semua. */}
          {tampil.length === 0 ? (
            <Empty>
              {kata && dicari.length === 0
                ? `Tidak ada kertas kerja bernomor “${kata}”.`
                : kata
                  ? `Nomor “${kata}” tidak ada pada saringan ini.`
                  : filter === "kurang"
                    ? "Tidak ada kertas kerja dengan berkas tidak lengkap."
                    : "Tidak ada kertas kerja pada saringan ini."}
            </Empty>
          ) : (
            <div className="fk-kk-list">
              {tampil.map((k) => (
                <div
                  className="fk-kk-card is-clickable"
                  key={k.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(urlKk(k.id))}
                  onKeyDown={(e) => e.key === "Enter" && navigate(urlKk(k.id))}
                >
                  <span className="fk-nomor">{k.nomor}</span>
                  <div className="fk-kk-card-body">
                    <div className="fk-lib-title fk-ellipsis">{ringkasTim(k.petugas)}</div>
                    <div className="fk-lib-sub fk-ellipsis">
                      {k.jumlahData} data · {formatTimestamp(k.createdAt)}
                    </div>
                  </div>
                  <BerkasPill jumlah={k.jumlahTidakLengkap} />
                  <StatusPill status={k.status} />
                  {/* Aksi tambahan hanya di desktop; di HP semuanya ada di halaman kertas kerja.
                      Seluruhnya khusus admin: ekspor maupun hapus. */}
                  {admin && (
                    <div className="fk-kk-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="fk-mini" onClick={() => unduhKe(api.unduhExcel(k.id))}>
                        Excel
                      </button>
                      <button type="button" className="fk-mini" onClick={() => unduhKe(api.unduhCsv(k.id))}>
                        CSV
                      </button>
                      <button type="button" className="fk-mini is-danger" onClick={() => hapus(k)}>
                        Hapus
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

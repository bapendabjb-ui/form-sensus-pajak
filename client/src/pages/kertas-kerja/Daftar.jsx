/* Daftar kertas kerja: pencarian, penyaringan, dan pintu ke tiap detail. */

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../../api.js";
import { useToast } from "../../components/Toast.jsx";
import { useDialog } from "../../components/Dialog.jsx";
import { PageHead, Loading, ErrorBox, Empty, StatusPill, BerkasPill } from "../../components/Ui.jsx";
import { formatWaktu } from "../../lib/format.js";
import {
  FILTER_KK,
  bacaFilterKk,
  simpanFilterKk,
  lokasiPerluCek,
  bacaCariKk,
  simpanCariKk,
  simpanPosisiKk,
  ambilPosisiKk,
} from "../../lib/filterKk.js";
import { LABEL_STATUS } from "../../lib/cekLokasi.js";
import { useAdmin } from "../../lib/admin.js";
import { navigate } from "../../lib/router.js";
import { urlKk, unduh, ringkasTim } from "./bersama.js";

/** Baris per pemuatan. Sama dengan bawaan server; ditulis agar terbaca di sini. */
const PER = 20;

/** Jeda sebelum ketikan pencarian dikirim ke server. */
const JEDA_CARI_MS = 300;

/**
 * Kartu hanya menyebut anggota pertama ("Budi +2"). Saat mencari nama, anggota
 * yang cocok ditaruh di depan supaya terlihat mengapa kartu itu muncul.
 */
function timDepanCocok(petugas, cari) {
  const kata = cari.toLowerCase().split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (kata.length === 0) return petugas;
  const cocok = (p) => kata.some((w) => p.nama.toLowerCase().includes(w));
  return [...petugas.filter(cocok), ...petugas.filter((p) => !cocok(p))];
}

const KOSONG = {
  baris: [],
  hal: 1,
  total: 0,
  adaLagi: false,
  jumlah: { semua: 0, draft: 0, selesai: 0, kurang: 0, lokasi: 0, belumdicek: 0 },
};

export function DaftarKertasKerja() {
  const toast = useToast();
  const { konfirmasi } = useDialog();
  const admin = useAdmin();
  const unduhKe = unduh(toast);

  const [data, setData] = useState(KOSONG);
  const [loading, setLoading] = useState(true);
  const [memuatLagi, setMemuatLagi] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState(bacaFilterKk);

  // Dua state untuk satu kotak: `cari` mengikuti ketikan supaya kotaknya tidak
  // terasa tersendat, `cariKirim` tertinggal di belakangnya dan itulah yang
  // benar-benar dikirim ke server. Keduanya mulai dari kata kunci terakhir,
  // supaya kembali dari detail tidak mengosongkan pencarian.
  const [cari, setCari] = useState(bacaCariKk);
  const [cariKirim, setCariKirim] = useState(bacaCariKk);

  // Kembali dari detail: muat lagi sebanyak halaman tadi, lalu gulir ke posisi
  // tadi. Dipakai sekali saja, pada pemuatan pertama.
  const pulihkan = useRef(ambilPosisiKk());
  const [gulirTujuan, setGulirTujuan] = useState(null);

  // Penanda permintaan terakhir: balasan yang datang terlambat (mis. hasil
  // ketikan sebelumnya) tidak boleh menimpa hasil yang lebih baru.
  const urutan = useRef(0);

  useEffect(() => {
    simpanCariKk(cari.trim() ? cari : "");
    const t = setTimeout(() => setCariKirim(cari), JEDA_CARI_MS);
    return () => clearTimeout(t);
  }, [cari]);

  /** Muat halaman pertama untuk kata kunci & saringan yang berlaku sekarang. */
  const muat = useCallback(async () => {
    const aku = ++urutan.current;
    setLoading(true);
    setError("");
    try {
      let hasil = await api.listKertasKerja({ hal: 1, per: PER, cari: cariKirim, saring: filter });
      const pulih = pulihkan.current;
      pulihkan.current = null;
      while (pulih && hasil.adaLagi && hasil.hal < pulih.hal && aku === urutan.current) {
        const lagi = await api.listKertasKerja({ hal: hasil.hal + 1, per: PER, cari: cariKirim, saring: filter });
        hasil = { ...lagi, baris: [...hasil.baris, ...lagi.baris] };
      }
      if (aku === urutan.current) {
        setData(hasil);
        if (pulih) setGulirTujuan(pulih.gulir);
      }
    } catch (e) {
      if (aku === urutan.current) setError(e.message);
    } finally {
      if (aku === urutan.current) setLoading(false);
    }
  }, [cariKirim, filter]);

  useEffect(() => {
    muat();
  }, [muat]);

  // Gulir ke posisi tadi setelah daftarnya tergambar.
  useEffect(() => {
    if (gulirTujuan === null || loading) return;
    window.scrollTo(0, gulirTujuan);
    setGulirTujuan(null);
  }, [gulirTujuan, loading]);

  /** Buka detail sambil mencatat posisi daftar, untuk dipulihkan saat kembali. */
  const buka = (k) => {
    simpanPosisiKk(data.hal, window.scrollY);
    navigate(urlKk(k.id));
  };

  const muatLagi = async () => {
    const aku = urutan.current;
    setMemuatLagi(true);
    try {
      const hasil = await api.listKertasKerja({
        hal: data.hal + 1,
        per: PER,
        cari: cariKirim,
        saring: filter,
      });
      // Kata kunci atau saringan sempat berubah selagi menunggu: buang hasilnya.
      if (aku !== urutan.current) return;
      setData((d) => ({ ...hasil, baris: [...d.baris, ...hasil.baris] }));
    } catch (e) {
      toast(e.message, true);
    } finally {
      setMemuatLagi(false);
    }
  };

  const pilihFilter = (f) => {
    setFilter(f);
    simpanFilterKk(f);
  };

  // Saringan khusus admin tidak boleh tertinggal setelah admin keluar: tombolnya
  // hilang, tetapi daftarnya masih tersaring tanpa petugas tahu sebabnya.
  useEffect(() => {
    if (!admin && filter === "belumdicek") pilihFilter("semua");
  }, [admin, filter]);

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
      // Kembali ke halaman pertama: menghapus satu baris menggeser seluruh
      // paginasi, jadi menambal daftar yang sudah terkumpul akan meleset.
      await muat();
      toast("Kertas kerja dihapus.");
    } catch (e) {
      toast(e.message, true);
    }
  };

  const buat = () => navigate("/kertas-kerja/baru");

  const kata = cari.trim();
  const { baris, total, adaLagi, jumlah } = data;
  // Belum ada kertas kerja sama sekali, bukan sekadar tidak ada yang cocok.
  const benarBenarKosong = !kata && filter === "semua" && total === 0;

  return (
    <>
      <PageHead title="Kertas Kerja" sub="Satu Nomor, Satu Tim Petugas, Data Per Formulir.">
        <button type="button" className="fk-btn" onClick={buat}>
          + Buat kertas kerja
        </button>
      </PageHead>

      {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}

      {loading && baris.length === 0 && !error ? (
        <Loading label="Memuat kertas kerja..." />
      ) : benarBenarKosong ? (
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
          <input
            type="search"
            className="fk-input fk-cari"
            placeholder="Cari nomor atau nama petugas..."
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            enterKeyHint="search"
            aria-label="Cari nomor atau nama petugas"
          />
          <div className="fk-filter" role="tablist" aria-label="Saring kertas kerja">
            {FILTER_KK.filter(([, , opsi]) => admin || !opsi?.admin).map(([kunci, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={filter === kunci}
                key={kunci}
                className={
                  "fk-filter-btn" +
                  (filter === kunci ? " is-on" : "") +
                  (kunci === "kurang" ? " is-kurang" : kunci === "lokasi" || kunci === "belumdicek" ? " is-lokasi" : "")
                }
                onClick={() => pilihFilter(kunci)}
              >
                {label}
                <span className="fk-filter-jumlah">{jumlah[kunci]}</span>
              </button>
            ))}
          </div>

          {/* Pesan kosong membedakan sebabnya: kata kunci tidak menemukan apa pun,
              atau kata kunci menemukan tetapi saringannya yang menyisihkan semua. */}
          {baris.length === 0 ? (
            <Empty>
              {kata && jumlah.semua === 0
                ? `Tidak ada kertas kerja yang cocok dengan "${kata}".`
                : kata
                  ? `Tidak ada hasil "${kata}" pada saringan ini.`
                  : filter === "kurang"
                    ? "Tidak ada kertas kerja dengan berkas tidak lengkap."
                    : filter === "lokasi"
                      ? "Semua kertas kerja sudah punya titik lokasi yang baik."
                      : filter === "belumdicek"
                        ? "Semua lokasi sensus sudah dicek."
                      : "Tidak ada kertas kerja pada saringan ini."}
            </Empty>
          ) : (
            <>
              <div className="fk-kk-list">
                {baris.map((k) => (
                  <div
                    className="fk-kk-card is-clickable"
                    key={k.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => buka(k)}
                    onKeyDown={(e) => e.key === "Enter" && buka(k)}
                  >
                    <span className="fk-nomor">{k.nomor}</span>
                    <div className="fk-kk-card-body">
                      <div className="fk-lib-title fk-ellipsis">{ringkasTim(timDepanCocok(k.petugas, cariKirim))}</div>
                      <div className="fk-lib-sub fk-ellipsis">
                        {k.jumlahData} data · {formatWaktu(k.createdAt)}
                      </div>
                    </div>
                    {lokasiPerluCek(k) && <span className="fk-pill is-lokasi">{LABEL_STATUS[k.lokasiStatus]}</span>}
                    {k.lokasiDicek && (
                      <span className="fk-pill is-done" title="Lokasi sensus sudah dicek admin">
                        ✓ Dicek
                      </span>
                    )}
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

              <div className="fk-muat-lagi">
                <span className="fk-muat-info">
                  Menampilkan {baris.length} dari {total}
                </span>
                {adaLagi && (
                  <button type="button" className="fk-btn-ghost" onClick={muatLagi} disabled={memuatLagi}>
                    {memuatLagi ? "Memuat..." : "Muat lebih banyak"}
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

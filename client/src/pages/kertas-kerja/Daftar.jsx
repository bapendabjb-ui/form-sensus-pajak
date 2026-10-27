/* Daftar kertas kerja: pencarian, penyaringan, dan pintu ke tiap detail. */

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../../api.js";
import { useToast } from "../../components/Toast.jsx";
import { useDialog } from "../../components/Dialog.jsx";
import { PageHead, Panel, Loading, ErrorBox, Empty, StatusPill, BerkasPill } from "../../components/Ui.jsx";
import PetugasTim from "../../components/PetugasTim.jsx";
import { IkonData, CheckIcon } from "../../components/Icons.jsx";
import { formatWaktu } from "../../lib/format.js";
import {
  FILTER_KK,
  bacaFilterKk,
  simpanFilterKk,
  lokasiPerluCek,
  bacaCariKk,
  simpanCariKk,
  bacaTimKurangKk,
  simpanTimKurangKk,
  simpanPosisiKk,
  ambilPosisiKk,
} from "../../lib/filterKk.js";
import { kapitalTiapKata } from "../../lib/kapital.js";
import { LABEL_STATUS } from "../../lib/cekLokasi.js";
import { useAdmin, useHanyaLihat } from "../../lib/admin.js";
import { useKonfigurasi } from "../../lib/konfigurasi.js";
import { navigate, pasangPenjaga } from "../../lib/router.js";
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
  const kata = cari.toLowerCase().split(/[\s,]+/).filter((w) => /\p{L}/u.test(w));
  if (kata.length === 0) return petugas;
  const cocok = (p) => kata.some((w) => p.nama.toLowerCase().includes(w));
  return [...petugas.filter(cocok), ...petugas.filter((p) => !cocok(p))];
}

/**
 * Pencarian "salah satu": dua nama atau lebih dipisah koma (sama dengan
 * namaSalahSatu di server). Hanya dalam pencarian ini saklar "Belum lengkap"
 * bermakna.
 */
const pencarianSalahSatu = (cari) => cari.split(",").filter((b) => /\p{L}/u.test(b)).length >= 2;

/** Dua kata berhuruf atau lebih tanpa koma: tawarkan pencarian "salah satu". */
const bisaSalahSatu = (cari) =>
  !cari.includes(",") && cari.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length >= 2;

/** Nama data yang disebut di kartu; sisanya cukup dihitung ("+3"). */
const NAMA_TAMPIL = 2;

/**
 * Siapa saja yang sudah didata di kertas kerja ini - nama wajib pajak/pemilik
 * dari tiap data (lihat susunNamaData di server). "+N" di luar elipsis supaya
 * tidak ikut terpotong oleh nama yang panjang.
 */
function NamaData({ nama }) {
  const lain = nama.length - NAMA_TAMPIL;
  return (
    <div className="fk-kk-nama" title={nama.join(", ")}>
      <IkonData />
      <span className="fk-ellipsis">{nama.slice(0, NAMA_TAMPIL).join(", ")}</span>
      {lain > 0 && <span className="fk-kk-nama-lain">+{lain}</span>}
    </div>
  );
}

/** "00012, 00015, 00018 +4 lainnya" - daftar nomor yang tidak memanjang tanpa batas. */
const daftarNomor = (nomor, tampil = 5) =>
  nomor.length > tampil ? `${nomor.slice(0, tampil).join(", ")} +${nomor.length - tampil} lainnya` : nomor.join(", ");

/** Laporan satu kalimat hasil tambah petugas massal (lihat POST /kertas-kerja/tambah-petugas). */
function ringkasHasilTambah({ ditambahkan, sudahAda, penuh, tidakDitemukan }, maks) {
  const bagian = [
    ditambahkan.length ? `Petugas ditambahkan ke ${ditambahkan.length} kertas kerja.` : "Tidak ada tim yang berubah.",
  ];
  if (sudahAda.length) bagian.push(`${sudahAda.length} sudah berisi petugas tersebut.`);
  if (penuh.length) bagian.push(`${penuh.length} dilewati karena tim akan lebih dari ${maks} orang: ${daftarNomor(penuh)}.`);
  if (tidakDitemukan) bagian.push(`${tidakDitemukan} sudah dihapus.`);
  return bagian.join(" ");
}

const KOSONG = {
  baris: [],
  hal: 1,
  total: 0,
  adaLagi: false,
  jumlah: { semua: 0, draft: 0, selesai: 0, kosong: 0, kurang: 0, lokasi: 0, belumdicek: 0 },
};

export function DaftarKertasKerja() {
  const toast = useToast();
  const { konfirmasi } = useDialog();
  const admin = useAdmin();
  const hanyaLihat = useHanyaLihat();
  const { petugasMaks } = useKonfigurasi();
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
  // "Belum lengkap": hanya tim yang belum memuat semua nama yang dicari. Saklarnya
  // diingat, tetapi hanya dikirim saat pencariannya memang berisi beberapa nama.
  const [timKurang, setTimKurang] = useState(bacaTimKurangKk);
  const kirimTimKurang = timKurang && pencarianSalahSatu(cariKirim);

  // Kembali dari detail: muat lagi sebanyak halaman tadi, lalu gulir ke posisi
  // tadi. Dipakai sekali saja, pada pemuatan pertama.
  const pulihkan = useRef(ambilPosisiKk());
  const [gulirTujuan, setGulirTujuan] = useState(null);

  // Penanda permintaan terakhir: balasan yang datang terlambat (mis. hasil
  // ketikan sebelumnya) tidak boleh menimpa hasil yang lebih baru.
  const urutan = useRef(0);

  // Mode pilih (khusus admin): centang banyak kertas kerja, lalu tambahkan
  // petugas ke semua timnya sekaligus. Pilihan bertahan walau kata kunci atau
  // saringan diganti, supaya bisa dikumpulkan dari beberapa pencarian.
  const [memilih, setMemilih] = useState(false);
  const [terpilih, setTerpilih] = useState(() => new Map()); // id -> nomor
  const [timTambah, setTimTambah] = useState(null); // null = masih memilih kertas kerja
  const [daftarPetugas, setDaftarPetugas] = useState([]);
  const [galatTim, setGalatTim] = useState("");
  const [menambah, setMenambah] = useState(false);
  const gulirPilih = useRef(0);

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
      const q = { per: PER, cari: cariKirim, saring: filter, timKurang: kirimTimKurang };
      let hasil = await api.listKertasKerja({ ...q, hal: 1 });
      const pulih = pulihkan.current;
      pulihkan.current = null;
      while (pulih && hasil.adaLagi && hasil.hal < pulih.hal && aku === urutan.current) {
        const lagi = await api.listKertasKerja({ ...q, hal: hasil.hal + 1 });
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
  }, [cariKirim, filter, kirimTimKurang]);

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
        timKurang: kirimTimKurang,
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

  const gantiTimKurang = () => {
    setTimKurang(!timKurang);
    simpanTimKurangKk(!timKurang);
  };

  /** "surya recky" -> "surya, recky": dari "semua nama" menjadi "salah satunya". */
  const pisahkanKoma = () => setCari(cari.trim().split(/\s+/).join(", "));

  // Saringan khusus admin tidak boleh tertinggal setelah admin keluar: tombolnya
  // hilang, tetapi daftarnya masih tersaring tanpa petugas tahu sebabnya.
  useEffect(() => {
    if (!admin && filter === "belumdicek") pilihFilter("semua");
  }, [admin, filter]);

  const keluarPilih = () => {
    setMemilih(false);
    setTerpilih(new Map());
    setTimTambah(null);
    setGalatTim("");
  };

  // Mode pilih ikut berakhir bila admin keluar; tambah petugas massal khusus admin.
  useEffect(() => {
    if (!admin) keluarPilih();
  }, [admin]);

  // Pilihan yang sudah dikumpulkan tidak boleh hilang hanya karena salah ketuk menu.
  const adaPilihan = terpilih.size > 0;
  useEffect(() => (adaPilihan ? pasangPenjaga(() => true) : undefined), [adaPilihan]);

  const centang = (k) =>
    setTerpilih((m) => {
      const baru = new Map(m);
      if (baru.has(k.id)) baru.delete(k.id);
      else baru.set(k.id, k.nomor);
      return baru;
    });

  /** Ke langkah kedua: pilih petugas yang akan ditambahkan. */
  const lanjutTambah = async () => {
    try {
      setDaftarPetugas(await api.listPetugas());
      gulirPilih.current = window.scrollY;
      setTimTambah([null]);
      setGalatTim("");
      window.scrollTo(0, 0);
    } catch (e) {
      toast(e.message, true);
    }
  };

  const kembaliPilih = () => {
    setTimTambah(null);
    setGalatTim("");
    setGulirTujuan(gulirPilih.current);
  };

  const simpanTambah = async () => {
    const ids = timTambah.filter(Boolean);
    if (!ids.length) {
      setGalatTim("Pilih minimal satu petugas.");
      return;
    }
    setMenambah(true);
    try {
      const hasil = await api.tambahPetugasMassal([...terpilih.keys()], ids);
      // Yang dilewati ditampilkan lebih lama (gaya galat) supaya sempat dibaca.
      toast(ringkasHasilTambah(hasil, petugasMaks), hasil.penuh.length > 0 || hasil.tidakDitemukan > 0);
      keluarPilih();
      // Muat ulang sebanyak halaman tadi supaya nama tim di kartu terbaru,
      // tanpa melempar admin kembali ke atas daftar.
      pulihkan.current = { hal: data.hal, gulir: gulirPilih.current };
      await muat();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setMenambah(false);
    }
  };

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
  const { baris, total, adaLagi, jumlah, salahSatu } = data;
  // Belum ada kertas kerja sama sekali, bukan sekadar tidak ada yang cocok.
  const benarBenarKosong = !kata && filter === "semua" && total === 0;

  // "Pilih semua" hanya menyangkut kartu yang sedang tampil.
  const semuaTampilTerpilih = baris.length > 0 && baris.every((k) => terpilih.has(k.id));
  const centangSemua = () =>
    setTerpilih((m) => {
      const baru = new Map(m);
      for (const k of baris) {
        if (semuaTampilTerpilih) baru.delete(k.id);
        else baru.set(k.id, k.nomor);
      }
      return baru;
    });

  return (
    <>
      <PageHead title="Kertas Kerja" sub="Satu Nomor, Satu Tim Petugas, Data Per Formulir.">
        <div className="fk-head-aksi">
          {admin && !memilih && !benarBenarKosong && (
            <button type="button" className="fk-btn-ghost" onClick={() => setMemilih(true)}>
              Tambah petugas massal
            </button>
          )}
          {!hanyaLihat && (
            <button type="button" className="fk-btn" onClick={buat}>
              + Buat kertas kerja
            </button>
          )}
        </div>
      </PageHead>

      {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}

      {timTambah ? (
        <>
          <Panel
            title={`Tambah petugas ke ${terpilih.size} kertas kerja`}
            sub="Anggota lama tetap. Petugas baru ditaruh di belakang tim, jadi penanggung jawabnya tidak berubah."
          >
            <p className="fk-hint" style={{ marginTop: 0, marginBottom: 12 }}>
              {daftarNomor([...terpilih.values()].sort(), 12)}
            </p>
            <PetugasTim
              judul="Petugas yang ditambahkan"
              maks={petugasMaks - 1}
              petugas={daftarPetugas}
              value={timTambah}
              onChange={(v) => {
                setTimTambah(v);
                setGalatTim("");
              }}
              onPetugasBaru={(p) =>
                setDaftarPetugas((list) => [...list, p].sort((a, b) => a.nama.localeCompare(b.nama, "id")))
              }
              galat={galatTim}
            />
            <p className="fk-hint">
              Kertas kerja yang timnya akan lebih dari {petugasMaks} orang dilewati, tidak diisi sebagian.
            </p>
          </Panel>

          <div className="fk-form-actions fk-sticky-actions">
            <button type="button" className="fk-btn-ghost" onClick={kembaliPilih} disabled={menambah}>
              Kembali
            </button>
            <button type="button" className="fk-btn" onClick={simpanTambah} disabled={menambah}>
              {menambah ? "Menyimpan..." : "Tambahkan"}
            </button>
          </div>
        </>
      ) : loading && baris.length === 0 && !error ? (
        <Loading label="Memuat kertas kerja..." />
      ) : benarBenarKosong ? (
        <Empty
          action={
            !hanyaLihat && (
              <button type="button" className="fk-btn" onClick={buat}>
                Buat kertas kerja
              </button>
            )
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
          {salahSatu ? (
            <div className="fk-cari-info">
              <span className="fk-hint">Tim yang berisi salah satu dari {salahSatu.nama.length} nama.</span>
              <button
                type="button"
                className={"fk-filter-btn is-kurang" + (kirimTimKurang ? " is-on" : "")}
                aria-pressed={kirimTimKurang}
                onClick={gantiTimKurang}
              >
                Belum lengkap
                <span className="fk-filter-jumlah">{salahSatu.timKurang}</span>
              </button>
            </div>
          ) : (
            bisaSalahSatu(cariKirim) &&
            cari === cariKirim && (
              <div className="fk-cari-info">
                <span className="fk-hint">Tim yang berisi semua nama ini.</span>
                <button type="button" className="fk-teks-btn" onClick={pisahkanKoma}>
                  Cari yang berisi salah satunya
                </button>
              </div>
            )
          )}
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

          {memilih && (
            <p className="fk-hint fk-pilih-petunjuk">
              Ketuk kertas kerja yang timnya akan ditambah petugas. Ketik nama-nama satu tim dipisah koma lalu pilih
              &quot;Belum lengkap&quot; untuk menemukan tim yang kurang anggota; pilihan tetap tersimpan walau pencarian
              diganti.
            </p>
          )}

          {/* Pesan kosong membedakan sebabnya: kata kunci tidak menemukan apa pun,
              atau kata kunci menemukan tetapi saringannya yang menyisihkan semua. */}
          {baris.length === 0 ? (
            <Empty>
              {kirimTimKurang && salahSatu && jumlah.semua === 0
                ? "Semua tim yang berisi salah satu nama itu sudah lengkap."
                : kata && jumlah.semua === 0
                ? `Tidak ada kertas kerja yang cocok dengan "${kata}".`
                : kata
                  ? `Tidak ada hasil "${kata}" pada saringan ini.`
                  : filter === "kosong"
                    ? "Semua kertas kerja sudah berisi data."
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
                {baris.map((k) => {
                  const dipilih = terpilih.has(k.id);
                  const aksi = memilih ? () => centang(k) : () => buka(k);
                  return (
                    <div
                      className={"fk-kk-card is-clickable" + (dipilih ? " is-on" : "")}
                      key={k.id}
                      role={memilih ? "checkbox" : "link"}
                      aria-checked={memilih ? dipilih : undefined}
                      tabIndex={0}
                      onClick={aksi}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || (memilih && e.key === " ")) {
                          e.preventDefault();
                          aksi();
                        }
                      }}
                    >
                      {memilih && (
                        <span className="fk-ind fk-ind-check" aria-hidden="true">
                          {dipilih && <CheckIcon />}
                        </span>
                      )}
                      <span className="fk-nomor">{k.nomor}</span>
                      <div className="fk-kk-card-body">
                        <div className="fk-lib-title fk-ellipsis">{ringkasTim(timDepanCocok(k.petugas, cariKirim))}</div>
                        {k.belumAda?.length > 0 && (
                          <div className="fk-kk-belum fk-ellipsis">
                            Belum ada: {k.belumAda.map(kapitalTiapKata).join(", ")}
                          </div>
                        )}
                        {k.namaData?.length > 0 && <NamaData nama={k.namaData} />}
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
                      {admin && !memilih && (
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
                  );
                })}
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

          {memilih && (
            <div className="fk-form-actions fk-sticky-actions">
              <button type="button" className="fk-btn-ghost" onClick={keluarPilih}>
                Batal
              </button>
              <button type="button" className="fk-btn-ghost" onClick={centangSemua} disabled={baris.length === 0}>
                {semuaTampilTerpilih ? "Lepas semua" : "Pilih semua"}
              </button>
              <button type="button" className="fk-btn" onClick={lanjutTambah} disabled={terpilih.size === 0}>
                Lanjut ({terpilih.size})
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

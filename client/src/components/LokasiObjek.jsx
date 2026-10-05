/*
 * Lokasi objek sensus. Satu kertas kerja = satu rumah / bidang, jadi titiknya satu.
 *
 *   - StatusGps     : layar isi data baru - posisi perangkat yang akan terekam
 *                     saat disimpan, supaya petugas tahu SEBELUM menyimpan bila
 *                     lokasinya belum ada, kasar, atau masih di kantor.
 *   - LokasiKertasKerja : halaman kertas kerja - titik objek, ringkasan GPS
 *                     data-datanya (bukti kunjungan), dan cara menetapkan
 *                     titiknya: lewat peta / tempel Google Maps, atau Rekam di
 *                     sini saat berada di lokasi.
 *
 * Aturan penilaiannya ada di lib/cekLokasi.js (salinan server/src/cekLokasi.js).
 */

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import * as api from "../api.js";
import { useToast } from "./Toast.jsx";
import { nilaiTitik, formatJarak, LABEL_STATUS } from "../lib/cekLokasi.js";
import { pantauPosisi } from "../lib/rekamPosisi.js";
import TempelKoordinat from "./TempelKoordinat.jsx";
import { formatWaktu, urlPeta } from "../lib/format.js";

// Pustaka peta cukup besar: unduh hanya saat peta dibuka.
const PetaLokasi = lazy(() => import("./PetaLokasi.jsx"));

/** Rekam di sini menyerah bila GPS tidak kunjung cukup teliti selama ini. */
const REKAM_MAKS_MS = 45000;

const meter = (m) => (typeof m === "number" ? `±${Math.round(m)} m` : "akurasi tidak diketahui");
const namaKantor = (aturan) => aturan?.kantor?.nama || "kantor";

/**
 * @param {object} props
 * @param {{ status: string, posisi: object|null, galat: string }} props.gps  keadaan pantauPosisi
 * @param {object|null} props.aturan  konfigurasi.lokasi dari server
 * @param {boolean} [props.titikSudahAda]  kertas kerjanya sudah punya titik yang baik -
 *        posisi yang buruk tidak lagi perlu dikhawatirkan, cukup dicatat
 * @param {() => void} props.onUlangi
 */
export function StatusGps({ gps, aturan, titikSudahAda = false, onUlangi }) {
  if (gps.status === "mencari") {
    return (
      <div className="fk-gps-status is-mencari" role="status">
        <span className="fk-spinner" aria-hidden="true" />
        <span className="fk-gps-teks">Mencari lokasi GPS…</span>
      </div>
    );
  }

  const nilai = gps.status === "siap" ? nilaiTitik(gps.posisi, aturan) : "tanpa";
  let teks;
  if (nilai === "baik") teks = `Lokasi terekam · ${meter(gps.posisi.akurasi)}`;
  else if (titikSudahAda) {
    teks = `${LABEL_STATUS[nilai]}. Tidak masalah: titik kertas kerja ini sudah ada.`;
  } else if (nilai === "kantor") {
    teks = `Anda berada di area ${namaKantor(aturan)}. Kertas kerja ini belum punya lokasi sensus.`;
  } else if (nilai === "kasar") {
    teks = `Lokasi kurang akurat (${meter(gps.posisi.akurasi)}). Nyalakan GPS HP atau pindah ke tempat terbuka.`;
  } else teks = `${gps.galat || "Lokasi belum terekam."} Data tetap bisa disimpan, tetapi tanpa koordinat.`;

  const tenang = nilai === "baik" || titikSudahAda;
  return (
    <div className={"fk-gps-status " + (nilai === "baik" ? "is-baik" : tenang ? "" : "is-waspada")} role="status">
      <span className="fk-gps-ikon" aria-hidden="true">
        {nilai === "baik" ? "✓" : tenang ? "i" : "!"}
      </span>
      <span className="fk-gps-teks">{teks}</span>
      {!tenang && nilai !== "kantor" && (
        <button type="button" className="fk-mini" onClick={onUlangi}>
          Coba lagi
        </button>
      )}
    </div>
  );
}

/** Keterangan asal titik objek kertas kerja. */
function asalTitik(lokasi) {
  const oleh = !lokasi.oleh || lokasi.oleh === "petugas" ? "petugas" : namaAdmin(lokasi.oleh);
  if (lokasi.sumber === "koreksi") return `Ditetapkan di peta oleh ${oleh}, ${formatWaktu(lokasi.waktu)}.`;
  if (lokasi.sumber === "rekam") {
    return `Direkam di lokasi oleh ${oleh} (${meter(lokasi.titik.akurasi)}), ${formatWaktu(lokasi.waktu)}.`;
  }
  if (lokasi.sumber === "gps") return `GPS terbaik dari data-datanya (${meter(lokasi.titik.akurasi)}).`;
  return "Belum ada titik.";
}

/** "3 data: 2 di lokasi, 1 di kantor" */
function ringkasGps(gps, aturan) {
  const total = gps.baik + gps.kasar + gps.kantor + gps.tanpa;
  if (!total) return "Belum ada data.";
  const bagian = [
    [gps.baik, "di lokasi"],
    [gps.kasar, "kurang akurat"],
    [gps.kantor, `di area ${namaKantor(aturan)}`],
    [gps.tanpa, "tanpa GPS"],
  ]
    .filter(([n]) => n > 0)
    .map(([n, teks]) => `${n} ${teks}`);
  return `${total} data: ${bagian.join(", ")}.`;
}

/** "admin (budi)", atau cukup "admin" bila tidak ada nama lain untuk disebut. */
export const namaAdmin = (oleh) => (!oleh || oleh.toLowerCase() === "admin" ? "admin" : `admin (${oleh})`);

/**
 * Tombol centang "sudah dicek" milik admin. Sudah dicek = terkunci untuk petugas.
 * Dipakai untuk lokasi sensus (panel ini) maupun koordinat objek per data.
 *
 * @param {object} props
 * @param {object|null} props.dicek  { oleh, waktu } atau null
 * @param {() => Promise<void>} props.onUbah  membalik tanda; melempar galat bila gagal
 * @param {string} [props.label]
 */
export function TombolDicek({ dicek, onUbah, label = "Sudah dicek" }) {
  const toast = useToast();
  const [sibuk, setSibuk] = useState(false);
  const ubah = async (e) => {
    e.stopPropagation();
    setSibuk(true);
    try {
      await onUbah();
    } catch (err) {
      toast(err.message, true);
    } finally {
      setSibuk(false);
    }
  };
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={Boolean(dicek)}
      className={"fk-dicek" + (dicek ? " is-on" : "")}
      onClick={ubah}
      disabled={sibuk}
      title={dicek ? `Dicek ${namaAdmin(dicek.oleh)}, ${formatWaktu(dicek.waktu)}. Ketuk untuk membuka kunci.` : "Tandai sudah dicek dan kunci"}
    >
      <span className="fk-dicek-kotak" aria-hidden="true">
        {dicek ? "✓" : ""}
      </span>
      <span>{label}</span>
    </button>
  );
}

/**
 * @param {object} props
 * @param {object} props.kk      detail kertas kerja (id, lokasi, entri)
 * @param {object|null} props.aturan  konfigurasi.lokasi dari server
 * @param {boolean} props.admin
 * @param {(kk: object) => void} props.onBerubah  detail kertas kerja terbaru dari server
 */
export function LokasiKertasKerja({ kk, aturan, admin, onBerubah }) {
  const toast = useToast();
  const [peta, setPeta] = useState(false);
  const [pilihan, setPilihan] = useState(null); // titik dari peta / tempel yang belum disimpan
  const [rekam, setRekam] = useState(null); // { posisi } selama Rekam di sini berjalan
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const henti = useRef(null);

  // Hentikan GPS bila halaman ditinggalkan di tengah perekaman.
  useEffect(() => () => henti.current && henti.current(), []);

  const { lokasi } = kk;
  const adaData = kk.entri.length > 0;
  const perluCek = adaData && lokasi.status !== "baik";
  const ditetapkan = lokasi.sumber === "koreksi" || lokasi.sumber === "rekam";
  // Sudah dicek admin: petugas hanya bisa melihat; admin tetap bisa menyesuaikan.
  const terkunci = Boolean(lokasi.dicek) && !admin;

  const ubahDicek = async () => {
    const baru = await api.setLokasiDicek(kk.id, !lokasi.dicek);
    onBerubah(baru);
    toast(baru.lokasi.dicek ? "Lokasi sensus ditandai sudah dicek dan dikunci." : "Kunci lokasi sensus dibuka.");
  };

  const titikPeta = pilihan || lokasi.titik;
  const tautan = titikPeta ? urlPeta(titikPeta) : "";

  const jalankan = async (aksi, pesan) => {
    setSibuk(true);
    setGalat("");
    try {
      onBerubah(await aksi());
      toast(pesan);
      return true;
    } catch (e) {
      setGalat(e.message);
      return false;
    } finally {
      setSibuk(false);
    }
  };

  const simpanTitik = async () => {
    const ok = await jalankan(() => api.tetapkanTitikKk(kk.id, pilihan.lat, pilihan.lon), "Lokasi sensus disimpan.");
    if (ok) {
      setPilihan(null);
      setPeta(false);
    }
  };

  const hapusTitik = () => jalankan(() => api.hapusTitikKk(kk.id), "Titik kembali memakai GPS data.");

  const berhentiRekam = () => {
    if (henti.current) henti.current();
    henti.current = null;
    setRekam(null);
  };

  const mulaiRekam = () => {
    setGalat("");
    setPeta(false);
    setPilihan(null);
    setRekam({ posisi: null });
    const mulai = Date.now();
    let selesai = false;

    const akhiri = (pesanGalat) => {
      if (selesai) return;
      selesai = true;
      berhentiRekam();
      if (pesanGalat) setGalat(pesanGalat);
    };

    henti.current = pantauPosisi(
      ({ status, posisi, galat: g }) => {
        if (selesai) return;
        if (status === "gagal" && g && !posisi) {
          // Izin ditolak tidak akan membaik dengan menunggu.
          if (g.startsWith("Izin")) akhiri(g);
          return;
        }
        if (!posisi) return;
        setRekam({ posisi });

        const batas = aturan?.akurasiRekamUlangM ?? 50;
        if (typeof posisi.akurasi === "number" && posisi.akurasi <= batas) {
          if (nilaiTitik(posisi, aturan) === "kantor") {
            akhiri(`Posisi Anda masih di area ${namaKantor(aturan)}. Rekam saat berada di lokasi sensus.`);
            return;
          }
          akhiri("");
          jalankan(
            () => api.rekamTitikKk(kk.id, { lat: posisi.lat, lon: posisi.lon, akurasi: posisi.akurasi }),
            `Lokasi sensus direkam (${meter(posisi.akurasi)}).`
          );
        } else if (Date.now() - mulai > REKAM_MAKS_MS) {
          akhiri(
            `GPS belum cukup teliti (terbaik ${meter(posisi.akurasi)}, perlu ±${batas} m). ` +
              "Pindah ke tempat terbuka lalu coba lagi."
          );
        }
      },
      { segar: true }
    );
  };

  return (
    <section className={"fk-section fk-lokasi-data" + (perluCek ? " is-waspada" : "")} id="lokasi-sensus">
      <div className="fk-field">
        <span className="fk-q-name">Lokasi sensus</span>

        {perluCek && !terkunci && (
          <p className="fk-lokasi-data-peringatan" role="alert">
            {LABEL_STATUS[lokasi.status]}. Tetapkan lokasi sensusnya di peta, atau tekan <b>Rekam di sini</b>{" "}
            saat berada di lokasi.
          </p>
        )}

        <dl className="fk-lokasi-data-rinci">
          <dt>Titik sensus</dt>
          <dd>
            {asalTitik(lokasi)}
            {lokasi.jarakM !== null && ` Berjarak ${formatJarak(lokasi.jarakM)} dari GPS petugas di lapangan.`}
            {lokasi.jauh && <span className="fk-pill is-lokasi">Jauh dari GPS</span>}
          </dd>
          <dt>GPS saat pendataan</dt>
          <dd>{ringkasGps(lokasi.gps, aturan)}</dd>
          {lokasi.dicek && (
            <>
              <dt>Pemeriksaan</dt>
              <dd className="fk-dicek-ket">
                ✓ Sudah dicek {namaAdmin(lokasi.dicek.oleh)}, {formatWaktu(lokasi.dicek.waktu)}. Terkunci
                {admin ? " untuk petugas." : " — hanya admin yang bisa mengubahnya."}
              </dd>
            </>
          )}
        </dl>

        {peta && (
          <Suspense
            fallback={
              <div className="fk-lokasi-cari" role="status">
                <span className="fk-spinner" aria-hidden="true" />
                <span>Memuat peta…</span>
              </div>
            }
          >
            <PetaLokasi titik={titikPeta} onPilih={(lat, lon) => setPilihan({ lat, lon })} />
          </Suspense>
        )}
        {peta && <TempelKoordinat onDapat={(lat, lon) => setPilihan({ lat, lon })} />}

        {rekam && (
          <div className="fk-lokasi-cari" role="status">
            <span className="fk-spinner" aria-hidden="true" />
            <span>
              Mengunci sinyal GPS…
              {rekam.posisi && ` terbaik sejauh ini ${meter(rekam.posisi.akurasi)}`}
            </span>
          </div>
        )}

        {galat && <span className="fk-err">{galat}</span>}

        <div className="fk-lokasi-aksi">
          {pilihan ? (
            <>
              <button type="button" className="fk-btn" onClick={simpanTitik} disabled={sibuk}>
                {sibuk ? "Menyimpan..." : "Simpan titik ini"}
              </button>
              <button type="button" className="fk-btn-ghost" onClick={() => setPilihan(null)} disabled={sibuk}>
                Batal
              </button>
            </>
          ) : rekam ? (
            <button type="button" className="fk-btn-ghost" onClick={berhentiRekam}>
              Berhenti
            </button>
          ) : terkunci ? null : (
            <>
              <button
                type="button"
                className={peta ? "fk-btn-ghost is-on" : "fk-btn-ghost"}
                onClick={() => setPeta((b) => !b)}
                aria-expanded={peta}
                disabled={sibuk}
              >
                {peta ? "Tutup peta" : "Tetapkan di peta"}
              </button>
              <button type="button" className="fk-btn-ghost" onClick={mulaiRekam} disabled={sibuk}>
                Rekam di sini
              </button>
              {ditetapkan && (
                <button type="button" className="fk-mini is-danger" onClick={hapusTitik} disabled={sibuk}>
                  Pakai GPS data
                </button>
              )}
            </>
          )}
          {tautan && !rekam && (
            <a className="fk-lokasi-peta" href={tautan} target="_blank" rel="noreferrer">
              Buka di Google Maps
            </a>
          )}
        </div>

        {admin && adaData && !pilihan && !rekam && (
          <TombolDicek dicek={lokasi.dicek} onUbah={ubahDicek} label="Lokasi sensus sudah dicek" />
        )}
      </div>
    </section>
  );
}

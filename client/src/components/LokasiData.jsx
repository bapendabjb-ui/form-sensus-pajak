/*
 * Lokasi sebuah data di layar isi data.
 *
 *   - StatusGps  : data baru - posisi perangkat yang akan terekam saat disimpan,
 *                  supaya petugas tahu SEBELUM menyimpan bila lokasinya belum
 *                  ada, kasar, atau masih di kantor.
 *   - LokasiData : data yang sudah tersimpan - GPS asli (bukti kunjungan) dan
 *                  titik objek, beserta dua cara memperbaikinya: koreksi lewat
 *                  peta, atau rekam ulang GPS saat berada di lokasi objek.
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

// Leaflet cukup besar: unduh hanya saat peta dibuka.
const PetaLokasi = lazy(() => import("./PetaLokasi.jsx"));

/** Rekam ulang menyerah bila GPS tidak kunjung cukup teliti selama ini. */
const REKAM_ULANG_MAKS_MS = 45000;

const meter = (m) => (typeof m === "number" ? `±${Math.round(m)} m` : "akurasi tidak diketahui");
const namaKantor = (aturan) => aturan?.kantor?.nama || "kantor";

/**
 * @param {object} props
 * @param {{ status: string, posisi: object|null, galat: string }} props.gps  keadaan pantauPosisi
 * @param {object|null} props.aturan  konfigurasi.lokasi dari server
 * @param {() => void} props.onUlangi
 */
export function StatusGps({ gps, aturan, onUlangi }) {
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
  else if (nilai === "kantor") {
    teks = `Anda berada di area ${namaKantor(aturan)}. Koordinat data ini akan tercatat di kantor.`;
  } else if (nilai === "kasar") {
    teks = `Lokasi kurang akurat (${meter(gps.posisi.akurasi)}). Nyalakan GPS HP atau pindah ke tempat terbuka.`;
  } else teks = `${gps.galat || "Lokasi belum terekam."} Data tetap bisa disimpan, tetapi tanpa koordinat.`;

  return (
    <div className={"fk-gps-status " + (nilai === "baik" ? "is-baik" : "is-waspada")} role="status">
      <span className="fk-gps-ikon" aria-hidden="true">
        {nilai === "baik" ? "✓" : "!"}
      </span>
      <span className="fk-gps-teks">{teks}</span>
      {nilai !== "baik" && nilai !== "kantor" && (
        <button type="button" className="fk-mini" onClick={onUlangi}>
          Coba lagi
        </button>
      )}
    </div>
  );
}

/** Keterangan asal titik objek. */
function asalTitik(entri) {
  const { lokasi, koreksiTitik } = entri;
  if (lokasi.sumber === "koreksi") {
    const oleh = koreksiTitik.oleh === "petugas" || !koreksiTitik.oleh ? "petugas" : `admin (${koreksiTitik.oleh})`;
    return `Dikoreksi di peta oleh ${oleh}, ${formatWaktu(koreksiTitik.waktu)}.`;
  }
  if (lokasi.sumber === "formulir") return "Diambil dari pertanyaan Lokasi di formulir.";
  if (lokasi.sumber === "gps") return "Memakai GPS saat pendataan.";
  return "Belum ada titik lokasi.";
}

/** Keterangan GPS asli. */
function keteranganGps(entri, aturan) {
  const r = entri.rekamKoordinat;
  if (!r) return "Tidak terekam.";
  const catatan = { kantor: ` · di area ${namaKantor(aturan)}`, kasar: " · kurang akurat" }[entri.lokasi.gps] || "";
  return `${meter(r.akurasi)}, ${formatWaktu(r.waktu)}${catatan}`;
}

/**
 * @param {object} props
 * @param {object} props.entri   hasil api.getEntri (rekamKoordinat, koreksiTitik, lokasi)
 * @param {{lat:number, lon:number}|null} props.titikFormulir  jawaban Lokasi terisi, bila ada
 * @param {object|null} props.aturan  konfigurasi.lokasi dari server
 * @param {(entri: object) => void} props.onBerubah
 */
export function LokasiData({ entri, titikFormulir, aturan, onBerubah }) {
  const toast = useToast();
  const [peta, setPeta] = useState(false);
  const [pilihan, setPilihan] = useState(null); // titik dari peta yang belum disimpan
  const [rekam, setRekam] = useState(null); // { posisi } selama rekam ulang berjalan
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const henti = useRef(null);

  // Hentikan GPS bila layar ditinggalkan di tengah rekam ulang.
  useEffect(() => () => henti.current && henti.current(), []);

  const { lokasi, koreksiTitik, rekamKoordinat } = entri;
  const perluCek = lokasi.status !== "baik";

  const titikAwal =
    (koreksiTitik && { lat: koreksiTitik.lat, lon: koreksiTitik.lon }) ||
    titikFormulir ||
    (rekamKoordinat && { lat: rekamKoordinat.lat, lon: rekamKoordinat.lon }) ||
    null;
  const titikPeta = pilihan || titikAwal;
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

  const simpanKoreksi = async () => {
    const ok = await jalankan(() => api.koreksiTitik(entri.id, pilihan.lat, pilihan.lon), "Titik objek dikoreksi.");
    if (ok) {
      setPilihan(null);
      setPeta(false);
    }
  };

  const hapusKoreksi = () => jalankan(() => api.hapusKoreksiTitik(entri.id), "Koreksi titik dihapus.");

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
            akhiri(`Posisi Anda masih di area ${namaKantor(aturan)}. Rekam ulang saat berada di lokasi objek.`);
            return;
          }
          akhiri("");
          jalankan(
            () => api.rekamUlangLokasi(entri.id, { lat: posisi.lat, lon: posisi.lon, akurasi: posisi.akurasi }),
            `Lokasi direkam ulang (${meter(posisi.akurasi)}).`
          );
        } else if (Date.now() - mulai > REKAM_ULANG_MAKS_MS) {
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
    <section className={"fk-section fk-lokasi-data" + (perluCek ? " is-waspada" : "")}>
      <div className="fk-field">
        <span className="fk-q-name">Lokasi data</span>

        {perluCek && (
          <p className="fk-lokasi-data-peringatan" role="alert">
            {LABEL_STATUS[lokasi.status]}. Koreksi titik objeknya di peta, atau tekan <b>Rekam ulang di sini</b> saat
            berada di lokasi objek.
          </p>
        )}

        <dl className="fk-lokasi-data-rinci">
          <dt>Titik objek</dt>
          <dd>
            {asalTitik(entri)}
            {lokasi.jarakM !== null && ` Berjarak ${formatJarak(lokasi.jarakM)} dari GPS saat pendataan.`}
            {lokasi.jauh && <span className="fk-pill is-lokasi">Jauh dari GPS</span>}
          </dd>
          <dt>GPS saat pendataan</dt>
          <dd>{keteranganGps(entri, aturan)}</dd>
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
              <button type="button" className="fk-btn" onClick={simpanKoreksi} disabled={sibuk}>
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
          ) : (
            <>
              <button
                type="button"
                className={peta ? "fk-btn-ghost is-on" : "fk-btn-ghost"}
                onClick={() => setPeta((b) => !b)}
                aria-expanded={peta}
                disabled={sibuk}
              >
                {peta ? "Tutup peta" : "Koreksi di peta"}
              </button>
              <button type="button" className="fk-btn-ghost" onClick={mulaiRekam} disabled={sibuk}>
                Rekam ulang di sini
              </button>
              {koreksiTitik && (
                <button type="button" className="fk-mini is-danger" onClick={hapusKoreksi} disabled={sibuk}>
                  Hapus koreksi
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
      </div>
    </section>
  );
}

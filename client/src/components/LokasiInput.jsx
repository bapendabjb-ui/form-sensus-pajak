import { useCallback, useEffect, useRef, useState } from "react";
import { keDMS, urlPeta } from "../lib/format.js";

/**
 * Pertanyaan bertipe lokasi: satu titik koordinat GPS.
 *
 * Akurasi diperoleh dengan MENGAMATI posisi, bukan sekali ambil. Pembacaan
 * pertama dari sebuah perangkat biasanya berasal dari jaringan seluler / Wi-Fi
 * dan bisa meleset puluhan sampai ratusan meter; setelah beberapa detik GPS
 * mengunci lebih banyak satelit dan angkanya membaik. Karena itu:
 *
 *   1. watchPosition dijalankan dengan enableHighAccuracy dan maximumAge 0
 *      (tolak posisi hasil cache),
 *   2. setiap pembacaan dibandingkan, hanya yang PALING akurat yang disimpan,
 *   3. pengamatan berhenti sendiri begitu akurasi <= AKURASI_BAIK, atau setelah
 *      tidak ada perbaikan selama JEDA_DIAM_MS — jadi perangkat yang masih
 *      memperbaiki angkanya tidak dipotong di tengah jalan,
 *   4. petugas tetap bisa menunggu lebih lama, berhenti lebih awal, atau
 *      mengambil ulang di titik yang lebih terbuka.
 *
 * value : { lat, lon, akurasi, ketinggian, waktu }
 */

/** Akurasi (meter) yang dianggap sudah cukup baik untuk berhenti otomatis. */
const AKURASI_BAIK = 10;
/** Batas akurasi yang masih dianggap layak pakai. */
const AKURASI_CUKUP = 30;

/** Berhenti bila sekian lama tidak ada perbaikan akurasi sama sekali. */
const JEDA_DIAM_MS = 12000;
/** Pengaman: sepanjang apa pun perbaikannya, berhenti di sini. */
const DURASI_MAKS_MS = 60000;
/** Batas menunggu pembacaan PERTAMA (GPS dingin bisa lama). */
const TIMEOUT_PEMBACAAN_MS = 30000;

const adaGps = () => typeof navigator !== "undefined" && "geolocation" in navigator;

const kosong = () => ({ lat: null, lon: null, akurasi: null, ketinggian: null, waktu: "" });

const terisi = (v) => !!v && typeof v === "object" && v.lat !== null && v.lat !== undefined;

/** Kelas warna untuk lencana akurasi. */
function kelasAkurasi(m) {
  if (m === null || m === undefined) return "";
  if (m <= AKURASI_BAIK) return " is-baik";
  if (m <= AKURASI_CUKUP) return " is-cukup";
  return " is-kasar";
}

function pesanGalatGps(err) {
  if (err && err.code === 1) {
    return "Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini di pengaturan browser, lalu coba lagi.";
  }
  if (err && err.code === 2) {
    return "Sinyal GPS tidak tertangkap. Coba keluar ke tempat terbuka, lalu ambil ulang.";
  }
  if (err && err.code === 3) {
    return "Waktu habis sebelum GPS mengunci posisi. Coba ambil ulang di tempat yang lebih terbuka.";
  }
  return "Lokasi gagal diambil. Coba ambil ulang.";
}

/* ---------- kartu koordinat ---------- */

/** Satu kartu: lintang atau bujur, desimal + bentuk derajat/menit/detik. */
function KartuKoordinat({ label, nilai, sumbu }) {
  const dms = keDMS(nilai, sumbu);
  return (
    <div className="fk-koor-kartu">
      <span className="fk-koor-label">{label}</span>
      <span className="fk-koor-nilai">{Number(nilai).toFixed(6)}</span>
      {dms && (
        <span className="fk-koor-dms">
          {dms.angka} <b>{dms.arah}</b>
        </span>
      )}
    </div>
  );
}

export default function LokasiInput({ value, onChange, invalid }) {
  const [mencari, setMencari] = useState(false);
  const [galat, setGalat] = useState("");
  const [sampel, setSampel] = useState(0);
  const [terbaik, setTerbaik] = useState(null); // akurasi terbaik selama pencarian
  const [tersalin, setTersalin] = useState(false);

  const watchId = useRef(null);
  const pewaktuDiam = useRef(null);
  const pewaktuMaks = useRef(null);
  const akurasiTerbaik = useRef(Infinity);
  const jumlahSampel = useRef(0);

  const hentikan = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    clearTimeout(pewaktuDiam.current);
    clearTimeout(pewaktuMaks.current);
    pewaktuDiam.current = null;
    pewaktuMaks.current = null;
    setMencari(false);
  }, []);

  // Jangan tinggalkan pengamatan GPS berjalan saat pindah layar.
  useEffect(() => hentikan, [hentikan]);

  /**
   * Mulai / lanjutkan pengamatan.
   * `lanjut` = true dipakai tombol "Tunggu lebih lama": akurasi terbaik yang
   * sudah didapat dipertahankan, hanya pewaktunya yang di-reset.
   */
  const mulai = (lanjut = false) => {
    if (!adaGps()) {
      setGalat("Perangkat atau browser ini tidak menyediakan layanan lokasi.");
      return;
    }
    // Geolocation hanya berjalan di konteks aman (HTTPS atau localhost).
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setGalat("Lokasi hanya bisa diambil lewat HTTPS. Buka aplikasi dari alamat https://.");
      return;
    }

    setGalat("");
    if (!lanjut) {
      setSampel(0);
      setTerbaik(null);
      akurasiTerbaik.current = Infinity;
      jumlahSampel.current = 0;
    }
    setMencari(true);

    /** Hitung mundur "tidak ada perbaikan" — disetel ulang tiap kali akurasi membaik. */
    const segarkanJedaDiam = () => {
      clearTimeout(pewaktuDiam.current);
      pewaktuDiam.current = setTimeout(hentikan, JEDA_DIAM_MS);
    };

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, altitude } = pos.coords;
        jumlahSampel.current += 1;
        setSampel(jumlahSampel.current);

        // Simpan hanya bila lebih akurat dari yang sudah ada.
        if (!(accuracy < akurasiTerbaik.current)) return;
        akurasiTerbaik.current = accuracy;
        setTerbaik(accuracy);
        segarkanJedaDiam();

        onChange({
          lat: latitude,
          lon: longitude,
          akurasi: accuracy,
          ketinggian: altitude === null || altitude === undefined ? null : altitude,
          waktu: new Date(pos.timestamp || Date.now()).toISOString(),
        });

        if (accuracy <= AKURASI_BAIK) hentikan();
      },
      (err) => {
        hentikan();
        // Sudah dapat titik sebelumnya: simpan saja, galatnya tidak perlu ditonjolkan.
        if (akurasiTerbaik.current === Infinity) setGalat(pesanGalatGps(err));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: TIMEOUT_PEMBACAAN_MS }
    );

    segarkanJedaDiam();
    pewaktuMaks.current = setTimeout(hentikan, DURASI_MAKS_MS);
  };

  const hapus = () => {
    hentikan();
    setGalat("");
    setTerbaik(null);
    akurasiTerbaik.current = Infinity;
    jumlahSampel.current = 0;
    onChange(kosong());
  };

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(`${value.lat}, ${value.lon}`);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 1600);
    } catch {
      /* clipboard diblokir browser — petugas masih bisa menyalin manual dari layar */
    }
  };

  const punyaTitik = terisi(value);
  const peta = urlPeta(value);

  return (
    <div className={"fk-lokasi" + (invalid ? " is-invalid" : "")}>
      {punyaTitik && (
        <div className="fk-lokasi-hasil">
          <div className="fk-koor">
            <KartuKoordinat label="Lintang (Latitude)" nilai={value.lat} sumbu="lat" />
            <KartuKoordinat label="Bujur (Longitude)" nilai={value.lon} sumbu="lon" />
          </div>

          <div className="fk-lokasi-meta">
            <span className={"fk-lokasi-akurasi" + kelasAkurasi(value.akurasi)}>
              {value.akurasi === null ? "akurasi tidak diketahui" : `±${Math.round(value.akurasi)} m`}
            </span>
            {value.ketinggian !== null && value.ketinggian !== undefined && (
              <span className="fk-hint-kecil">{Math.round(value.ketinggian)} mdpl</span>
            )}
            <button type="button" className="fk-lokasi-salin" onClick={salin}>
              {tersalin ? "Tersalin!" : "Salin koordinat"}
            </button>
            {peta && (
              <a className="fk-lokasi-peta" href={peta} target="_blank" rel="noreferrer">
                Buka di peta
              </a>
            )}
          </div>
        </div>
      )}

      {mencari && (
        <div className="fk-lokasi-cari" role="status">
          <span className="fk-spinner" aria-hidden="true" />
          <span>
            Mengunci sinyal GPS…
            {terbaik !== null && ` terbaik sejauh ini ±${Math.round(terbaik)} m`}
            {sampel > 0 && ` · ${sampel} pembacaan`}
          </span>
        </div>
      )}

      {galat && <span className="fk-err">{galat}</span>}

      <div className="fk-lokasi-aksi">
        {mencari ? (
          <button type="button" className="fk-btn-ghost" onClick={hentikan}>
            Pakai Yang Ini!
          </button>
        ) : (
          <button type="button" className="fk-btn-ghost" onClick={() => mulai(false)}>
            {punyaTitik ? "Ambil ulang" : "Ambil lokasi"}
          </button>
        )}
        {/* Perangkat yang lambat mengunci sering butuh satu ronde tambahan. */}
        {punyaTitik && !mencari && value.akurasi > AKURASI_BAIK && (
          <button type="button" className="fk-mini" onClick={() => mulai(true)}>
            Tunggu lebih lama
          </button>
        )}
        {punyaTitik && !mencari && (
          <button type="button" className="fk-mini is-danger" onClick={hapus}>
            Hapus
          </button>
        )}
      </div>
    </div>
  );
}

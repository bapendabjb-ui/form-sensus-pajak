import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../api.js";
import { PageHead, Loading, ErrorBox, Empty } from "../components/Ui.jsx";
import { navigate } from "../lib/router.js";

// Leaflet berat; hanya diunduh saat halaman peta benar-benar dibuka.
const PetaSebaran = lazy(() => import("../components/PetaSebaran.jsx"));

const SARING = [
  ["semua", "Semua"],
  ["draft", "Draft"],
  ["selesai", "Selesai"],
  ["kurang", "Berkas tidak lengkap"],
];

/**
 * Dua macam titik ditampilkan terpisah supaya tidak menumpuk:
 *   kk   : satu titik per kertas kerja - lokasi sensus;
 *   data : koordinat dari pertanyaan Lokasi di formulir, mis. Koordinat Objek Pajak PBB-P2.
 */
const TAMPILAN = [
  ["kk", "Kertas kerja", "Satu titik per kertas kerja: lokasi sensus."],
  ["data", "Data", "Koordinat dari pertanyaan Lokasi di formulir, mis. Koordinat Objek Pajak."],
];

const KUNCI_TAMPILAN = "sensus-pajak:peta-tampilan";

/** Pilihan tampilan diingat per tab, supaya tetap sama saat kembali dari membuka data. */
function bacaTampilan() {
  try {
    return sessionStorage.getItem(KUNCI_TAMPILAN) === "data" ? "data" : "kk";
  } catch {
    return "kk";
  }
}

const cocok = (t, f) => {
  if (f === "draft" || f === "selesai") return t.status === f;
  if (f === "kurang") return !t.berkasLengkap;
  return true;
};

export default function PetaPage() {
  const [titik, setTitik] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saring, setSaring] = useState("semua");
  const [tampilan, setTampilanState] = useState(bacaTampilan);

  const setTampilan = (k) => {
    setTampilanState(k);
    try {
      sessionStorage.setItem(KUNCI_TAMPILAN, k);
    } catch {
      /* penyimpanan tidak tersedia - pilihan tetap berlaku di layar ini */
    }
  };

  const muat = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTitik(await api.listPeta());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  // Identitas daftar harus stabil: PetaSebaran menggambar ulang seluruh titik
  // setiap prop `titik` berubah, jadi array baru tiap render akan membuat peta
  // berkedip dan memaksa pandangan kembali merapat terus-menerus.
  const titikJenis = useMemo(() => titik.filter((t) => t.jenis === tampilan), [titik, tampilan]);
  const tampil = useMemo(() => titikJenis.filter((t) => cocok(t, saring)), [titikJenis, saring]);

  // Titik kertas kerja (rumah / bidang yang disensus) membuka kertas kerjanya;
  // titik objek lain dari pertanyaan Lokasi membuka datanya.
  const bukaData = (t) =>
    navigate(t.entriId ? `/kertas-kerja/${t.kertasKerjaId}/data/${t.entriId}` : `/kertas-kerja/${t.kertasKerjaId}`);

  const jumlahKk = useMemo(() => new Set(tampil.map((t) => t.kertasKerjaId)).size, [tampil]);

  const saringan = (
    <div className="fk-filter" role="tablist" aria-label="Saring titik">
      {SARING.map(([kunci, label]) => (
        <button
          type="button"
          role="tab"
          aria-selected={saring === kunci}
          key={kunci}
          className={"fk-filter-btn" + (saring === kunci ? " is-on" : "") + (kunci === "kurang" ? " is-kurang" : "")}
          onClick={() => setSaring(kunci)}
        >
          {label}
          <span className="fk-filter-jumlah">{titikJenis.filter((t) => cocok(t, kunci)).length}</span>
        </button>
      ))}
    </div>
  );

  let isiPeta;
  if (titikJenis.length === 0) {
    isiPeta = (
      <Empty>
        {tampilan === "data"
          ? "Belum ada data yang mengisi pertanyaan Lokasi, mis. Koordinat Objek Pajak."
          : "Belum ada kertas kerja yang punya lokasi sensus."}
      </Empty>
    );
  } else if (tampil.length === 0) {
    isiPeta = (
      <>
        {saringan}
        <Empty>Tidak ada titik pada saringan ini.</Empty>
      </>
    );
  } else {
    isiPeta = (
      <>
        {saringan}
        <p className="fk-hint">
          {tampil.length.toLocaleString("id-ID")} titik dari {jumlahKk.toLocaleString("id-ID")} kertas kerja. Ketuk
          titik untuk melihat ringkasannya.
        </p>
        <Suspense fallback={<Loading label="Memuat peta..." />}>
          <PetaSebaran titik={tampil} onBuka={bukaData} />
        </Suspense>
      </>
    );
  }

  return (
    <>
      <PageHead title="Peta Sensus" sub="Pemetaan Data Sensus" />

      {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}

      {loading ? (
        <Loading label="Memuat titik..." />
      ) : titik.length === 0 ? (
        <Empty>
          Belum ada data berkoordinat. Titik muncul setelah petugas menyimpan data dengan izin lokasi
          aktif di perangkatnya.
        </Empty>
      ) : (
        <>
          <div className="fk-peta-jenis fk-peta-tampilan" role="radiogroup" aria-label="Tampilkan titik">
            {TAMPILAN.map(([kunci, label]) => (
              <button
                type="button"
                role="radio"
                aria-checked={tampilan === kunci}
                key={kunci}
                className={tampilan === kunci ? "is-on" : ""}
                onClick={() => setTampilan(kunci)}
              >
                {label}
                <span className="fk-filter-jumlah">{titik.filter((t) => t.jenis === kunci).length}</span>
              </button>
            ))}
          </div>
          <p className="fk-hint">{TAMPILAN.find(([k]) => k === tampilan)[2]}</p>
          {isiPeta}
        </>
      )}
    </>
  );
}

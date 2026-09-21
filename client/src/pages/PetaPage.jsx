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
  const tampil = useMemo(() => titik.filter((t) => cocok(t, saring)), [titik, saring]);

  const bukaData = (t) => navigate(`/kertas-kerja/${t.kertasKerjaId}/data/${t.entriId}`);

  const jumlahKk = useMemo(() => new Set(tampil.map((t) => t.kertasKerjaId)).size, [tampil]);

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
          <div className="fk-filter" role="tablist" aria-label="Saring titik">
            {SARING.map(([kunci, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={saring === kunci}
                key={kunci}
                className={
                  "fk-filter-btn" + (saring === kunci ? " is-on" : "") + (kunci === "kurang" ? " is-kurang" : "")
                }
                onClick={() => setSaring(kunci)}
              >
                {label}
                <span className="fk-filter-jumlah">{titik.filter((t) => cocok(t, kunci)).length}</span>
              </button>
            ))}
          </div>

          {tampil.length === 0 ? (
            <Empty>Tidak ada titik pada saringan ini.</Empty>
          ) : (
            <>
              <p className="fk-hint">
                {tampil.length.toLocaleString("id-ID")} titik dari {jumlahKk.toLocaleString("id-ID")} kertas
                kerja. Ketuk titik untuk melihat ringkasannya.
              </p>
              <Suspense fallback={<Loading label="Memuat peta..." />}>
                <PetaSebaran titik={tampil} onBuka={bukaData} />
              </Suspense>
            </>
          )}
        </>
      )}
    </>
  );
}

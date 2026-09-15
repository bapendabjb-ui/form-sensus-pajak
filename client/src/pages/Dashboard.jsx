import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import { Panel, PageHead, Loading, ErrorBox, StatusPill } from "../components/Ui.jsx";
import { navigate } from "../lib/router.js";

/** "Andi Saputra" atau "Andi Saputra +2" - cukup pendek untuk baris keterangan. */
const ringkasTim = (petugas = []) => {
  if (!petugas.length) return "—";
  const lain = petugas.length - 1;
  return lain > 0 ? `${petugas[0].nama} +${lain}` : petugas[0].nama;
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const muat = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStats(await api.getStats());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const kartu = stats
    ? [
        [stats.totalKertasKerja, "Kertas kerja"],
        [stats.selesai, "Selesai"],
        [stats.totalData, "Data Terkumpul"],
        [stats.totalFoto, "Foto Terlampir"],
        [stats.totalFormulir, "Formulir"],
        [stats.totalPetugas, "Petugas"],
      ]
    : [];

  return (
    <>
      <PageHead title="Dashboard" sub="Ringkasan Kertas Kerja Sensus Pajak." />

      {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}
      {loading && !stats && <Loading />}

      {stats && (
        <>
          <div className="fk-dash-actions">
            <button type="button" className="fk-btn" onClick={() => navigate("/kertas-kerja/baru")}>
              + Buat Kertas Kerja
            </button>
            <button type="button" className="fk-btn-ghost" onClick={() => navigate("/formulir")}>
              Kelola Formulir
            </button>
          </div>

          <div className="fk-stats is-6">
            {kartu.map(([angka, label]) => (
              <div className="fk-stat" key={label}>
                <div className="fk-stat-num">{Number(angka).toLocaleString("id-ID")}</div>
                <div className="fk-stat-label">{label}</div>
              </div>
            ))}
          </div>

          <Panel title="Kertas Kerja Terbaru">
            {stats.terbaru.length === 0 ? (
              <div className="fk-lt-empty">Belum ada kertas kerja.</div>
            ) : (
              <div className="fk-kk-list">
                {stats.terbaru.map((k) => (
                  <button
                    type="button"
                    className="fk-kk-card is-clickable"
                    key={k.id}
                    onClick={() => navigate(`/kertas-kerja/${k.id}`)}
                  >
                    <span className="fk-nomor">{k.nomor}</span>
                    <div className="fk-kk-card-body">
                      <div className="fk-lib-title fk-ellipsis">{ringkasTim(k.petugas)}</div>
                      <div className="fk-lib-sub">{k.jumlahData} data</div>
                    </div>
                    <StatusPill status={k.status} />
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import { Panel, PageHead, Loading, ErrorBox, StatusPill, BerkasPill } from "../components/Ui.jsx";
import { navigate } from "../lib/router.js";
import { simpanFilterKk } from "../lib/filterKk.js";

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

  /** Buka daftar kertas kerja dengan saringan tertentu. */
  const lihat = (filter) => () => {
    simpanFilterKk(filter);
    navigate("/kertas-kerja");
  };

  const kartu = stats
    ? [
        [stats.totalKertasKerja, "Kertas kerja", lihat("semua")],
        [stats.draft, "Draft", lihat("draft")],
        [stats.selesai, "Selesai", lihat("selesai")],
        [stats.tidakLengkap, "Data Berkas Tidak Lengkap", lihat("kurang"), "is-kurang"],
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
            <button type="button" className="fk-btn-ghost" onClick={() => navigate("/kertas-kerja")}>
              Kertas Kerja
            </button>
          </div>

          <div className="fk-stats">
            {kartu.map(([angka, label, onClick, kelas = ""]) => {
              const isi = (
                <>
                  <div className="fk-stat-num">{Number(angka).toLocaleString("id-ID")}</div>
                  <div className="fk-stat-label">{label}</div>
                </>
              );
              const cls = `fk-stat ${angka > 0 ? kelas : ""}`.trim();
              return onClick ? (
                <button type="button" className={cls + " is-clickable"} key={label} onClick={onClick}>
                  {isi}
                </button>
              ) : (
                <div className={cls} key={label}>
                  {isi}
                </div>
              );
            })}
          </div>

          <Panel title="Rekap Petugas" sub="5 Petugas Dengan Data Terbanyak.">
            {stats.rekapPetugas.length === 0 ? (
              <div className="fk-lt-empty">Belum ada data yang dikerjakan petugas.</div>
            ) : (
              <div className="fk-lib-list">
                {stats.rekapPetugas.map((p, i) => (
                  <div className="fk-lib-row fk-rekap-row" key={p.id}>
                    <span className="fk-peringkat">{i + 1}</span>
                    <div>
                      <div className="fk-lib-title fk-ellipsis">{p.nama}</div>
                      <div className="fk-lib-sub">
                        {Number(p.jumlahKertasKerja).toLocaleString("id-ID")} kertas kerja
                      </div>
                    </div>
                    <div className="fk-rekap">
                      <span className="fk-rekap-num">
                        {Number(p.jumlahData).toLocaleString("id-ID")}
                      </span>
                      <span className="fk-rekap-label">data</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

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
                    <BerkasPill jumlah={k.jumlahTidakLengkap} />
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

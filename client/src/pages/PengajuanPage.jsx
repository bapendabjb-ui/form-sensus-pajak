import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useDialog } from "../components/Dialog.jsx";
import { PageHead, Loading, ErrorBox, Empty } from "../components/Ui.jsx";
import LoginAdmin from "../components/LoginAdmin.jsx";
import { formatWaktu } from "../lib/format.js";
import { navigate } from "../lib/router.js";

/**
 * Pengajuan hapus dari petugas: antrean yang menunggu keputusan admin, dan
 * riwayat keputusan terbaru. Admin juga bisa memutuskan langsung dari halaman
 * kertas kerja / data yang diajukan; layar ini mengumpulkan semuanya.
 */

const JENIS = { kertas_kerja: "Kertas kerja", entri: "Data" };

/** Alamat sasaran, atau null bila sasarannya sudah terhapus. */
function alamatSasaran(p) {
  if (!p.kertasKerjaId) return null;
  if (p.jenis === "entri") return p.entriId ? `/kertas-kerja/${p.kertasKerjaId}/data/${p.entriId}` : null;
  return `/kertas-kerja/${p.kertasKerjaId}`;
}

const StatusKeputusan = ({ p }) =>
  p.status === "disetujui" ? (
    <span className="fk-pill is-kurang">Disetujui · dihapus</span>
  ) : (
    <span className="fk-pill is-netral">Ditolak</span>
  );

export default function PengajuanPage({ admin, onAuthChanged }) {
  const toast = useToast();
  const { konfirmasi } = useDialog();
  const [tab, setTab] = useState("menunggu");
  const [data, setData] = useState(null); // { baris, menunggu }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sibuk, setSibuk] = useState(null); // id pengajuan yang sedang diproses

  const muat = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.listPengajuan(tab));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  // Jangan memanggil API sebelum admin: layarnya pun tidak ditampilkan.
  useEffect(() => {
    if (admin) muat();
  }, [admin, muat]);

  /** Keluarkan pengajuan yang sudah diputuskan dari antrean. */
  const lepas = (id) =>
    setData((d) => ({ baris: d.baris.filter((p) => p.id !== id), menunggu: Math.max(0, d.menunggu - 1) }));

  const putuskan = async (p, setuju) => {
    const sasaran = p.jenis === "entri" ? `data "${p.judul}"` : `kertas kerja ${p.nomorKk}`;
    const ya = await konfirmasi(
      setuju
        ? {
            judul: `Setujui & hapus ${sasaran}?`,
            pesan:
              p.jenis === "entri"
                ? "Data beserta fotonya dihapus. Tindakan ini tidak dapat dibatalkan."
                : "Kertas kerja beserta seluruh data dan fotonya dihapus. Tindakan ini tidak dapat dibatalkan.",
            ya: "Setujui & hapus",
            bahaya: true,
          }
        : {
            judul: "Tolak pengajuan ini?",
            pesan: `${p.jenis === "entri" ? "Data" : "Kertas kerja"} tetap ada. Petugas akan melihat bahwa pengajuannya ditolak.`,
            ya: "Tolak",
          }
    );
    if (!ya) return;

    setSibuk(p.id);
    try {
      if (setuju) await api.setujuiPengajuan(p.id);
      else await api.tolakPengajuan(p.id);
      toast(setuju ? `${JENIS[p.jenis]} dihapus.` : "Pengajuan hapus ditolak.");
      lepas(p.id);
    } catch (e) {
      toast(e.message, true);
      // 409 = sudah diputuskan di tempat lain; 404 = sasaran lenyap. Muat ulang agar antrean jujur.
      if (e.status === 404 || e.status === 409) muat();
    } finally {
      setSibuk(null);
    }
  };

  // Menunya disembunyikan bagi yang belum login, tetapi alamatnya masih bisa
  // diketik langsung - jadi layarnya sendiri ikut dijaga.
  if (!admin) return <LoginAdmin onLoggedIn={onAuthChanged} sub="Pengajuan Hapus Hanya Untuk Admin." />;

  const riwayat = tab === "riwayat";

  return (
    <>
      <PageHead title="Pengajuan Hapus" sub="Permintaan Petugas Untuk Menghapus Kertas Kerja atau Data." />

      <div className="fk-filter" role="tablist">
        {[
          ["menunggu", "Menunggu"],
          ["riwayat", "Riwayat"],
        ].map(([kunci, label]) => (
          <button
            type="button"
            key={kunci}
            role="tab"
            aria-selected={tab === kunci}
            className={"fk-filter-btn" + (tab === kunci ? " is-on" : "")}
            onClick={() => setTab(kunci)}
          >
            {label}
            {kunci === "menunggu" && data && <span className="fk-filter-jumlah">{data.menunggu}</span>}
          </button>
        ))}
      </div>

      {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}
      {loading && <Loading label="Memuat pengajuan..." />}

      {!loading && data && data.baris.length === 0 && (
        <Empty>{riwayat ? "Belum ada pengajuan yang diputuskan." : "Tidak ada pengajuan hapus yang menunggu."}</Empty>
      )}

      {!loading && data && data.baris.length > 0 && (
        <div className="fk-kk-list">
          {data.baris.map((p) => {
            const alamat = alamatSasaran(p);
            return (
              <article className="fk-pengajuan-kartu" key={p.id}>
                <div className="fk-pengajuan-kepala">
                  <span className="fk-nomor">{p.nomorKk}</span>
                  <span className="fk-pengajuan-jenis">{JENIS[p.jenis]}</span>
                  {riwayat && <StatusKeputusan p={p} />}
                </div>
                {p.jenis === "entri" && <div className="fk-lib-title">{p.judul}</div>}
                <p className="fk-pengajuan-alasan">“{p.alasan}”</p>
                <div className="fk-lib-sub">
                  Diajukan oleh {p.pengaju} · {formatWaktu(p.createdAt)}
                  {riwayat && p.diputuskanAt && (
                    <>
                      <br />
                      {p.status === "disetujui" ? "Disetujui" : "Ditolak"}
                      {p.diputuskanOleh ? ` oleh ${p.diputuskanOleh}` : ""} · {formatWaktu(p.diputuskanAt)}
                    </>
                  )}
                </div>
                {(alamat || !riwayat) && (
                  <div className="fk-pengajuan-aksi">
                    {alamat && (
                      <button type="button" className="fk-btn-ghost" onClick={() => navigate(alamat)}>
                        Lihat
                      </button>
                    )}
                    {!riwayat && (
                      <>
                        <button
                          type="button"
                          className="fk-btn-ghost"
                          onClick={() => putuskan(p, false)}
                          disabled={sibuk !== null}
                        >
                          Tolak
                        </button>
                        <button
                          type="button"
                          className="fk-btn-danger"
                          onClick={() => putuskan(p, true)}
                          disabled={sibuk !== null}
                        >
                          {sibuk === p.id ? "Memproses..." : "Setujui & hapus"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

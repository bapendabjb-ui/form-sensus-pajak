import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api.js";
import { PageHead, Panel, Loading, ErrorBox, Empty } from "../components/Ui.jsx";
import { useToast } from "../components/Toast.jsx";
import { useAdmin } from "../lib/admin.js";
import { navigate } from "../lib/router.js";
import { formatNop } from "../lib/format.js";
import { formatLuas } from "../lib/persilBpn.js";
import { STATUS_TANAH } from "../lib/nib.js";

/**
 * Integrasi NIB BPN dengan NOP PBB: pola hubungan seluruh pasangan NIB-NOP -
 * dari data sensus (formulir) dan dari tab NOP di Peta Sensus
 * (server/src/integrasi.js) - cakupan per kelurahan BPN, dan daftar kerja per
 * pola yang bisa diunduh admin sebagai Excel untuk ditindaklanjuti di SISMIOP
 * (gabung / pecah NOP, objek baru). Admin juga bisa mengunduh lapisan NOP PBB
 * (GeoJSON untuk QGIS, dan Excel pasangan NIB-NOP).
 */

/** Kelas pita pola: cocok = selesai, perlu ditinjau = kuning, belum lengkap = merah. */
const KELAS_POLA = {
  cocok: "is-done",
  campuran: "is-draft",
  banyak_nop: "is-draft",
  banyak_nib: "is-draft",
  tanpa_nop: "is-kurang",
  tanpa_nib: "is-kurang",
  kosong: "is-kurang",
};

/** Arti tiap pola, untuk keterangan di bawah saringan. */
const ARTI_POLA = {
  cocok: "Satu NOP tepat di satu bidang, dan bidang itu tidak dicatat untuk NOP lain.",
  campuran: "NOP-nya menempati beberapa bidang dan salah satu bidangnya juga dicatat untuk NOP lain.",
  banyak_nop: "Satu bidang dicatat untuk beberapa NOP, mis. tanah dijual sebagian tetapi sertifikatnya belum dipecah, atau rumah susun.",
  banyak_nib: "Satu NOP menempati beberapa bidang, mis. pemilik punya beberapa sertifikat bersebelahan: calon pemecahan NOP.",
  tanpa_nop: "Bidang tercatat tetapi NOP-nya kosong: calon objek baru, atau objek yang dikecualikan.",
  tanpa_nib: "NOP tanpa bidang: tanah belum bersertifikat, NIB belum diketahui, atau belum diisi.",
  kosong: "NIB dan NOP sama-sama belum diisi.",
};

const angka = (n) => Number(n || 0).toLocaleString("id-ID");
const persen = (a, b) => (b > 0 ? `${((a / b) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : "0%");

export default function IntegrasiPage() {
  const toast = useToast();
  const admin = useAdmin();
  const [laporan, setLaporan] = useState(null);
  const [baris, setBaris] = useState([]);
  const [pola, setPola] = useState("");
  const [cari, setCari] = useState("");
  const [cariKirim, setCariKirim] = useState("");
  const [loading, setLoading] = useState(true);
  const [lagi, setLagi] = useState(false);
  const [unduh, setUnduh] = useState(""); // "" | "daftar" | "pasangan" | "geojson"
  const [error, setError] = useState("");
  const ke = useRef(0);

  const muat = useCallback(async () => {
    const ini = ++ke.current;
    setLoading(true);
    setError("");
    try {
      const hasil = await api.laporanIntegrasi({ pola, cari: cariKirim });
      if (ini !== ke.current) return;
      setLaporan(hasil);
      setBaris(hasil.data.baris);
    } catch (e) {
      if (ini === ke.current) setError(e.message);
    } finally {
      if (ini === ke.current) setLoading(false);
    }
  }, [pola, cariKirim]);

  useEffect(() => {
    muat();
  }, [muat]);

  // Kata kunci dikirim setelah petugas berhenti mengetik.
  useEffect(() => {
    const t = setTimeout(() => setCariKirim(cari.trim()), 350);
    return () => clearTimeout(t);
  }, [cari]);

  const lihatLagi = async () => {
    setLagi(true);
    try {
      const hasil = await api.laporanIntegrasi({ pola, cari: cariKirim, mulai: baris.length });
      setBaris((b) => [...b, ...hasil.data.baris]);
      setLaporan((l) => ({ ...l, data: hasil.data }));
    } catch (e) {
      toast(e.message, true);
    } finally {
      setLagi(false);
    }
  };

  const unduhBerkas = async (jenis) => {
    setUnduh(jenis);
    try {
      if (jenis === "daftar") await api.unduhIntegrasi({ pola, cari: cariKirim });
      else if (jenis === "pasangan") await api.unduhPasanganNibNop();
      else await api.unduhPetaBidangPbb();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setUnduh("");
    }
  };

  const kepala = <PageHead title="Integrasi NIB–NOP" sub="Hubungan bidang tanah BPN dengan NOP PBB hasil sensus." />;

  if (loading && !laporan) {
    return (
      <>
        {kepala}
        <Loading label="Menyusun laporan..." />
      </>
    );
  }
  if (error && !laporan) {
    return (
      <>
        {kepala}
        <ErrorBox onRetry={muat}>{error}</ErrorBox>
      </>
    );
  }
  if (!laporan) return kepala;

  const { ringkas, cakupan, data } = laporan;
  const labelPola = laporan.pola || {};

  if (ringkas.formulir === 0 && !ringkas.peta) {
    return (
      <>
        {kepala}
        <Empty>
          Belum ada NIB yang dicatat. Ada dua cara: admin menambahkan pertanyaan Bidang Tanah BPN ke formulir PBB yang juga
          punya pertanyaan NOP PBB (Formulir → Tambah pertanyaan → Bidang Tanah BPN), atau petugas mengetuk bidang di Peta
          Sensus lalu menambah NOP di tab NOP.
        </Empty>
      </>
    );
  }

  const totalBpn = cakupan.reduce((n, c) => n + c.bidangBpn, 0);
  const totalSensus = cakupan.reduce((n, c) => n + c.tersensus, 0);
  const totalBaris = Object.values(ringkas.pola).reduce((n, x) => n + x, 0);
  const perluTindak = totalBaris - (ringkas.pola.cocok || 0);

  return (
    <>
      {kepala}

      <div className="fk-stats">
        {[
          [ringkas.data, "Data PBB (formulir)"],
          [ringkas.peta || 0, "NOP dari peta"],
          [ringkas.bidang, "Bidang BPN tercatat"],
          [ringkas.bidangCocok || 0, "Bidang 1 NIB = 1 NOP"],
        ].map(([n, label]) => (
          <div className="fk-stat" key={label}>
            <div className="fk-stat-num">{angka(n)}</div>
            <div className="fk-stat-label">{label}</div>
          </div>
        ))}
      </div>

      <Panel
        title="Pola hubungan"
        sub={`${angka(perluTindak)} dari ${angka(totalBaris)} baris perlu ditindaklanjuti. Pilih pola untuk melihat datanya.`}
      >
        <div className="fk-integrasi-pola" role="radiogroup" aria-label="Saring menurut pola">
          <button
            type="button"
            role="radio"
            aria-checked={pola === ""}
            className={"fk-filter-btn" + (pola === "" ? " is-on" : "")}
            onClick={() => setPola("")}
          >
            Semua <span className="fk-filter-jumlah">{angka(totalBaris)}</span>
          </button>
          {Object.keys(labelPola).map((k) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={pola === k}
              className={"fk-filter-btn" + (pola === k ? " is-on" : "")}
              onClick={() => setPola(pola === k ? "" : k)}
            >
              {labelPola[k]} <span className="fk-filter-jumlah">{angka(ringkas.pola[k])}</span>
            </button>
          ))}
        </div>
        {pola && <p className="fk-hint">{ARTI_POLA[pola]}</p>}
      </Panel>

      <Panel
        title="Daftar data"
        sub={`${angka(data.total)} baris${pola ? ` · ${labelPola[pola]}` : ""}`}
        className="fk-integrasi-daftar"
      >
        <div className="fk-integrasi-alat">
          <input
            className="fk-input fk-cari"
            type="search"
            value={cari}
            placeholder="Cari NOP, NIB, atau nama"
            title="Cari NOP, NIB, nama, kelurahan, atau nomor kertas kerja"
            aria-label="Cari data"
            onChange={(e) => setCari(e.target.value)}
          />
          {admin && (
            <button type="button" className="fk-btn-ghost" onClick={() => unduhBerkas("daftar")} disabled={Boolean(unduh) || data.total === 0}>
              {unduh === "daftar" ? "Menyiapkan..." : "Unduh Excel"}
            </button>
          )}
        </div>
        {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}
        {data.total === 0 ? (
          <div className="fk-lt-empty">Tidak ada data pada saringan ini.</div>
        ) : (
          <div className="fk-lib-list">
            {baris.map((b) => (
              <BarisData key={b.jenis === "peta" ? `p${b.nop}` : b.entriId} b={b} labelPola={labelPola} />
            ))}
          </div>
        )}
        {data.lebih && (
          <button type="button" className="fk-btn-ghost fk-integrasi-lagi" onClick={lihatLagi} disabled={lagi}>
            {lagi ? "Memuat..." : `Lihat lebih banyak (${angka(data.total - baris.length)} lagi)`}
          </button>
        )}
      </Panel>

      {admin && ringkas.bidang > 0 && (
        <Panel
          title="Lapisan NOP PBB"
          sub="Peta bidang PBB: setiap bidang BPN yang sudah tercatat beserta NOP dan statusnya, dari data sensus dan dari peta."
        >
          <div className="fk-integrasi-alat">
            <button type="button" className="fk-btn-ghost" onClick={() => unduhBerkas("geojson")} disabled={Boolean(unduh)}>
              {unduh === "geojson" ? "Menyiapkan..." : "Unduh peta (GeoJSON)"}
            </button>
            <button type="button" className="fk-btn-ghost" onClick={() => unduhBerkas("pasangan")} disabled={Boolean(unduh)}>
              {unduh === "pasangan" ? "Menyiapkan..." : "Pasangan NIB–NOP (Excel)"}
            </button>
          </div>
          <p className="fk-hint">
            GeoJSON dibuka di QGIS (Layer → Add Layer → Add Vector Layer), koordinat EPSG:4326. Isinya NIB, NOP, status,
            tipe hak, luas peta, kelurahan, dan kecamatan - tanpa nama atau alamat wajib pajak.
          </p>
        </Panel>
      )}

      {cakupan.length > 0 && (
        <Panel
          title="Cakupan per kelurahan"
          sub={`${angka(totalSensus)} dari ${angka(totalBpn)} bidang BPN (${persen(totalSensus, totalBpn)}) sudah tercatat di sensus.`}
        >
          <div className="fk-cakupan">
            {cakupan.map((c) => (
              <div className="fk-cakupan-baris" key={c.kunci}>
                <div className="fk-cakupan-nama">
                  <span className="fk-lib-title">{c.kelurahan || "(tanpa kelurahan)"}</span>
                  <span className="fk-lib-sub">{c.kecamatan}</span>
                </div>
                <div className="fk-cakupan-isi">
                  <div className="fk-meter" role="img" aria-label={`${persen(c.tersensus, c.bidangBpn)} tercatat`}>
                    <span style={{ width: `${Math.min(100, (c.tersensus / Math.max(1, c.bidangBpn)) * 100)}%` }} />
                  </div>
                  <span className="fk-cakupan-angka">
                    {angka(c.tersensus)} / {angka(c.bidangBpn)} bidang · {persen(c.tersensus, c.bidangBpn)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

/** Satu baris daftar kerja: data sensus (membuka datanya) atau NOP dari peta (membuka bidangnya di Peta Sensus). */
function BarisData({ b, labelPola }) {
  const dariPeta = b.jenis === "peta";
  const buka = () =>
    navigate(dariPeta ? `/peta?nib=${encodeURIComponent(b.bidang[0]?.nib || "")}` : `/kertas-kerja/${b.kkId}/data/${b.entriId}`);
  const nib = b.bidang.map((x) => (x.diPeta ? x.nib : `${x.nib} (tidak di peta)`));
  const rinci = [
    b.bidang.length > 1 && `${b.bidang.length} bidang`,
    Number.isFinite(b.luasPeta) && `luas peta ${formatLuas(b.luasPeta)}`,
    Number.isFinite(b.luasTanah) && `luas isian ${formatLuas(b.luasTanah)}`,
    b.kelurahan && `Kel. ${b.kelurahan}`,
  ].filter(Boolean);
  return (
    <button type="button" className="fk-lib-row fk-integrasi-baris" onClick={buka}>
      <div className="fk-lib-main">
        <div className="fk-integrasi-kepala">
          <span className={`fk-pill ${KELAS_POLA[b.pola] || ""}`}>{labelPola[b.pola]}</span>
          <span className="fk-lib-title">{b.nop ? `NOP ${formatNop(b.nop)}` : "Tanpa NOP"}</span>
        </div>
        {b.judul && <div className="fk-lib-sub">{b.judul}</div>}
        <div className="fk-lib-sub">
          {nib.length ? `NIB ${nib.join(", ")}` : STATUS_TANAH[b.status] || "NIB belum diisi"}
          {rinci.length > 0 && ` · ${rinci.join(" · ")}`}
        </div>
        {b.nopLain.length > 0 && (
          <div className="fk-lib-sub fk-integrasi-lain">NOP lain di bidang yang sama: {b.nopLain.map(formatNop).join(", ")}</div>
        )}
        {b.nibLain.length > 0 && (
          <div className="fk-lib-sub fk-integrasi-lain">Bidang lain milik NOP ini: {b.nibLain.join(", ")}</div>
        )}
        <div className="fk-lib-sub">
          {dariPeta ? `Dari peta${b.oleh ? ` · ${b.oleh}` : ""}` : `Kertas kerja ${b.nomor} · ${b.formulir}`}
        </div>
      </div>
      <span className="fk-baris-panah" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

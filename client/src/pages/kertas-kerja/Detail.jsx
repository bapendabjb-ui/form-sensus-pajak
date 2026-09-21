/* Detail satu kertas kerja: tim, kemajuan, daftar data, dan ekspor. */

import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../../api.js";
import { useToast } from "../../components/Toast.jsx";
import { useDialog } from "../../components/Dialog.jsx";
import { Loading, ErrorBox, Empty, StatusPill, BerkasPill, KunciAdmin } from "../../components/Ui.jsx";
import PetugasTim from "../../components/PetugasTim.jsx";
import { judulEntri, ringkasEntri, fotoEntri } from "../../lib/ringkas.js";
import { formatTimestamp } from "../../lib/format.js";
import { IkonFormulir } from "../../components/Icons.jsx";
import { bacaFilterKk } from "../../lib/filterKk.js";
import { useAdmin } from "../../lib/admin.js";
import { navigate, kembali } from "../../lib/router.js";
import { urlKk, unduh } from "./bersama.js";

export function DetailKertasKerja({ id }) {
  const toast = useToast();
  const { konfirmasi } = useDialog();
  const admin = useAdmin();
  const unduhKe = unduh(toast);
  const [kk, setKk] = useState(null);
  const [bank, setBank] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timEdit, setTimEdit] = useState(null); // array id | null
  const [petugas, setPetugas] = useState([]);
  const [galatTim, setGalatTim] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [hanyaKurang, setHanyaKurang] = useState(() => bacaFilterKk() === "kurang");

  const muat = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [detail, formulir] = await Promise.all([api.getKertasKerja(id), api.listFormulir()]);
      setKk(detail);
      setBank(formulir);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    muat();
  }, [muat]);

  const kelompok = useMemo(() => {
    if (!kk) return [];
    const defs = new Map(kk.formulir.map((f) => [f.id, f]));
    const urutBank = new Map(bank.map((f, i) => [f.id, i]));
    const grup = new Map();
    for (const e of kk.entri) {
      if (!grup.has(e.formulirId)) grup.set(e.formulirId, []);
      grup.get(e.formulirId).push(e);
    }
    return [...grup.entries()]
      .map(([formulirId, entri]) => ({ formulir: defs.get(formulirId), entri }))
      .filter((g) => g.formulir)
      .sort((a, b) => (urutBank.get(a.formulir.id) ?? 1e9) - (urutBank.get(b.formulir.id) ?? 1e9));
  }, [kk, bank]);

  const jumlahPerForm = useMemo(() => {
    const m = new Map();
    for (const g of kelompok) m.set(g.formulir.id, g.entri.length);
    return m;
  }, [kelompok]);

  const mulaiUbahTim = async () => {
    try {
      setPetugas(await api.listPetugas());
      setTimEdit(kk.petugas.map((p) => p.id));
      setGalatTim("");
    } catch (e) {
      toast(e.message, true);
    }
  };

  const simpanTim = async () => {
    const ids = timEdit.filter(Boolean);
    if (!ids.length) {
      setGalatTim("Pilih minimal satu petugas.");
      return;
    }
    setSibuk(true);
    try {
      setKk(await api.updateTimKertasKerja(id, ids));
      setTimEdit(null);
      toast("Tim petugas diperbarui.");
    } catch (e) {
      toast(e.message, true);
    } finally {
      setSibuk(false);
    }
  };

  const ubahStatus = async () => {
    const tujuan = kk.status === "selesai" ? "draft" : "selesai";
    setSibuk(true);
    try {
      setKk(await api.setStatusKertasKerja(id, tujuan));
      toast(tujuan === "selesai" ? "Kertas kerja ditandai selesai." : "Kertas kerja dibuka kembali sebagai draft.");
    } catch (e) {
      toast(e.message, true);
    } finally {
      setSibuk(false);
    }
  };

  const hapusKk = async () => {
    const jumlah = kk.entri.length;
    const ya = await konfirmasi({
      judul: `Hapus kertas kerja ${kk.nomor}?`,
      pesan: jumlah
        ? `${jumlah} data beserta fotonya ikut terhapus. Tindakan ini tidak dapat dibatalkan.`
        : "Kertas kerja ini belum berisi data.",
      ya: "Hapus",
      bahaya: true,
    });
    if (!ya) return;
    setSibuk(true);
    try {
      await api.deleteKertasKerja(id);
      toast(`Kertas kerja ${kk.nomor} dihapus.`);
      navigate("/kertas-kerja", { replace: true });
    } catch (e) {
      toast(e.message, true);
      setSibuk(false);
    }
  };

  const tombolKembali = (
    <button type="button" className="fk-textbtn hanya-desktop" onClick={() => kembali("/kertas-kerja")}>
      ‹ Kembali ke daftar
    </button>
  );

  if (loading && !kk) return <Loading label="Memuat kertas kerja..." />;
  if (error)
    return (
      <>
        {tombolKembali}
        <ErrorBox onRetry={muat}>{error}</ErrorBox>
      </>
    );
  if (!kk) return null;

  const totalData = kk.entri.length;
  const terisi = bank.filter((f) => jumlahPerForm.has(f.id)).length;
  const persen = bank.length ? Math.round((terisi / bank.length) * 100) : 0;
  const selesai = kk.status === "selesai";
  const jumlahKurang = kk.entri.filter((e) => !e.berkasLengkap).length;
  const saringKurang = hanyaKurang && jumlahKurang > 0;
  const kelompokTampil = saringKurang
    ? kelompok
        .map((g) => ({ ...g, entri: g.entri.filter((e) => !e.berkasLengkap) }))
        .filter((g) => g.entri.length)
    : kelompok;

  return (
    <div className="fk-fill">
      {tombolKembali}

      <section className="fk-panel fk-form">
        <div className="fk-form-accent" />
        <div className="fk-kk-detail-head">
          <span className="fk-nomor is-big">{kk.nomor}</span>
          <div className="fk-kk-detail-meta">
            <p className="fk-form-desc">
              Dibuat {formatTimestamp(kk.createdAt)} · {totalData} data
            </p>
          </div>
          <span className="fk-kk-pills">
            <BerkasPill jumlah={jumlahKurang} />
            <StatusPill status={kk.status} />
          </span>
        </div>

        <div className="fk-maju">
          <div className="fk-maju-teks">
            <span>{totalData} data terkumpul</span>
            <span>
              {terisi} dari {bank.length} formulir terisi
            </span>
          </div>
          <div className="fk-maju-jalur">
            <div className="fk-maju-isi" style={{ width: `${persen}%` }} />
          </div>
        </div>

        {timEdit ? (
          <div className="fk-tim-edit">
            <PetugasTim
              petugas={petugas}
              value={timEdit}
              onChange={(v) => {
                setTimEdit(v);
                setGalatTim("");
              }}
              onPetugasBaru={(p) => setPetugas((list) => [...list, p])}
              galat={galatTim}
            />
            <div className="fk-detail-aksi">
              <button type="button" className="fk-btn-ghost" onClick={() => setTimEdit(null)}>
                Batal
              </button>
              <button type="button" className="fk-btn" onClick={simpanTim} disabled={sibuk}>
                Simpan tim
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="fk-chips" style={{ marginTop: 14 }}>
              {kk.petugas.map((p, i) => (
                <span className="fk-chip" key={p.id}>
                  <b>{i + 1}</b>
                  {p.nama}
                  {p.nip ? ` — ${p.nip}` : ""}
                </span>
              ))}
            </div>
            <div className="fk-detail-aksi">
              <button
                type="button"
                className={selesai ? "fk-btn-ghost" : "fk-btn"}
                onClick={ubahStatus}
                disabled={sibuk || (!selesai && totalData === 0)}
                title={!selesai && totalData === 0 ? "Tambahkan minimal satu data" : undefined}
              >
                {selesai ? "Buka kembali (draft)" : "Tandai selesai"}
              </button>
              {admin && (
                <button type="button" className="fk-btn-ghost" onClick={mulaiUbahTim}>
                  Ubah petugas
                </button>
              )}
              {admin && (
                <>
                  <button
                    type="button"
                    className="fk-btn-ghost"
                    onClick={() => unduhKe(api.unduhExcel(kk.id))}
                    title="Seluruh formulir di kertas kerja ini"
                  >
                    Ekspor Excel
                  </button>
                  <button
                    type="button"
                    className="fk-btn-ghost"
                    onClick={() => unduhKe(api.unduhCsv(kk.id))}
                    title="Seluruh formulir di kertas kerja ini"
                  >
                    Ekspor CSV
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </section>

      <div className="fk-bagian">Tambah data</div>
      {bank.length === 0 ? (
        <Empty>Belum ada formulir. Minta admin menyusun bank formulir terlebih dahulu.</Empty>
      ) : (
        <div className="fk-baris-list">
          {bank.map((f, i) => {
            const jumlah = jumlahPerForm.get(f.id) || 0;
            const kosong = f.jumlahPertanyaan === 0;
            return (
              <button
                type="button"
                className="fk-baris"
                key={f.id}
                onClick={() => navigate(`${urlKk(id)}/isi/${f.id}`)}
                disabled={kosong}
              >
                <span className="fk-baris-ikon">
                  <IkonFormulir ikon={f.ikon} cadangan={i + 1} />
                </span>
                <span className="fk-baris-teks">
                  <span className="fk-baris-judul">{f.judul}</span>
                  <span className="fk-baris-ket">
                    {kosong ? "Belum punya pertanyaan" : f.deskripsi || `${f.jumlahPertanyaan} pertanyaan`}
                  </span>
                </span>
                {jumlah > 0 && <span className="fk-baris-jumlah">{jumlah}</span>}
                <span className="fk-baris-panah">›</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="fk-bagian-baris">
        <div className="fk-bagian">Data terkumpul{totalData ? ` · ${totalData}` : ""}</div>
        {jumlahKurang > 0 && (
          <button
            type="button"
            className={"fk-filter-btn is-kurang" + (saringKurang ? " is-on" : "")}
            aria-pressed={saringKurang}
            onClick={() => setHanyaKurang((v) => !v)}
          >
            Hanya berkas tidak lengkap
            <span className="fk-filter-jumlah">{jumlahKurang}</span>
          </button>
        )}
      </div>
      {totalData === 0 ? (
        <Empty>Belum ada data. Pilih salah satu formulir di atas untuk mulai mengisi.</Empty>
      ) : (
        kelompokTampil.map(({ formulir, entri }) => (
          <div className="fk-baris-list" key={formulir.id}>
            <div className="fk-grup-judul">
              <span className="fk-grup-nama">{formulir.judul}</span>
              <span className="fk-grup-aksi">
                {admin && (
                  <>
                    <button
                      type="button"
                      className="fk-mini"
                      onClick={() => unduhKe(api.unduhExcel(kk.id, formulir.id))}
                      title={`Ekspor data ${formulir.judul} ke Excel`}
                    >
                      Excel
                    </button>
                    <button
                      type="button"
                      className="fk-mini"
                      onClick={() => unduhKe(api.unduhCsv(kk.id, formulir.id))}
                      title={`Ekspor data ${formulir.judul} ke CSV`}
                    >
                      CSV
                    </button>
                  </>
                )}
                <span className="fk-baris-jumlah">{entri.length}</span>
              </span>
            </div>
            {entri.map((e) => {
              const ringkas = ringkasEntri(formulir.pertanyaan, e.jawaban);
              const foto = fotoEntri(formulir.pertanyaan, e.jawaban);
              return (
                <button
                  type="button"
                  className="fk-baris"
                  key={e.id}
                  onClick={() => navigate(`${urlKk(id)}/data/${e.id}`)}
                >
                  <span className="fk-baris-teks">
                    <span className="fk-baris-judul">{judulEntri(formulir.pertanyaan, e.jawaban)}</span>
                    {ringkas.length > 0 && <span className="fk-baris-ket">{ringkas.join(" · ")}</span>}
                    {!e.berkasLengkap && (
                      <span className="fk-baris-kurang">
                        <BerkasPill />
                        {e.catatanBerkas && <span className="fk-baris-catatan">{e.catatanBerkas}</span>}
                      </span>
                    )}
                    {foto.length > 0 && (
                      <span className="fk-baris-foto">
                        {foto.slice(0, 4).map((f) => (
                          <img key={f.id} src={api.fotoUrl(f.id)} alt="" loading="lazy" />
                        ))}
                        {foto.length > 4 && <span className="fk-baris-lebih">+{foto.length - 4}</span>}
                      </span>
                    )}
                  </span>
                  <span className="fk-baris-panah">›</span>
                </button>
              );
            })}
          </div>
        ))
      )}

      {admin ? (
        <div className="fk-zona-bahaya">
          <button type="button" className="fk-btn-danger" onClick={hapusKk} disabled={sibuk}>
            Hapus kertas kerja
          </button>
        </div>
      ) : (
        <KunciAdmin>Menghapus kertas kerja hanya bisa dilakukan admin.</KunciAdmin>
      )}
    </div>
  );
}

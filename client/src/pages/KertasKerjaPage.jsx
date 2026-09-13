import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { PageHead, Panel, Loading, ErrorBox, Empty, StatusPill } from "../components/Ui.jsx";
import FieldInput from "../components/Fields.jsx";
import PetugasTim from "../components/PetugasTim.jsx";
import { fromApi, emptyValue, buildPayload, validateRequired, statusFoto } from "../lib/answers.js";
import { judulEntri, ringkasEntri, fotoEntri } from "../lib/ringkas.js";
import { formatTimestamp } from "../lib/format.js";

const namaTim = (petugas = []) => petugas.map((p) => p.nama).join(", ") || "—";

/* ================= daftar kertas kerja ================= */

function DaftarKertasKerja({ onBuat, onBuka }) {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const muat = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setList(await api.listKertasKerja());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const hapus = async (k) => {
    const pesan =
      `Hapus kertas kerja ${k.nomor}?\n` +
      (k.jumlahData ? `${k.jumlahData} data beserta fotonya ikut terhapus.` : "Kertas kerja ini belum berisi data.");
    if (!window.confirm(pesan)) return;
    try {
      await api.deleteKertasKerja(k.id);
      await muat();
      toast("Kertas kerja dihapus.");
    } catch (e) {
      toast(e.message, true);
    }
  };

  return (
    <>
      <PageHead title="Kertas Kerja" sub="Satu nomor, satu tim petugas, banyak data per formulir.">
        <button type="button" className="fk-btn" onClick={onBuat}>
          + Buat kertas kerja
        </button>
      </PageHead>

      {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}

      {loading ? (
        <Loading label="Memuat kertas kerja..." />
      ) : list.length === 0 ? (
        <Empty
          action={
            <button type="button" className="fk-btn" onClick={onBuat}>
              Buat kertas kerja
            </button>
          }
        >
          Belum ada kertas kerja.
        </Empty>
      ) : (
        <div className="fk-kk-list">
          {list.map((k) => (
            <div className="fk-kk-card" key={k.id}>
              <span className="fk-nomor">{k.nomor}</span>
              <div className="fk-kk-card-body fk-clickable" onClick={() => onBuka(k.id)}>
                <div className="fk-lib-title fk-ellipsis">{namaTim(k.petugas)}</div>
                <div className="fk-lib-sub">
                  {k.petugas.length} petugas · {k.jumlahData} data · {formatTimestamp(k.createdAt)}
                </div>
              </div>
              <StatusPill status={k.status} />
              <div className="fk-kk-card-actions">
                <button type="button" className="fk-mini" onClick={() => onBuka(k.id)}>
                  Buka
                </button>
                <button type="button" className="fk-mini" onClick={() => api.unduhCsv(k.id)}>
                  CSV
                </button>
                <button type="button" className="fk-mini is-danger" onClick={() => hapus(k)}>
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ================= buat kertas kerja: nomor + petugas ================= */

function BuatKertasKerja({ onBatal, onSelesai }) {
  const toast = useToast();
  const [nomor, setNomor] = useState("—");
  const [petugas, setPetugas] = useState([]);
  const [tim, setTim] = useState([null]);
  const [galatTim, setGalatTim] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [membuat, setMembuat] = useState(false);

  useEffect(() => {
    let batal = false;
    Promise.all([api.nomorBerikutnya(), api.listPetugas()])
      .then(([n, p]) => {
        if (batal) return;
        setNomor(n.nomor);
        setPetugas(p);
      })
      .catch((e) => !batal && setError(e.message))
      .finally(() => !batal && setLoading(false));
    return () => {
      batal = true;
    };
  }, []);

  const buat = async () => {
    const ids = tim.filter(Boolean);
    if (!ids.length) {
      setGalatTim("Pilih minimal satu petugas.");
      return;
    }
    setMembuat(true);
    try {
      const kk = await api.createKertasKerja(ids);
      toast(`Kertas kerja ${kk.nomor} dibuat. Silakan isi data per formulir.`);
      onSelesai(kk.id);
    } catch (e) {
      toast(e.message, true);
    } finally {
      setMembuat(false);
    }
  };

  if (loading) return <Loading label="Menyiapkan kertas kerja..." />;
  if (error) return <ErrorBox>{error}</ErrorBox>;

  return (
    <>
      <PageHead
        title="Buat Kertas Kerja"
        sub="Tentukan tim petugas. Data diisi per formulir setelah kertas kerja dibuat."
      />

      <Panel>
        <div className="fk-wiz-body">
          <div>
            <span className="fk-opts-cap">Nomor kertas kerja (otomatis)</span>
            <div className="fk-nomor-big">{nomor}</div>
            <p className="fk-hint">
              Nomor final diambil server saat kertas kerja dibuat, sehingga tidak pernah duplikat walau
              beberapa tim membuat bersamaan.
            </p>
          </div>

          <div className="fk-divider" />

          <PetugasTim
            petugas={petugas}
            value={tim}
            onChange={(v) => {
              setTim(v);
              setGalatTim("");
            }}
            onPetugasBaru={(p) =>
              setPetugas((list) => [...list, p].sort((a, b) => a.nama.localeCompare(b.nama, "id")))
            }
            galat={galatTim}
          />

          <div className="fk-wiz-actions">
            <button type="button" className="fk-btn-ghost" onClick={onBatal}>
              Batal
            </button>
            <button type="button" className="fk-btn" onClick={buat} disabled={membuat}>
              {membuat ? "Membuat..." : "Buat kertas kerja"}
            </button>
          </div>
        </div>
      </Panel>
    </>
  );
}

/* ================= detail kertas kerja ================= */

function DetailKertasKerja({ id, onKembali, onIsi, onUbahData }) {
  const toast = useToast();
  const [kk, setKk] = useState(null);
  const [bank, setBank] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timEdit, setTimEdit] = useState(null); // array id | null
  const [petugas, setPetugas] = useState([]);
  const [galatTim, setGalatTim] = useState("");
  const [sibuk, setSibuk] = useState(false);

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

  if (loading && !kk) return <Loading label="Memuat kertas kerja..." />;
  if (error)
    return (
      <>
        <button type="button" className="fk-textbtn" onClick={onKembali}>
          ‹ Kembali ke daftar
        </button>
        <ErrorBox onRetry={muat}>{error}</ErrorBox>
      </>
    );
  if (!kk) return null;

  const totalData = kk.entri.length;
  const terisi = bank.filter((f) => jumlahPerForm.has(f.id)).length;
  const persen = bank.length ? Math.round((terisi / bank.length) * 100) : 0;
  const selesai = kk.status === "selesai";

  return (
    <div className="fk-fill">
      <button type="button" className="fk-textbtn" onClick={onKembali}>
        ‹ Kembali ke daftar
      </button>

      <section className="fk-panel fk-form">
        <div className="fk-form-accent" />
        <div className="fk-kk-detail-head">
          <span className="fk-nomor is-big">{kk.nomor}</span>
          <div className="fk-kk-detail-meta">
            <h1 className="fk-kk-title-top">Kertas Kerja</h1>
            <p className="fk-form-desc">
              Dibuat {formatTimestamp(kk.createdAt)} · {totalData} data
            </p>
          </div>
          <StatusPill status={kk.status} />
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
              <button type="button" className="fk-btn" onClick={simpanTim} disabled={sibuk}>
                Simpan tim
              </button>
              <button type="button" className="fk-btn-ghost" onClick={() => setTimEdit(null)}>
                Batal
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
              <button type="button" className="fk-btn-ghost" onClick={mulaiUbahTim}>
                Ubah petugas
              </button>
              <button type="button" className="fk-btn-ghost" onClick={() => api.unduhCsv(kk.id)}>
                Ekspor CSV
              </button>
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
                onClick={() => onIsi(f.id, kk.nomor)}
                disabled={kosong}
              >
                <span className="fk-baris-ikon">{i + 1}</span>
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

      <div className="fk-bagian">Data terkumpul{totalData ? ` · ${totalData}` : ""}</div>
      {totalData === 0 ? (
        <Empty>Belum ada data. Pilih salah satu formulir di atas untuk mulai mengisi.</Empty>
      ) : (
        kelompok.map(({ formulir, entri }) => (
          <div className="fk-baris-list" key={formulir.id}>
            <div className="fk-grup-judul">
              {formulir.judul}
              <span className="fk-baris-jumlah">{entri.length}</span>
            </div>
            {entri.map((e) => {
              const ringkas = ringkasEntri(formulir.pertanyaan, e.jawaban);
              const foto = fotoEntri(formulir.pertanyaan, e.jawaban);
              return (
                <button type="button" className="fk-baris" key={e.id} onClick={() => onUbahData(e.id)}>
                  <span className="fk-baris-teks">
                    <span className="fk-baris-judul">{judulEntri(formulir.pertanyaan, e.jawaban)}</span>
                    {ringkas.length > 0 && <span className="fk-baris-ket">{ringkas.join(" · ")}</span>}
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
    </div>
  );
}

/* ================= isi / ubah satu data ================= */

function IsiData({ kkId, formulirId, entriId, nomor: nomorAwal, onKembali }) {
  const toast = useToast();
  const [formulir, setFormulir] = useState(null);
  const [nomor, setNomor] = useState(nomorAwal || "");
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menyimpan, setMenyimpan] = useState(null); // "simpan" | "lagi" | null
  const wadah = useRef(null);

  const kosongkan = useCallback((f) => {
    const awal = {};
    for (const q of f.pertanyaan) awal[q.id] = emptyValue(q.tipe);
    setAnswers(awal);
    setErrors({});
  }, []);

  useEffect(() => {
    let batal = false;
    setLoading(true);
    (async () => {
      try {
        if (entriId) {
          const e = await api.getEntri(entriId);
          if (batal) return;
          setFormulir(e.formulir);
          setNomor(e.kertasKerja.nomor);
          const awal = {};
          for (const q of e.formulir.pertanyaan) {
            awal[q.id] = e.jawaban[q.id] === undefined ? emptyValue(q.tipe) : fromApi(q.tipe, e.jawaban[q.id]);
          }
          setAnswers(awal);
        } else {
          const f = await api.getFormulir(formulirId);
          if (batal) return;
          setFormulir(f);
          kosongkan(f);
        }
      } catch (e) {
        if (!batal) setError(e.message);
      } finally {
        if (!batal) setLoading(false);
      }
    })();
    return () => {
      batal = true;
    };
  }, [entriId, formulirId, kosongkan]);

  // Mendukung nilai langsung maupun fungsi updater (dipakai unggahan foto).
  const setAnswer = (qid, v) => {
    setAnswers((a) => ({ ...a, [qid]: typeof v === "function" ? v(a[qid]) : v }));
    setErrors((e) => {
      if (!e[qid]) return e;
      const next = { ...e };
      delete next[qid];
      return next;
    });
  };

  const fokusError = (errs) => {
    const qid = Object.keys(errs)[0];
    const el = qid && wadah.current?.querySelector(`[data-qid="${qid}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const simpan = async (lanjut) => {
    const pertanyaan = formulir.pertanyaan;
    const foto = statusFoto(pertanyaan, answers);
    if (foto.unggah) {
      toast("Tunggu hingga semua foto selesai diunggah.", true);
      return;
    }
    if (foto.gagal) {
      toast("Ada foto yang gagal diunggah. Coba lagi atau hapus foto tersebut.", true);
      return;
    }

    const errs = validateRequired(pertanyaan, answers);
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast("Lengkapi kolom wajib yang ditandai merah.", true);
      fokusError(errs);
      return;
    }

    setMenyimpan(lanjut ? "lagi" : "simpan");
    try {
      const payload = buildPayload(pertanyaan, answers);
      const hasil = entriId
        ? await api.updateEntri(entriId, payload)
        : await api.createEntri(kkId, formulirId, payload);
      toast(`Data "${judulEntri(hasil.formulir.pertanyaan, hasil.jawaban)}" tersimpan.`);

      if (lanjut) {
        kosongkan(formulir);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        onKembali();
      }
    } catch (e) {
      if (e.status === 422 && e.data?.errors) {
        setErrors(e.data.errors);
        fokusError(e.data.errors);
      }
      toast(e.message, true);
    } finally {
      setMenyimpan(null);
    }
  };

  const hapus = async () => {
    if (!window.confirm("Hapus data ini beserta fotonya dari kertas kerja?")) return;
    try {
      await api.deleteEntri(entriId);
      toast("Data dihapus.");
      onKembali();
    } catch (e) {
      toast(e.message, true);
    }
  };

  const kembali = (
    <button type="button" className="fk-textbtn" onClick={onKembali}>
      ‹ Kembali ke kertas kerja{nomor ? ` ${nomor}` : ""}
    </button>
  );

  if (loading) return <Loading label="Memuat formulir..." />;
  if (error)
    return (
      <>
        {kembali}
        <ErrorBox>{error}</ErrorBox>
      </>
    );
  if (!formulir) return null;

  return (
    <div ref={wadah} className="fk-fill">
      {kembali}

      <section className="fk-panel fk-form">
        <div className="fk-form-accent" />
        <span className="fk-opts-cap">
          Kertas kerja {nomor} · {entriId ? "ubah data" : "data baru"}
        </span>
        <h1 className="fk-kk-title-top" style={{ marginTop: 6 }}>
          {formulir.judul}
        </h1>
        {formulir.deskripsi && <p className="fk-form-desc">{formulir.deskripsi}</p>}
      </section>

      <section className="fk-section">
        {formulir.pertanyaan.length === 0 && <div className="fk-lt-empty">Formulir ini belum punya pertanyaan.</div>}
        {formulir.pertanyaan.map((q) => (
          <div className="fk-field" key={q.id} data-qid={q.id}>
            <label className="fk-q-name">
              {q.label || "(pertanyaan tanpa judul)"}
              {q.wajib && <span className="fk-star">*</span>}
            </label>
            <FieldInput
              q={q}
              value={answers[q.id]}
              invalid={Boolean(errors[q.id])}
              onChange={(v) => setAnswer(q.id, v)}
            />
            {errors[q.id] && <span className="fk-err">{errors[q.id]}</span>}
          </div>
        ))}
      </section>

      <div className="fk-form-actions fk-sticky-actions">
        <button type="button" className="fk-btn" onClick={() => simpan(false)} disabled={menyimpan !== null}>
          {menyimpan === "simpan" ? "Menyimpan..." : "Simpan"}
        </button>
        {!entriId && (
          <button type="button" className="fk-btn-ghost" onClick={() => simpan(true)} disabled={menyimpan !== null}>
            {menyimpan === "lagi" ? "Menyimpan..." : "Simpan & tambah lagi"}
          </button>
        )}
        {entriId && (
          <button type="button" className="fk-btn-danger" onClick={hapus} disabled={menyimpan !== null}>
            Hapus data
          </button>
        )}
      </div>
    </div>
  );
}

/* ================= pembungkus halaman ================= */

export default function KertasKerjaPage({ permintaan, onPermintaanDiproses }) {
  // { mode: "list" } | { mode: "baru" } | { mode: "detail", id }
  // | { mode: "isi", kkId, formulirId?, entriId?, nomor? }
  const [layar, setLayar] = useState({ mode: "list" });

  // Permintaan dari luar (klik kartu di dashboard, tombol "buat", menu samping).
  useEffect(() => {
    if (!permintaan) return;
    if (permintaan.jenis === "baru") setLayar({ mode: "baru" });
    else if (permintaan.jenis === "buka") setLayar({ mode: "detail", id: permintaan.id });
    else setLayar({ mode: "list" });
    onPermintaanDiproses();
  }, [permintaan, onPermintaanDiproses]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [layar]);

  const keList = () => setLayar({ mode: "list" });
  const keDetail = (id) => setLayar({ mode: "detail", id });

  switch (layar.mode) {
    case "baru":
      return <BuatKertasKerja onBatal={keList} onSelesai={keDetail} />;

    case "detail":
      return (
        <DetailKertasKerja
          key={layar.id}
          id={layar.id}
          onKembali={keList}
          onIsi={(formulirId, nomor) => setLayar({ mode: "isi", kkId: layar.id, formulirId, nomor })}
          onUbahData={(entriId) => setLayar({ mode: "isi", kkId: layar.id, entriId })}
        />
      );

    case "isi":
      return (
        <IsiData
          key={`${layar.entriId || "baru"}-${layar.formulirId || ""}`}
          kkId={layar.kkId}
          formulirId={layar.formulirId}
          entriId={layar.entriId}
          nomor={layar.nomor}
          onKembali={() => keDetail(layar.kkId)}
        />
      );

    default:
      return <DaftarKertasKerja onBuat={() => setLayar({ mode: "baru" })} onBuka={keDetail} />;
  }
}

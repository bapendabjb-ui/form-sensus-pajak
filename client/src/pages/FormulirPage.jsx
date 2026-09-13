import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import { pasangPenjaga } from "../lib/router.js";
import { useToast } from "../components/Toast.jsx";
import { PageHead, Panel, Loading, ErrorBox, Empty } from "../components/Ui.jsx";
import { IconLock } from "../components/Icons.jsx";
import { TYPES, TYPE_LABEL, HAS_OPTIONS, defaultOptions } from "../lib/format.js";

/* ================= login admin ================= */

function LoginCard({ onLoggedIn }) {
  const toast = useToast();
  const [form, setForm] = useState({ user: "", pass: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const masuk = async () => {
    if (!form.user.trim() || !form.pass) {
      setErr("Username dan password wajib diisi.");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      await api.login(form.user.trim(), form.pass);
      toast("Berhasil masuk sebagai admin.");
      onLoggedIn();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fk-login">
      <div className="fk-login-card">
        <span className="fk-logo fk-login-logo">
          <IconLock />
        </span>
        <h2 className="fk-login-title">Login Admin</h2>
        <p className="fk-login-sub">Penyusunan bank formulir hanya untuk admin.</p>

        <input
          className="fk-input"
          placeholder="Username"
          autoComplete="username"
          value={form.user}
          onChange={(e) => {
            setForm((f) => ({ ...f, user: e.target.value }));
            setErr("");
          }}
        />
        <input
          className="fk-input"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={form.pass}
          onChange={(e) => {
            setForm((f) => ({ ...f, pass: e.target.value }));
            setErr("");
          }}
          onKeyDown={(e) => e.key === "Enter" && masuk()}
        />

        {err && <span className="fk-err">{err}</span>}

        <button type="button" className="fk-btn fk-login-btn" onClick={masuk} disabled={loading}>
          {loading ? "Memeriksa..." : "Masuk"}
        </button>
        <p className="fk-hint">Akun diambil dari ADMIN_USERNAME / ADMIN_PASSWORD di server.</p>
      </div>
    </div>
  );
}

/* ================= editor satu formulir ================= */

function QuestionCard({ q, idx, total, onPatch, onRemove, onMove }) {
  const setOpsi = (i, val) => onPatch({ opsi: q.opsi.map((o, j) => (j === i ? val : o)) });
  const tambahOpsi = () => onPatch({ opsi: [...q.opsi, `Opsi ${q.opsi.length + 1}`] });
  const hapusOpsi = (i) => onPatch({ opsi: q.opsi.filter((_, j) => j !== i) });

  return (
    <section className="fk-q">
      <div className="fk-q-side">
        <span className="fk-q-num">{idx + 1}</span>
        <div className="fk-q-move">
          <button type="button" onClick={() => onMove(-1)} disabled={idx === 0} aria-label="Naikkan">▲</button>
          <button type="button" onClick={() => onMove(1)} disabled={idx === total - 1} aria-label="Turunkan">▼</button>
        </div>
      </div>

      <div className="fk-q-body">
        <div className="fk-q-top">
          <input
            className="fk-input fk-q-label"
            value={q.label}
            placeholder="Tulis pertanyaan"
            onChange={(e) => onPatch({ label: e.target.value })}
          />
          <span className="fk-tag">{TYPE_LABEL[q.tipe]}</span>
        </div>

        {HAS_OPTIONS.includes(q.tipe) && (
          <div className="fk-opts">
            {q.tipe === "linetariff" && (
              <span className="fk-opts-cap">Pilihan untuk kolom “Jenis tarif”</span>
            )}
            {q.opsi.map((o, i) => (
              <div className="fk-opt-row" key={i}>
                <span className={"fk-opt-mark fk-opt-" + q.tipe} />
                <input
                  className="fk-input fk-opt-input"
                  value={o}
                  onChange={(e) => setOpsi(i, e.target.value)}
                  placeholder={`Opsi ${i + 1}`}
                />
                <button
                  type="button"
                  className="fk-iconbtn"
                  onClick={() => hapusOpsi(i)}
                  disabled={q.opsi.length <= 1}
                  aria-label="Hapus opsi"
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="fk-add-opt" onClick={tambahOpsi}>
              + Tambah opsi
            </button>

            {q.tipe === "linetariff" && (
              <button
                type="button"
                className={"fk-switch fk-lt-switch" + (q.rangeHarga ? " is-on" : "")}
                onClick={() => onPatch({ rangeHarga: !q.rangeHarga })}
                aria-pressed={q.rangeHarga}
              >
                <span className="fk-switch-knob" /> Izinkan harga rentang (atur per baris)
              </button>
            )}
          </div>
        )}

        {q.tipe === "wilayah" && (
          <p className="fk-hint">
            Petugas memilih kecamatan, lalu daftar kelurahan otomatis menyesuaikan (data wilayah Kota
            Banjarbaru: 5 kecamatan, 20 kelurahan). Memilih kelurahan langsung juga mengisi kecamatannya.
          </p>
        )}

        <div className="fk-q-foot">
          <button
            type="button"
            className={"fk-switch" + (q.wajib ? " is-on" : "")}
            onClick={() => onPatch({ wajib: !q.wajib })}
            aria-pressed={q.wajib}
          >
            <span className="fk-switch-knob" /> Wajib diisi
          </button>
          <button type="button" className="fk-del" onClick={onRemove}>
            Hapus pertanyaan
          </button>
        </div>
      </div>
    </section>
  );
}

/* ================= halaman ================= */

export default function FormulirPage({ admin, onAuthChanged }) {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [error, setError] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);

  // Konfirmasi bila meninggalkan halaman saat susunan formulir belum disimpan.
  useEffect(
    () => (dirty ? pasangPenjaga(() => "Perubahan formulir belum disimpan. Tinggalkan halaman ini?") : undefined),
    [dirty]
  );

  /* ---- pemuatan ---- */

  const muatList = useCallback(async (pilihId) => {
    setLoadingList(true);
    setError("");
    try {
      const data = await api.listFormulir();
      setList(data);
      setSelId((sekarang) => {
        const target = pilihId ?? sekarang;
        if (target && data.some((f) => f.id === target)) return target;
        return data[0]?.id ?? null;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (admin) muatList();
  }, [admin, muatList]);

  useEffect(() => {
    if (!admin || !selId) {
      setDraft(null);
      return;
    }
    let batal = false;
    setLoadingDraft(true);
    api
      .getFormulir(selId)
      .then((f) => {
        if (batal) return;
        setDraft(f);
        setDirty(false);
      })
      .catch((e) => !batal && toast(e.message, true))
      .finally(() => !batal && setLoadingDraft(false));
    return () => {
      batal = true;
    };
  }, [admin, selId, toast]);

  /* ---- perubahan draft (lokal) ---- */

  const patchDraft = (p) => {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  };

  const patchQ = (qi, p) => {
    setDraft((d) => ({
      ...d,
      pertanyaan: d.pertanyaan.map((q, i) => (i === qi ? { ...q, ...p } : q)),
    }));
    setDirty(true);
  };

  const tambahQ = (tipe) => {
    setDraft((d) => ({
      ...d,
      pertanyaan: [
        ...d.pertanyaan,
        { id: null, tipe, label: "", wajib: false, rangeHarga: false, opsi: defaultOptions(tipe) },
      ],
    }));
    setDirty(true);
  };

  const hapusQ = (qi) => {
    setDraft((d) => ({ ...d, pertanyaan: d.pertanyaan.filter((_, i) => i !== qi) }));
    setDirty(true);
  };

  const geserQ = (qi, arah) => {
    setDraft((d) => {
      const qs = [...d.pertanyaan];
      const j = qi + arah;
      if (j < 0 || j >= qs.length) return d;
      [qs[qi], qs[j]] = [qs[j], qs[qi]];
      return { ...d, pertanyaan: qs };
    });
    setDirty(true);
  };

  /* ---- aksi server ---- */

  const gantiFormulir = (id) => {
    if (id === selId) return;
    if (dirty && !window.confirm("Ada perubahan yang belum disimpan. Tinggalkan formulir ini?")) return;
    setSelId(id);
  };

  const formulirBaru = async () => {
    if (dirty && !window.confirm("Ada perubahan yang belum disimpan. Lanjut membuat formulir baru?")) return;
    try {
      const f = await api.createFormulir({ judul: "Formulir baru", deskripsi: "", pertanyaan: [] });
      await muatList(f.id);
      setSelId(f.id);
      toast("Formulir baru dibuat.");
    } catch (e) {
      toast(e.message, true);
    }
  };

  const simpan = async () => {
    if (!draft) return;
    if (!draft.judul.trim()) {
      toast("Judul formulir wajib diisi.", true);
      return;
    }
    const kosong = draft.pertanyaan.find(
      (q) => HAS_OPTIONS.includes(q.tipe) && q.opsi.filter((o) => o.trim()).length === 0
    );
    if (kosong) {
      toast(`Pertanyaan "${kosong.label || "(tanpa judul)"}" harus punya minimal satu opsi.`, true);
      return;
    }

    setMenyimpan(true);
    try {
      const payload = {
        judul: draft.judul.trim(),
        deskripsi: draft.deskripsi.trim(),
        pertanyaan: draft.pertanyaan.map((q) => ({
          id: q.id ?? undefined,
          tipe: q.tipe,
          label: q.label,
          wajib: q.wajib,
          rangeHarga: q.rangeHarga,
          opsi: q.opsi,
        })),
      };
      const hasil = await api.updateFormulir(draft.id, payload);
      setDraft(hasil);
      setDirty(false);
      await muatList(hasil.id);
      toast("Formulir tersimpan.");
    } catch (e) {
      if (e.status === 401) onAuthChanged();
      toast(e.message, true);
    } finally {
      setMenyimpan(false);
    }
  };

  /** Buang perubahan lokal dengan memuat ulang formulir dari server. */
  const batalkanPerubahan = async () => {
    if (!draft) return;
    try {
      const f = await api.getFormulir(draft.id);
      setDraft(f);
      setDirty(false);
      toast("Perubahan dibatalkan.");
    } catch (e) {
      toast(e.message, true);
    }
  };

  const hapusFormulir = async (f) => {
    if (!window.confirm(`Hapus formulir "${f.judul}"?`)) return;
    try {
      await api.deleteFormulir(f.id);
      await muatList();
      toast("Formulir dihapus.");
    } catch (e) {
      if (e.status === 409) {
        const pesan = `${e.message}\n\nLanjut hapus beserta jawabannya?`;
        if (!window.confirm(pesan)) return;
        try {
          await api.deleteFormulir(f.id, true);
          await muatList();
          toast("Formulir dihapus.");
        } catch (e2) {
          toast(e2.message, true);
        }
        return;
      }
      if (e.status === 401) onAuthChanged();
      toast(e.message, true);
    }
  };

  /* ---- render ---- */

  if (!admin) return <LoginCard onLoggedIn={onAuthChanged} />;

  return (
    <>
      <PageHead title="Bank Formulir" sub="Formulir yang dipakai saat menyusun kertas kerja.">
        {dirty && <span className="fk-dirty">Belum disimpan</span>}
      </PageHead>

      {error && <ErrorBox onRetry={() => muatList()}>{error}</ErrorBox>}

      <Panel>
        {loadingList ? (
          <Loading label="Memuat formulir..." />
        ) : (
          <div className="fk-lib-list">
            {list.map((f) => (
              <div
                key={f.id}
                className={"fk-lib-row" + (f.id === selId ? " is-sel" : "")}
                onClick={() => gantiFormulir(f.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && gantiFormulir(f.id)}
              >
                <div>
                  <div className="fk-lib-title">{f.judul || "Tanpa judul"}</div>
                  <div className="fk-lib-sub">
                    {f.jumlahPertanyaan} pertanyaan
                    {f.jumlahData > 0 && ` · ${f.jumlahData} data terisi`}
                  </div>
                </div>
                <button
                  type="button"
                  className="fk-iconbtn"
                  onClick={(e) => {
                    e.stopPropagation();
                    hapusFormulir(f);
                  }}
                  aria-label={`Hapus ${f.judul}`}
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="fk-add-btn" onClick={formulirBaru}>
              + Formulir baru
            </button>
          </div>
        )}
      </Panel>

      {loadingDraft && <Loading label="Memuat isi formulir..." />}

      {!loadingDraft && !draft && !loadingList && (
        <Empty
          action={
            <button type="button" className="fk-btn" onClick={formulirBaru}>
              Buat formulir
            </button>
          }
        >
          Belum ada formulir di bank formulir.
        </Empty>
      )}

      {!loadingDraft && draft && (
        <>
          <Panel>
            <input
              className="fk-title-input"
              value={draft.judul}
              placeholder="Judul formulir"
              onChange={(e) => patchDraft({ judul: e.target.value })}
            />
            <input
              className="fk-desc-input"
              value={draft.deskripsi}
              placeholder="Deskripsi singkat"
              onChange={(e) => patchDraft({ deskripsi: e.target.value })}
            />
          </Panel>

          <div className="fk-toolbar">
            <span className="fk-tool-label">Tambah pertanyaan</span>
            <div className="fk-tool-btns">
              {TYPES.map((t) => (
                <button type="button" key={t.key} className="fk-tool-btn" onClick={() => tambahQ(t.key)}>
                  + {t.label}
                </button>
              ))}
            </div>
          </div>

          {draft.pertanyaan.length === 0 && (
            <div className="fk-lt-empty">Belum ada pertanyaan — tambahkan dari tombol di atas.</div>
          )}

          {draft.pertanyaan.map((q, i) => (
            <QuestionCard
              key={q.id ?? `baru-${i}`}
              q={q}
              idx={i}
              total={draft.pertanyaan.length}
              onPatch={(p) => patchQ(i, p)}
              onRemove={() => hapusQ(i)}
              onMove={(arah) => geserQ(i, arah)}
            />
          ))}

          <div className="fk-form-actions fk-sticky-actions">
            <button type="button" className="fk-btn" onClick={simpan} disabled={menyimpan || !dirty}>
              {menyimpan ? "Menyimpan..." : dirty ? "Simpan formulir" : "Tersimpan"}
            </button>
            {dirty && (
              <button type="button" className="fk-btn-ghost" onClick={batalkanPerubahan}>
                Batalkan perubahan
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

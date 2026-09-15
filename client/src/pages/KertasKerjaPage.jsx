import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useDialog } from "../components/Dialog.jsx";
import { PageHead, Panel, Loading, ErrorBox, Empty, StatusPill, KunciAdmin } from "../components/Ui.jsx";
import FieldInput from "../components/Fields.jsx";
import PetugasTim from "../components/PetugasTim.jsx";
import { fromApi, emptyValue, buildPayload, validateRequired, statusFoto, idSalahSatuWajib } from "../lib/answers.js";
import { judulEntri, ringkasEntri, fotoEntri } from "../lib/ringkas.js";
import { formatTimestamp } from "../lib/format.js";
import { useAdmin } from "../lib/admin.js";
import { navigate, kembali, pasangPenjaga } from "../lib/router.js";

const urlKk = (id) => `/kertas-kerja/${id}`;

/** "Andi Saputra" atau "Andi Saputra +2" - cukup pendek untuk baris keterangan. */
const ringkasTim = (petugas = []) => {
  if (!petugas.length) return "—";
  const lain = petugas.length - 1;
  return lain > 0 ? `${petugas[0].nama} +${lain}` : petugas[0].nama;
};

/* ================= daftar kertas kerja ================= */

export function DaftarKertasKerja() {
  const toast = useToast();
  const { konfirmasi } = useDialog();
  const admin = useAdmin();
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
    const ya = await konfirmasi({
      judul: `Hapus kertas kerja ${k.nomor}?`,
      pesan: k.jumlahData
        ? `${k.jumlahData} data beserta fotonya ikut terhapus. Tindakan ini tidak dapat dibatalkan.`
        : "Kertas kerja ini belum berisi data.",
      ya: "Hapus",
      bahaya: true,
    });
    if (!ya) return;
    try {
      await api.deleteKertasKerja(k.id);
      await muat();
      toast("Kertas kerja dihapus.");
    } catch (e) {
      toast(e.message, true);
    }
  };

  const buat = () => navigate("/kertas-kerja/baru");

  return (
    <>
      <PageHead title="Kertas Kerja" sub="Satu Nomor, Satu Tim Petugas, Data Per Formulir.">
        <button type="button" className="fk-btn" onClick={buat}>
          + Buat kertas kerja
        </button>
      </PageHead>

      {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}

      {loading ? (
        <Loading label="Memuat kertas kerja..." />
      ) : list.length === 0 ? (
        <Empty
          action={
            <button type="button" className="fk-btn" onClick={buat}>
              Buat kertas kerja
            </button>
          }
        >
          Belum ada kertas kerja.
        </Empty>
      ) : (
        <div className="fk-kk-list">
          {list.map((k) => (
            <div
              className="fk-kk-card is-clickable"
              key={k.id}
              role="link"
              tabIndex={0}
              onClick={() => navigate(urlKk(k.id))}
              onKeyDown={(e) => e.key === "Enter" && navigate(urlKk(k.id))}
            >
              <span className="fk-nomor">{k.nomor}</span>
              <div className="fk-kk-card-body">
                <div className="fk-lib-title fk-ellipsis">{ringkasTim(k.petugas)}</div>
                <div className="fk-lib-sub fk-ellipsis">
                  {k.jumlahData} data · {formatTimestamp(k.createdAt)}
                </div>
              </div>
              <StatusPill status={k.status} />
              {/* Aksi tambahan hanya di desktop; di HP semuanya ada di halaman kertas kerja. */}
              <div className="fk-kk-card-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="fk-mini" onClick={() => api.unduhCsv(k.id)}>
                  CSV
                </button>
                {admin && (
                  <button type="button" className="fk-mini is-danger" onClick={() => hapus(k)}>
                    Hapus
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ================= buat kertas kerja: nomor + petugas ================= */

export function BuatKertasKerja() {
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
      // replace: tombol Kembali dari kertas kerja tidak kembali ke layar "buat".
      navigate(urlKk(kk.id), { replace: true });
    } catch (e) {
      toast(e.message, true);
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
            <span className="fk-opts-cap"><strong>Nomor Kertas Kerja</strong></span>
            <div className="fk-nomor-big">{nomor}</div>
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
        </div>
      </Panel>

      <div className="fk-form-actions fk-sticky-actions">
        <button type="button" className="fk-btn-ghost" onClick={() => kembali("/kertas-kerja")}>
          Batal
        </button>
        <button type="button" className="fk-btn" onClick={buat} disabled={membuat}>
          {membuat ? "Membuat..." : "Buat kertas kerja"}
        </button>
      </div>
    </>
  );
}

/* ================= detail kertas kerja ================= */

export function DetailKertasKerja({ id }) {
  const toast = useToast();
  const { konfirmasi } = useDialog();
  const admin = useAdmin();
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
                onClick={() => navigate(`${urlKk(id)}/isi/${f.id}`)}
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
                <button
                  type="button"
                  className="fk-baris"
                  key={e.id}
                  onClick={() => navigate(`${urlKk(id)}/data/${e.id}`)}
                >
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

/* ================= isi / ubah satu data ================= */

const UMUR_FOTO_DRAF_MS = 20 * 3600 * 1000; // unggahan yang tak disimpan dibersihkan server setelah 24 jam

/** Salin jawaban untuk disimpan sebagai draf: foto hanya yang sudah terunggah. */
function jawabanUntukDraf(pertanyaan, answers) {
  const hasil = {};
  for (const q of pertanyaan) {
    const v = answers[q.id];
    if (v === undefined) continue;
    hasil[q.id] =
      q.tipe === "foto" && Array.isArray(v) ? v.filter((f) => f && f.id).map((f) => ({ id: f.id, nama: f.nama })) : v;
  }
  return hasil;
}

export function IsiData({ kkId, formulirId, entriId }) {
  const toast = useToast();
  const { konfirmasi } = useDialog();
  const admin = useAdmin();
  const [formulir, setFormulir] = useState(null);
  const [nomor, setNomor] = useState("");
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menyimpan, setMenyimpan] = useState(null); // "simpan" | "lagi" | null
  const [draf, setDraf] = useState(null); // draf tersimpan yang belum dipulihkan
  const wadah = useRef(null);
  const berubah = useRef(false);

  const urlKembali = urlKk(kkId);
  const kunciDraf = entriId ? `sensus-pajak:draf:data-${entriId}` : `sensus-pajak:draf:kk${kkId}-f${formulirId}`;

  const hapusDraf = useCallback(() => {
    try {
      localStorage.removeItem(kunciDraf);
    } catch {
      /* penyimpanan perangkat tidak tersedia */
    }
  }, [kunciDraf]);

  const kosongkan = useCallback((f) => {
    const awal = {};
    for (const q of f.pertanyaan) awal[q.id] = emptyValue(q.tipe);
    setAnswers(awal);
    setErrors({});
    berubah.current = false;
  }, []);

  // Muat formulir (+ jawaban lama bila mengubah data) dan periksa draf di perangkat.
  useEffect(() => {
    let batal = false;
    setLoading(true);
    (async () => {
      try {
        let f;
        if (entriId) {
          const e = await api.getEntri(entriId);
          if (batal) return;
          f = e.formulir;
          setNomor(e.kertasKerja.nomor);
          const awal = {};
          for (const q of f.pertanyaan) {
            awal[q.id] = e.jawaban[q.id] === undefined ? emptyValue(q.tipe) : fromApi(q.tipe, e.jawaban[q.id]);
          }
          setAnswers(awal);
        } else {
          const [form, kk] = await Promise.all([api.getFormulir(formulirId), api.getKertasKerja(kkId)]);
          if (batal) return;
          f = form;
          setNomor(kk.nomor);
          kosongkan(form);
        }
        setFormulir(f);

        try {
          const tersimpan = JSON.parse(localStorage.getItem(kunciDraf) || "null");
          if (tersimpan && tersimpan.answers) setDraf(tersimpan);
        } catch {
          /* draf rusak atau penyimpanan tidak tersedia */
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
  }, [entriId, formulirId, kkId, kosongkan, kunciDraf]);

  // Simpan draf ke perangkat setiap kali isian berubah (tidak saat tawaran draf lama masih tampil).
  useEffect(() => {
    if (!formulir || !berubah.current || draf) return undefined;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          kunciDraf,
          JSON.stringify({ waktu: Date.now(), answers: jawabanUntukDraf(formulir.pertanyaan, answers) })
        );
      } catch {
        /* penyimpanan penuh / tidak tersedia */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [answers, formulir, draf, kunciDraf]);

  // Konfirmasi sebelum meninggalkan layar bila ada isian yang belum disimpan.
  useEffect(() => pasangPenjaga(() => berubah.current), []);

  const pulihkanDraf = () => {
    const fotoKedaluwarsa = Date.now() - draf.waktu > UMUR_FOTO_DRAF_MS;
    setAnswers((sekarang) => {
      const hasil = { ...sekarang };
      for (const q of formulir.pertanyaan) {
        const v = draf.answers[q.id];
        if (v === undefined) continue;
        hasil[q.id] = q.tipe === "foto" && fotoKedaluwarsa ? emptyValue("foto") : v;
      }
      return hasil;
    });
    berubah.current = true;
    setDraf(null);
    toast(fotoKedaluwarsa ? "Draf dipulihkan. Foto pada draf lama perlu diambil ulang." : "Isian draf dipulihkan.");
  };

  const buangDraf = () => {
    hapusDraf();
    setDraf(null);
  };

  // Mendukung nilai langsung maupun fungsi updater (dipakai unggahan foto).
  const setAnswer = (qid, v) => {
    berubah.current = true;
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
      toast("Periksa kolom yang ditandai merah.", true);
      fokusError(errs);
      return;
    }

    setMenyimpan(lanjut ? "lagi" : "simpan");
    try {
      const payload = buildPayload(pertanyaan, answers);
      const hasil = entriId
        ? await api.updateEntri(entriId, payload)
        : await api.createEntri(kkId, formulirId, payload);
      berubah.current = false;
      hapusDraf();
      toast(`Data "${judulEntri(hasil.formulir.pertanyaan, hasil.jawaban)}" tersimpan.`);

      if (lanjut) {
        kosongkan(formulir);
        window.scrollTo({ top: 0, behavior: "smooth" });
        setMenyimpan(null);
      } else {
        kembali(urlKembali);
      }
    } catch (e) {
      if (e.status === 422 && e.data?.errors) {
        setErrors(e.data.errors);
        fokusError(e.data.errors);
      }
      toast(
        e.status === 0 ? "Tidak ada koneksi. Isian aman tersimpan sebagai draf — coba simpan lagi nanti." : e.message,
        true
      );
      setMenyimpan(null);
    }
  };

  const hapus = async () => {
    const ya = await konfirmasi({
      judul: "Hapus data ini?",
      pesan: "Data beserta fotonya dihapus dari kertas kerja. Tindakan ini tidak dapat dibatalkan.",
      ya: "Hapus",
      bahaya: true,
    });
    if (!ya) return;
    try {
      await api.deleteEntri(entriId);
      berubah.current = false;
      hapusDraf();
      toast("Data dihapus.");
      kembali(urlKembali);
    } catch (e) {
      toast(e.message, true);
    }
  };

  const tombolKembali = (
    <button type="button" className="fk-textbtn hanya-desktop" onClick={() => kembali(urlKembali)}>
      ‹ Kembali ke kertas kerja{nomor ? ` ${nomor}` : ""}
    </button>
  );

  if (loading) return <Loading label="Memuat formulir..." />;
  if (error)
    return (
      <>
        {tombolKembali}
        <ErrorBox>{error}</ErrorBox>
      </>
    );
  if (!formulir) return null;

  const { unggah } = statusFoto(formulir.pertanyaan, answers);
  const sibuk = menyimpan !== null;

  return (
    <div ref={wadah} className="fk-fill">
      {tombolKembali}

      {draf && (
        <div className="fk-draf" role="status">
          <span>
            Ada isian yang belum tersimpan dari{" "}
            {new Date(draf.waktu).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.
          </span>
          <button type="button" className="fk-mini" onClick={buangDraf}>
            Buang
          </button>
          <button type="button" className="fk-btn" onClick={pulihkanDraf}>
            Lanjutkan isian
          </button>
        </div>
      )}

      <section className="fk-panel fk-form fk-form-kepala">
        <div className="fk-form-accent" />
        <span className="fk-opts-cap">
          Kertas kerja {nomor} · {entriId ? "ubah data" : "data baru"}
        </span>
        <h2 className="fk-kk-title-top" style={{ marginTop: 6 }}>
          {formulir.judul}
        </h2>
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
            {idSalahSatuWajib(formulir.pertanyaan).has(q.id) && (
              <span className="fk-hint-kecil">Cukup isi salah satu: NIK atau NPWP.</span>
            )}
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

      {entriId &&
        (admin ? (
          <div className="fk-zona-bahaya">
            <button type="button" className="fk-btn-danger" onClick={hapus} disabled={sibuk}>
              Hapus data ini
            </button>
          </div>
        ) : (
          <KunciAdmin>
            Menghapus data hanya bisa dilakukan admin. Isian yang keliru masih bisa Anda perbaiki lalu simpan.
          </KunciAdmin>
        ))}

      <div className="fk-form-actions fk-sticky-actions">
        {!entriId && (
          <button type="button" className="fk-btn-ghost" onClick={() => simpan(true)} disabled={sibuk || unggah > 0}>
            {menyimpan === "lagi" ? "Menyimpan..." : "Simpan & Tambah Lagi"}
          </button>
        )}
        <button type="button" className="fk-btn" onClick={() => simpan(false)} disabled={sibuk || unggah > 0}>
          {unggah > 0 ? "Menunggu foto..." : menyimpan === "simpan" ? "Menyimpan..." : "Simpan"}
        </button>
      </div>
    </div>
  );
}

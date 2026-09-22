import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api.js";
import { pasangPenjaga } from "../lib/router.js";
import { useToast } from "../components/Toast.jsx";
import { useDialog } from "../components/Dialog.jsx";
import { PageHead, Panel, Loading, ErrorBox, Empty } from "../components/Ui.jsx";
import LoginAdmin from "../components/LoginAdmin.jsx";
import HasilImpor from "../components/HasilImpor.jsx";
import { IkonSeret, IkonFormulir, DAFTAR_IKON_FORMULIR, labelIkonFormulir } from "../components/Icons.jsx";
import useDragUrut, { pindahkan } from "../lib/useDragUrut.js";
import { TYPES, TYPE_LABEL, HAS_OPTIONS, defaultOptions } from "../lib/format.js";
import CustomSelect from "../components/CustomSelect.jsx";
import { sumberUntukTipe, labelSumber } from "../lib/epbb.js";

/* ================= editor satu formulir ================= */

const TANPA_ISI_EPBB = "Tidak diisi otomatis";

/**
 * Pilihan "Isi otomatis dari EPBB". Hanya tampil bila formulir punya pertanyaan NOP
 * dan tipe pertanyaan ini punya sumber data EPBB yang cocok.
 */
function PilihIsiEpbb({ q, onPatch }) {
  const sumber = sumberUntukTipe(q.tipe);
  if (sumber.length === 0) return null;
  const pilih = (label) => {
    const s = sumber.find((x) => x.label === label);
    onPatch({ isiEpbb: s ? s.kunci : "" });
  };
  return (
    <div className="fk-isi-epbb">
      <span className="fk-opts-cap">Isi otomatis dari EPBB (hasil cek NOP)</span>
      <CustomSelect
        value={q.isiEpbb ? labelSumber(q.isiEpbb) : TANPA_ISI_EPBB}
        options={[TANPA_ISI_EPBB, ...sumber.map((s) => s.label)]}
        onChange={pilih}
        title="Isi otomatis dari EPBB"
      />
    </div>
  );
}

/** Posisi pertanyaan di halaman isi data. */
const POSISI = [
  { kunci: "", label: "Penuh" },
  { kunci: "kiri", label: "Kolom kiri" },
  { kunci: "kanan", label: "Kolom kanan" },
];

function PilihPosisi({ q, onPatch }) {
  return (
    <div className="fk-posisi" role="radiogroup" aria-label="Posisi di halaman isi data">
      {POSISI.map((p) => (
        <button
          type="button"
          key={p.kunci || "penuh"}
          role="radio"
          aria-checked={(q.kolom || "") === p.kunci}
          className={(q.kolom || "") === p.kunci ? "is-on" : ""}
          onClick={() => onPatch({ kolom: p.kunci })}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function QuestionCard({ q, idx, total, gripProps, onPatch, onRemove, onMove, adaNop }) {
  const setOpsi = (i, val) => onPatch({ opsi: q.opsi.map((o, j) => (j === i ? val : o)) });
  const tambahOpsi = () => onPatch({ opsi: [...q.opsi, `Opsi ${q.opsi.length + 1}`] });
  const hapusOpsi = (i) => onPatch({ opsi: q.opsi.filter((_, j) => j !== i) });

  return (
    <section className="fk-q">
      <div className="fk-q-side">
        <span className="fk-q-num">{idx + 1}</span>
        {total > 1 && (
          <button {...gripProps}>
            <IkonSeret />
          </button>
        )}
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

        <input
          className="fk-input fk-q-ket-input"
          value={q.keterangan || ""}
          maxLength={500}
          placeholder="Keterangan / Petunjuk Pengisian (Opsional)"
          onChange={(e) => onPatch({ keterangan: e.target.value })}
          aria-label="Keterangan pertanyaan"
        />

        {adaNop && <PilihIsiEpbb q={q} onPatch={onPatch} />}

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

        {q.tipe === "rtrw" && (
          <p className="fk-hint">
            Dua kolom angka, RT dan RW, masing-masing tepat 3 digit. Angka pendek dilengkapi nol di
            depan secara otomatis (7 menjadi 007), dan isian yang belum 3 digit ditolak saat disimpan.
          </p>
        )}

        {q.tipe === "luas" && (
          <p className="fk-hint">
            Dua kolom angka bersanding, Luas Tanah dan Luas Bangunan, dalam m². Koma untuk desimal
            (250,5). Bila wajib, keduanya harus diisi — tanah kosong cukup diisi 0 pada luas bangunan.
            Di ekspor dipecah menjadi dua kolom angka yang bisa dijumlah.
          </p>
        )}

        {q.tipe === "nik" && (
          <p className="fk-hint">
            Nomor Induk Kependudukan, tepat 16 digit sesuai KTP-el. Hanya angka yang bisa diketik,
            dan jumlah digitnya diperiksa saat data disimpan.
          </p>
        )}

        {q.tipe === "npwp" && (
          <p className="fk-hint">
            Nomor Pokok Wajib Pajak, 15 sampai 17 digit — 15 digit untuk format lama (ditampilkan
            00.000.000.0-000.000), 16 digit untuk NPWP baru yang memakai NIK, dan 17 digit untuk NITKU.
          </p>
        )}

        {q.tipe === "niknpwp" && (
          <p className="fk-hint">
            Kolom NIK (16 digit) dan NPWP (15–17 digit) bersanding dalam satu pertanyaan, bertumpuk di
            HP. Bila ditandai wajib, petugas cukup mengisi salah satunya — badan usaha tanpa NIK atau
            perorangan yang belum punya NPWP. Tersimpan sebagai satu jawaban berisi NIK dan NPWP, dan
            di ekspor menjadi dua kolom terpisah.
          </p>
        )}

        {q.tipe === "telepon" && (
          <p className="fk-hint">
            Petugas mengisi satu atau lebih baris “Keterangan – Nomor”, mis. Pemilik – 081234567890, dan
            menambah baris lewat <b>+ Tambah nomor</b> (maks. 10). Nomor 8–15 digit, boleh diawali +.
            Di ekspor ditulis dalam satu kolom: Pemilik - 081234567890; Kantor - 05114777123.
          </p>
        )}

        {q.tipe === "nop" && (
          <p className="fk-hint">
            Nomor Objek Pajak PBB, tepat 18 digit. Dikelompokkan otomatis sambil diketik mengikuti
            susunan resminya — provinsi 2, kabupaten/kota 2, kecamatan 3, kelurahan 3, blok 3,
            nomor urut objek 4, kode khusus 1 — sehingga tampil sebagai 63.72.010.001.002-0123.0.
          </p>
        )}

        {q.tipe === "lokasi" && (
          <p className="fk-hint">
            Petugas menekan <b>Ambil lokasi</b>; GPS diamati beberapa detik dan hanya pembacaan paling
            akurat yang disimpan (berhenti sendiri pada ±10 m). Tersimpan sebagai koordinat, akurasi
            dalam meter, ketinggian, dan waktu pengambilan. Membutuhkan HTTPS serta izin lokasi di HP.
            Petugas juga bisa menekan <b>Pilih di peta</b> lalu mengetuk titik atau menggeser penanda
            (peta jalan atau satelit, butuh koneksi internet).
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
          <PilihPosisi q={q} onPatch={onPatch} />
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
  const { konfirmasi } = useDialog();
  const [list, setList] = useState([]);
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [error, setError] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [menyusun, setMenyusun] = useState(false);
  const [mengimpor, setMengimpor] = useState(false);
  const [hasilImpor, setHasilImpor] = useState(null);
  const berkasRef = useRef(null);

  // Konfirmasi bila meninggalkan halaman saat susunan formulir belum disimpan.
  useEffect(
    () => (dirty ? pasangPenjaga(() => true) : undefined),
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
        { id: null, tipe, label: "", keterangan: "", wajib: false, rangeHarga: false, isiEpbb: "", kolom: "", opsi: defaultOptions(tipe) },
      ],
    }));
    setDirty(true);
  };

  const hapusQ = (qi) => {
    setDraft((d) => ({ ...d, pertanyaan: d.pertanyaan.filter((_, i) => i !== qi) }));
    setDirty(true);
  };

  /** Pindahkan pertanyaan ke posisi lain — dipakai seret maupun tombol panah. */
  const pindahQ = useCallback((dari, ke) => {
    setDraft((d) => {
      if (!d || ke < 0 || ke >= d.pertanyaan.length || dari === ke) return d;
      return { ...d, pertanyaan: pindahkan(d.pertanyaan, dari, ke) };
    });
    setDirty(true);
  }, []);

  const seretQ = useDragUrut(pindahQ);

  /**
   * Susun ulang bank formulir. Daftar digeser dulu di layar lalu dikirim ke
   * server; bila gagal, susunan dikembalikan seperti semula.
   */
  const pindahFormulir = useCallback(
    (dari, ke) => {
      if (ke < 0 || ke >= list.length || dari === ke) return;
      const sebelum = list;
      const baru = pindahkan(list, dari, ke);
      setList(baru);
      setMenyusun(true);
      api
        .urutkanFormulir(baru.map((f) => f.id))
        .then(() => toast("Urutan formulir disimpan."))
        .catch((e) => {
          setList(sebelum);
          if (e.status === 401) onAuthChanged();
          toast(e.message, true);
        })
        .finally(() => setMenyusun(false));
    },
    [list, toast, onAuthChanged]
  );

  const seretFormulir = useDragUrut(pindahFormulir);

  /* ---- aksi server ---- */

  const gantiFormulir = async (id) => {
    if (id === selId) return;
    if (dirty) {
      const ya = await konfirmasi({
        judul: "Tinggalkan formulir ini?",
        pesan: "Ada perubahan yang belum disimpan. Perubahan itu akan hilang.",
        ya: "Tinggalkan",
        tidak: "Tetap di sini",
        bahaya: true,
      });
      if (!ya) return;
    }
    setSelId(id);
  };

  const formulirBaru = async () => {
    if (dirty) {
      const ya = await konfirmasi({
        judul: "Buat formulir baru?",
        pesan: "Ada perubahan yang belum disimpan pada formulir ini. Perubahan itu akan hilang.",
        ya: "Buat baru",
        bahaya: true,
      });
      if (!ya) return;
    }
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
        ikon: draft.ikon || "",
        judulKolomKiri: (draft.judulKolomKiri || "").trim(),
        judulKolomKanan: (draft.judulKolomKanan || "").trim(),
        pertanyaan: draft.pertanyaan.map((q) => ({
          id: q.id ?? undefined,
          tipe: q.tipe,
          label: q.label,
          keterangan: q.keterangan || "",
          wajib: q.wajib,
          rangeHarga: q.rangeHarga,
          isiEpbb: q.isiEpbb || "",
          kolom: q.kolom || "",
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
    const ya = await konfirmasi({
      judul: `Hapus formulir "${f.judul}"?`,
      pesan: "Seluruh pertanyaan dan opsinya ikut terhapus.",
      ya: "Hapus",
      bahaya: true,
    });
    if (!ya) return;
    try {
      await api.deleteFormulir(f.id);
      await muatList();
      toast("Formulir dihapus.");
    } catch (e) {
      if (e.status === 409) {
        const tetapHapus = await konfirmasi({
          judul: "Formulir ini sudah diisi",
          pesan: `${e.message} Lanjut hapus beserta seluruh datanya?`,
          ya: "Hapus semua",
          bahaya: true,
        });
        if (!tetapHapus) return;
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

  /* ---- impor & ekspor bank formulir ---- */

  const unduhBank = () =>
    api.unduhBankFormulir().catch((e) => {
      if (e.status === 401) onAuthChanged();
      toast(e.message, true);
    });

  const imporBerkas = async (e) => {
    const file = e.target.files?.[0];
    // Kosongkan nilainya agar memilih berkas yang SAMA dua kali tetap memicu onChange.
    e.target.value = "";
    if (!file) return;

    setMengimpor(true);
    setHasilImpor(null);
    try {
      const hasil = await api.imporBankFormulir(file);
      setHasilImpor(hasil);
      if (hasil.ditambahkan > 0) {
        await muatList();
        toast(`${hasil.ditambahkan} formulir ditambahkan.`);
      } else {
        toast("Tidak ada formulir baru yang ditambahkan.", true);
      }
    } catch (err) {
      if (err.status === 401) onAuthChanged();
      toast(err.message, true);
    } finally {
      setMengimpor(false);
    }
  };

  /* ---- render ---- */

  if (!admin) return <LoginAdmin onLoggedIn={onAuthChanged} sub="Penyusunan Bank Formulir Hanya Untuk Admin." />;

  return (
    <>
      <PageHead title="Bank Formulir" sub="Formulir yang dipakai saat menyusun kertas kerja.">
        {dirty && <span className="fk-dirty">Belum disimpan</span>}
      </PageHead>

      {error && <ErrorBox onRetry={() => muatList()}>{error}</ErrorBox>}

      <Panel
        title="Impor & Ekspor"
        sub="Pindahkan susunan formulir antar server, mis. dari server uji ke produksi."
      >
        <div className="fk-impor-aksi">
          <button type="button" className="fk-btn-ghost" onClick={unduhBank} disabled={list.length === 0}>
            Unduh bank formulir
          </button>
          <span className="fk-impor-pisah" aria-hidden="true" />
          <button type="button" className="fk-btn" onClick={() => berkasRef.current?.click()} disabled={mengimpor}>
            {mengimpor ? "Mengimpor..." : "Impor dari berkas"}
          </button>
          <input ref={berkasRef} type="file" accept=".json,application/json" onChange={imporBerkas} hidden />
        </div>

        <p className="fk-hint">
          Berkas <strong>.json</strong> berisi judul, pertanyaan, dan opsi setiap formulir — tanpa data
          isian. Formulir hasil impor ditambahkan di akhir daftar. Formulir yang judulnya sudah ada
          dilewati dan tidak diubah, jadi berkas yang sama aman diimpor ulang.
        </p>

        <HasilImpor
          hasil={hasilImpor}
          onTutup={() => setHasilImpor(null)}
          satuan="formulir"
          labelLewati="judulnya sudah ada"
          penanda={(m) => `Formulir ${m.baris}`}
        />
      </Panel>

      <Panel>
        {loadingList ? (
          <Loading label="Memuat formulir..." />
        ) : (
          <>
            {list.length > 1 && (
              <p className="fk-susun-cap">
                Seret <IkonSeret /> untuk mengatur urutan formulir — urutan ini yang dipakai di
                kertas kerja dan file CSV.
                {menyusun && <span className="fk-susun-simpan">Menyimpan urutan...</span>}
              </p>
            )}
            <div className="fk-lib-list" ref={seretFormulir.wadahRef}>
              {list.map((f, i) => (
                <div key={f.id} {...seretFormulir.itemProps(i)}>
                  <div
                    className={"fk-lib-row" + (f.id === selId ? " is-sel" : "")}
                    onClick={() => gantiFormulir(f.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) =>
                      e.target === e.currentTarget &&
                      (e.key === "Enter" || e.key === " ") &&
                      gantiFormulir(f.id)
                    }
                  >
                    {list.length > 1 && (
                      <button
                        {...seretFormulir.gripProps(i, f.judul || "formulir")}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IkonSeret />
                      </button>
                    )}
                    <span className="fk-baris-ikon fk-lib-ikon">
                      <IkonFormulir ikon={f.ikon} cadangan={i + 1} size={16} />
                    </span>
                    <div className="fk-lib-main">
                      <div className="fk-lib-title">{f.judul || "Tanpa judul"}</div>
                      <div className="fk-lib-sub">
                        {f.jumlahPertanyaan} pertanyaan
                        {f.jumlahData > 0 && ` · ${f.jumlahData} data terisi`}
                      </div>
                    </div>
                    {f.jumlahData > 0 && (
                      // Seluruh data formulir ini dari semua kertas kerja.
                      <span className="fk-lib-aksi" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="fk-mini"
                          onClick={() => api.unduhFormulir(f.id, "xlsx").catch((e) => toast(e.message, true))}
                          title={`Ekspor semua data ${f.judul} ke Excel`}
                        >
                          Excel
                        </button>
                        <button
                          type="button"
                          className="fk-mini"
                          onClick={() => api.unduhFormulir(f.id, "csv").catch((e) => toast(e.message, true))}
                          title={`Ekspor semua data ${f.judul} ke CSV`}
                        >
                          CSV
                        </button>
                      </span>
                    )}
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
                </div>
              ))}
              <button type="button" className="fk-add-btn" onClick={formulirBaru}>
                + Formulir baru
              </button>
            </div>
          </>
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

            <span className="fk-ikon-pilih-cap">
              Ikon di kartu formulir: <strong>{labelIkonFormulir(draft.ikon) || "Nomor urut"}</strong>
            </span>
            <div className="fk-ikon-pilih" role="radiogroup" aria-label="Ikon formulir">
              <button
                type="button"
                role="radio"
                aria-checked={!draft.ikon}
                className={"fk-ikon-opsi" + (!draft.ikon ? " is-on" : "")}
                onClick={() => patchDraft({ ikon: "" })}
                title="Nomor urut"
              >
                1
              </button>
              {DAFTAR_IKON_FORMULIR.map((ik) => (
                <button
                  type="button"
                  key={ik.key}
                  role="radio"
                  aria-checked={draft.ikon === ik.key}
                  aria-label={ik.label}
                  className={"fk-ikon-opsi" + (draft.ikon === ik.key ? " is-on" : "")}
                  onClick={() => patchDraft({ ikon: ik.key })}
                  title={ik.label}
                >
                  <ik.Ikon size={20} strokeWidth={1.8} aria-hidden="true" />
                </button>
              ))}
            </div>

            <span className="fk-ikon-pilih-cap">
              Tata letak halaman isi data: atur <strong>Kolom kiri / Kolom kanan</strong> di tiap pertanyaan
              supaya bersanding (mis. Subjek Pajak di kiri, Objek Pajak di kanan). Di HP kolom kiri tampil
              lebih dulu, lalu kolom kanan.
            </span>
            {draft.pertanyaan.some((q) => q.kolom) && (
              <div className="fk-judul-kolom">
                <label>
                  <span className="fk-opts-cap">Judul kolom kiri</span>
                  <input
                    className="fk-input"
                    value={draft.judulKolomKiri || ""}
                    maxLength={100}
                    placeholder="mis. Subjek Pajak (opsional)"
                    onChange={(e) => patchDraft({ judulKolomKiri: e.target.value })}
                  />
                </label>
                <label>
                  <span className="fk-opts-cap">Judul kolom kanan</span>
                  <input
                    className="fk-input"
                    value={draft.judulKolomKanan || ""}
                    maxLength={100}
                    placeholder="mis. Objek Pajak (opsional)"
                    onChange={(e) => patchDraft({ judulKolomKanan: e.target.value })}
                  />
                </label>
              </div>
            )}
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

          {draft.pertanyaan.length > 1 && (
            <p className="fk-susun-cap">
              Seret <IkonSeret /> untuk memindahkan pertanyaan, atau pakai tombol ▲ ▼.
            </p>
          )}

          <div className="fk-q-list" ref={seretQ.wadahRef}>
            {draft.pertanyaan.map((q, i) => (
              <div key={q.id ?? `baru-${i}`} {...seretQ.itemProps(i)}>
                <QuestionCard
                  q={q}
                  idx={i}
                  total={draft.pertanyaan.length}
                  gripProps={seretQ.gripProps(i, q.label || `pertanyaan ${i + 1}`)}
                  onPatch={(p) => patchQ(i, p)}
                  onRemove={() => hapusQ(i)}
                  onMove={(arah) => pindahQ(i, i + arah)}
                  adaNop={draft.pertanyaan.some((x) => x.tipe === "nop")}
                />
              </div>
            ))}
          </div>

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

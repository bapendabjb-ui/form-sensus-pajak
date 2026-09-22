/* Layar isi & ubah satu data lewat formulir, berikut draf otomatisnya. */

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../../api.js";
import { useToast } from "../../components/Toast.jsx";
import { useDialog } from "../../components/Dialog.jsx";
import { Loading, ErrorBox, KunciAdmin } from "../../components/Ui.jsx";
import FieldInput from "../../components/Fields.jsx";
import { fromApi, emptyValue, buildPayload, validateRequired, statusFoto, isFilled } from "../../lib/answers.js";
import { nilaiDariEpbb } from "../../lib/epbb.js";
import { judulEntri } from "../../lib/ringkas.js";
import { IkonEpbb, CheckIcon } from "../../components/Icons.jsx";
import { useAdmin } from "../../lib/admin.js";
import { mulaiRekamPosisi, ambilRekamPosisi } from "../../lib/rekamPosisi.js";
import { bersihkanDrafLama } from "../../lib/konfigurasi.js";
import { kembali, pasangPenjaga } from "../../lib/router.js";
import { urlKk } from "./bersama.js";

const UMUR_FOTO_DRAF_MS = 20 * 3600 * 1000; // unggahan yang tak disimpan dibersihkan server setelah 24 jam
const BERKAS_LENGKAP = { berkasLengkap: true, catatanBerkas: "" };

/** Salin jawaban untuk disimpan sebagai draf: foto hanya yang sudah terunggah. */
/**
 * Susunan tampil halaman isi data. Pertanyaan berposisi kiri/kanan yang berurutan
 * dikumpulkan menjadi satu blok dua kolom; pertanyaan lebar penuh memutus blok.
 * @returns {Array<{ penuh: object } | { kiri: object[], kanan: object[] }>}
 */
function susunTataLetak(pertanyaan) {
  const blok = [];
  for (const q of pertanyaan) {
    if (q.kolom !== "kiri" && q.kolom !== "kanan") {
      blok.push({ penuh: q });
      continue;
    }
    let akhir = blok[blok.length - 1];
    if (!akhir || akhir.penuh) {
      akhir = { kiri: [], kanan: [] };
      blok.push(akhir);
    }
    akhir[q.kolom].push(q);
  }
  return blok;
}

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
  // { [pertanyaanId]: true } untuk isian yang masih asli dari EPBB; hilang begitu petugas mengubahnya.
  const [dariEpbb, setDariEpbb] = useState({});
  const [berkas, setBerkasState] = useState(BERKAS_LENGKAP);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menyimpan, setMenyimpan] = useState(null); // "simpan" | "lagi" | null
  const [draf, setDraf] = useState(null); // draf tersimpan yang belum dipulihkan
  const wadah = useRef(null);
  const berubah = useRef(false);
  // Perekaman posisi otomatis untuk peta cakupan. Dimulai begitu layar dibuka
  // supaya GPS sempat mengunci sebelum petugas menekan Simpan; hasilnya tidak
  // pernah ditampilkan di sini, dan server hanya membukanya untuk admin.
  const posisi = useRef(null);

  const urlKembali = urlKk(kkId);
  const kunciDraf = entriId ? `sensus-pajak:draf:data-${entriId}` : `sensus-pajak:draf:kk${kkId}-f${formulirId}`;

  useEffect(() => {
    posisi.current = mulaiRekamPosisi();
  }, []);

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
    setDariEpbb({});
    setBerkasState(BERKAS_LENGKAP);
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
          setDariEpbb(Object.fromEntries((e.dariEpbb || []).map((qid) => [qid, true])));
          setBerkasState({ berkasLengkap: e.berkasLengkap !== false, catatanBerkas: e.catatanBerkas || "" });
        } else {
          const [form, kk] = await Promise.all([api.getFormulir(formulirId), api.getKertasKerja(kkId)]);
          if (batal) return;
          f = form;
          setNomor(kk.nomor);
          kosongkan(form);
        }
        setFormulir(f);

        await bersihkanDrafLama();
        if (batal) return;
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
          JSON.stringify({
            waktu: Date.now(),
            answers: jawabanUntukDraf(formulir.pertanyaan, answers),
            dariEpbb,
            berkas,
          })
        );
      } catch {
        /* penyimpanan penuh / tidak tersedia */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [answers, dariEpbb, berkas, formulir, draf, kunciDraf]);

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
    setDariEpbb(draf.dariEpbb && typeof draf.dariEpbb === "object" ? draf.dariEpbb : {});
    if (draf.berkas && typeof draf.berkas.berkasLengkap === "boolean") {
      setBerkasState({ berkasLengkap: draf.berkas.berkasLengkap, catatanBerkas: String(draf.berkas.catatanBerkas || "") });
    }
    berubah.current = true;
    setDraf(null);
    toast(fotoKedaluwarsa ? "Draf dipulihkan. Foto pada draf lama perlu diambil ulang." : "Isian draf dipulihkan.");
  };

  const buangDraf = () => {
    hapusDraf();
    setDraf(null);
  };

  // Mendukung nilai langsung maupun fungsi updater (dipakai unggahan foto).
  // Isian yang diubah petugas bukan lagi data asli EPBB, jadi penandanya dilepas.
  const setAnswer = (qid, v, { epbb = false } = {}) => {
    berubah.current = true;
    setAnswers((a) => ({ ...a, [qid]: typeof v === "function" ? v(a[qid]) : v }));
    setDariEpbb((d) => {
      if (Boolean(d[qid]) === epbb) return d;
      const next = { ...d };
      if (epbb) next[qid] = true;
      else delete next[qid];
      return next;
    });
    setErrors((e) => {
      if (!e[qid]) return e;
      const next = { ...e };
      delete next[qid];
      return next;
    });
  };

  const setBerkas = (ubah) => {
    berubah.current = true;
    setBerkasState((b) => ({ ...b, ...ubah }));
  };

  // Pertanyaan yang diatur admin untuk diisi dari hasil cek NOP (EPBB).
  const targetEpbb = (formulir?.pertanyaan || [])
    .filter((q) => q.isiEpbb)
    .map((q) => ({ id: q.id, label: q.label || "(Pertanyaan Tanpa Judul)", terisi: isFilled(q.tipe, answers[q.id]) }));

  /** Isi pertanyaan bersumber EPBB dari data cek NOP. Mengembalikan jumlah kolom yang terisi. */
  const terapkanEpbb = async (data) => {
    const sumberWilayah = formulir.pertanyaan.some((q) => q.isiEpbb === "wilayah_op" || q.isiEpbb === "wilayah_sp");
    const wilayah = sumberWilayah ? await api.getWilayah().catch(() => []) : [];
    let jumlah = 0;
    for (const q of formulir.pertanyaan) {
      if (!q.isiEpbb) continue;
      const v = nilaiDariEpbb(q.isiEpbb, data, wilayah);
      if (v === undefined) continue;
      setAnswer(q.id, v, { epbb: true });
      jumlah += 1;
    }
    return jumlah;
  };

  const isiEpbb = targetEpbb.length ? { target: targetEpbb, terapkan: terapkanEpbb } : null;

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
      const idDariEpbb = pertanyaan.filter((q) => dariEpbb[q.id]).map((q) => q.id);
      // null bila izin ditolak / GPS gagal / belum mengunci - penyimpanan jalan terus.
      const rekam = await ambilRekamPosisi(posisi.current);
      const hasil = entriId
        ? await api.updateEntri(entriId, payload, idDariEpbb, berkas, rekam)
        : await api.createEntri(kkId, formulirId, payload, idDariEpbb, berkas, rekam);
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
  const tataLetak = susunTataLetak(formulir.pertanyaan);
  const adaKolom = tataLetak.some((b) => !b.penuh);

  const kolomIsian = (q) => (
    <div className="fk-field" key={q.id} data-qid={q.id}>
      <label className="fk-q-name">
        {q.label || "(Pertanyaan Tanpa Judul)"}
        {q.wajib && <span className="fk-star">*</span>}
        {dariEpbb[q.id] && (
          <span className="fk-epbb-tag" title="Diisi otomatis dari data EPBB. Penanda hilang bila isinya diubah.">
            <IkonEpbb /> Data EPBB
          </span>
        )}
      </label>
      {q.keterangan && <p className="fk-q-ket">{q.keterangan}</p>}
      <FieldInput
        q={q}
        value={answers[q.id]}
        invalid={Boolean(errors[q.id])}
        onChange={(v) => setAnswer(q.id, v)}
        isiEpbb={q.tipe === "nop" ? isiEpbb : null}
      />
      {errors[q.id] && <span className="fk-err">{errors[q.id]}</span>}
    </div>
  );

  return (
    <div ref={wadah} className={"fk-fill" + (adaKolom ? " is-dua-kolom" : "")}>
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
        {tataLetak.map((b, i) =>
          b.penuh ? (
            kolomIsian(b.penuh)
          ) : (
            <div className="fk-dua-kolom" key={`blok-${i}`}>
              {[
                ["kiri", formulir.judulKolomKiri],
                ["kanan", formulir.judulKolomKanan],
              ].map(([sisi, judul]) => (
                <div className={`fk-kolom fk-kolom-${sisi}`} key={sisi}>
                  {judul && <h3 className="fk-kolom-judul">{judul}</h3>}
                  {b[sisi].map(kolomIsian)}
                </div>
              ))}
            </div>
          )
        )}
      </section>

      <section className={"fk-section fk-berkas" + (berkas.berkasLengkap ? "" : " is-kurang")}>
        <div className="fk-field">
          <span className="fk-q-name">Kelengkapan berkas</span>
          <p className="fk-q-ket">
            Tandai bila dokumen pendukung belum lengkap, supaya data ini mudah dicari
            "Berkas tidak lengkap".
          </p>
          <button
            type="button"
            role="checkbox"
            aria-checked={!berkas.berkasLengkap}
            className={"fk-choice" + (berkas.berkasLengkap ? "" : " is-on")}
            onClick={() => setBerkas({ berkasLengkap: !berkas.berkasLengkap })}
          >
            <span className="fk-ind fk-ind-check">{!berkas.berkasLengkap && <CheckIcon />}</span>
            <span>Berkas tidak lengkap</span>
          </button>
          {!berkas.berkasLengkap && (
            <textarea
              className="fk-input fk-textarea fk-berkas-catatan"
              placeholder="Apa yang masih kurang? Mis. fotokopi KTP, SPPT tahun lalu"
              maxLength={500}
              value={berkas.catatanBerkas}
              onChange={(e) => setBerkas({ catatanBerkas: e.target.value })}
              aria-label="Catatan kekurangan berkas"
            />
          )}
        </div>
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

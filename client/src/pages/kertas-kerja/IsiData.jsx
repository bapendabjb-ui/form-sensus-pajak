/*
 * Layar isi & ubah satu data lewat formulir, berikut draf otomatisnya.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../../api.js";
import { useToast } from "../../components/Toast.jsx";
import { useDialog } from "../../components/Dialog.jsx";
import { Loading, ErrorBox } from "../../components/Ui.jsx";
import FieldInput from "../../components/Fields.jsx";
import { PitaPengajuan, AjukanHapus } from "../../components/PengajuanHapus.jsx";
import {
  fromApi,
  emptyValue,
  buildPayload,
  validateRequired,
  wajibBerlaku,
  statusFoto,
  isFilled,
} from "../../lib/answers.js";
import { nilaiDariEpbb } from "../../lib/epbb.js";
import { judulEntri } from "../../lib/ringkas.js";
import { IkonEpbb, CheckIcon } from "../../components/Icons.jsx";
import { useAdmin } from "../../lib/admin.js";
import { pantauPosisi, ambilPosisi } from "../../lib/rekamPosisi.js";
import { nilaiTitik } from "../../lib/cekLokasi.js";
import { TombolDicek, namaAdmin } from "../../components/LokasiObjek.jsx";
import PersilDiTitik from "../../components/PersilDiTitik.jsx";
import { formatWaktu, urlPeta, formatNop } from "../../lib/format.js";
import { bersihkanDrafLama, useKonfigurasi } from "../../lib/konfigurasi.js";
import { kembali, pasangPenjaga } from "../../lib/router.js";
import { bacaTitipan, hapusTitipan } from "../../lib/titipanBidang.js";
import { nibLengkap } from "../../lib/nib.js";
import { urlKk, susunTataLetak } from "./bersama.js";

const UMUR_FOTO_DRAF_MS = 20 * 3600 * 1000; // unggahan yang tak disimpan dibersihkan server setelah 24 jam
const BERKAS_LENGKAP = { berkasLengkap: true, catatanBerkas: "" };
const PESAN_HAPUS = "Data beserta fotonya dihapus dari kertas kerja. Tindakan ini tidak dapat dibatalkan.";

/** Jawaban pertanyaan Lokasi pertama yang terisi - koordinat objek lain, mis. rumah kedua PBB-P2. */
function titikDariFormulir(pertanyaan, answers) {
  for (const q of pertanyaan) {
    const v = answers[q.id];
    if (q.tipe === "lokasi" && v && typeof v.lat === "number" && typeof v.lon === "number") return v;
  }
  return null;
}

/**
 * Konfirmasi saat data baru akan tersimpan dengan koordinat pertanyaan Lokasi
 * yang perlu diperiksa: diambil dengan GPS di kantor, atau kurang akurat.
 */
function dialogLokasi(nilai, titik, aturan) {
  const kantor = aturan?.kantor?.nama || "kantor";
  return {
    judul: nilai === "kantor" ? `Koordinat diambil di area ${kantor}` : `Koordinat kurang akurat (±${Math.round(titik.akurasi)} m)`,
    pesan:
      "Koordinat di pertanyaan Lokasi diambil dengan GPS di tempat Anda berada sekarang, bukan di objeknya. " +
      "Tekan Kembali lalu Pilih di peta, atau tempel koordinatnya dari Google Maps.",
    ya: "Tetap simpan",
    tidak: "Kembali",
  };
}

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
  // Hanya saat mengubah data: tim kertas kerja (nama pengaju) dan pengajuan hapus terakhirnya.
  const [tim, setTim] = useState([]);
  const [pengajuan, setPengajuan] = useState(null);
  const [answers, setAnswers] = useState({});
  // { [pertanyaanId]: true } untuk isian yang masih asli dari EPBB; hilang begitu petugas mengubahnya.
  const [dariEpbb, setDariEpbb] = useState({});
  const [berkas, setBerkasState] = useState(BERKAS_LENGKAP);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menyimpan, setMenyimpan] = useState(null); // "simpan" | "lagi" | null
  const [draf, setDraf] = useState(null); // draf tersimpan yang belum dipulihkan
  // Mengubah data: koordinat objeknya sudah dicek admin? { oleh, waktu } | null.
  // Bila ya, petugas hanya bisa melihatnya; server juga menolak perubahannya.
  const [koordinatDicek, setKoordinatDicek] = useState(null);
  const wadah = useRef(null);
  const berubah = useRef(false);
  const aturanLokasi = useKonfigurasi().lokasi || null;
  // Posisi perangkat untuk data BARU, direkam diam-diam saat Simpan sebagai
  // bukti kunjungan (tidak ditampilkan). Dipantau sejak layar dibuka supaya
  // GPS sempat mengunci. Mengubah data tidak merekam posisi.
  const gpsRef = useRef({ status: "mencari", posisi: null, galat: "" });
  // NOP yang dititipkan dari peta ke formulir baru ini: kolom bersumber EPBB ikut diisi.
  const [nopTitipan, setNopTitipan] = useState(null);

  const urlKembali = urlKk(kkId);
  const kunciDraf = entriId ? `sensus-pajak:draf:data-${entriId}` : `sensus-pajak:draf:kk${kkId}-f${formulirId}`;

  useEffect(() => {
    if (entriId) return undefined;
    return pantauPosisi((k) => {
      gpsRef.current = k;
    });
  }, [entriId]);

  const hapusDraf = useCallback(() => {
    try {
      localStorage.removeItem(kunciDraf);
    } catch {
      /* penyimpanan perangkat tidak tersedia */
    }
  }, [kunciDraf]);

  // Bidang yang dititipkan dari tab NOP di Peta Sensus (lib/titipanBidang.js): diisikan ke
  // formulir baru pertama yang punya pertanyaan Bidang Tanah BPN, beserta NOP-nya bila ada.
  const pakaiTitipan = useCallback(
    (f) => {
      const t = bacaTitipan();
      const qNib = t && f.pertanyaan.find((q) => q.tipe === "nib");
      if (!qNib) return;
      const qNop = t.nop ? f.pertanyaan.find((q) => q.tipe === "nop") : null;
      setAnswers((a) => ({
        ...a,
        [qNib.id]: { bidang: [t.bidang], status: "" },
        ...(qNop ? { [qNop.id]: t.nop } : {}),
      }));
      hapusTitipan();
      berubah.current = true;
      if (qNop) setNopTitipan(t.nop);
      toast(`Bidang NIB ${nibLengkap(t.bidang.kode, t.bidang.nib)}${qNop ? " dan NOP-nya" : ""} sudah terisi dari peta.`);
    },
    [toast]
  );

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
          setTim(e.kertasKerja.petugas || []);
          setPengajuan(e.pengajuanHapus || null);
          setKoordinatDicek(e.lokasi?.dicek || null);
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
          pakaiTitipan(form);
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
  }, [entriId, formulirId, kkId, kosongkan, kunciDraf, pakaiTitipan]);

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
    // Formulir yang membolehkan simpan dengan berkas tidak lengkap: tanda merah
    // "wajib diisi" yang kini tidak berlaku lagi ikut hilang.
    if (ubah.berkasLengkap === false && formulir?.simpanBerkasKurang) {
      setErrors((e) => {
        const sisa = {};
        for (const q of formulir.pertanyaan) {
          if (e[q.id] && (q.tipe === "lokasi" || !q.wajib || isFilled(q.tipe, answers[q.id]))) sisa[q.id] = e[q.id];
        }
        return sisa;
      });
    }
  };

  // Data boleh disimpan tanpa isian wajib? Hanya formulir yang mengizinkannya
  // dan hanya bila ditandai berkas tidak lengkap; koordinat tetap wajib.
  const longgar = Boolean(formulir?.simpanBerkasKurang) && !berkas.berkasLengkap;

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

  // Formulir baru dari titipan peta dengan NOP: isi kolom bersumber EPBB (nama WP, alamat,
  // luas) sekaligus - formulirnya baru, jadi tidak ada isian petugas yang tertimpa. Bila cek
  // NOP EPBB tidak aktif atau NOP-nya belum ada di EPBB, petugas mengisinya sendiri.
  const terapkanRef = useRef(terapkanEpbb);
  terapkanRef.current = terapkanEpbb;
  useEffect(() => {
    if (!nopTitipan || !formulir) return undefined;
    if (!formulir.pertanyaan.some((q) => q.isiEpbb)) {
      setNopTitipan(null);
      return undefined;
    }
    let batal = false;
    api
      .cekNop(nopTitipan)
      .then(async (d) => {
        if (batal) return;
        const n = await terapkanRef.current(d);
        if (!batal && n > 0) toast(`${n} kolom diisi dari data EPBB NOP ${formatNop(nopTitipan)}.`);
      })
      .catch(() => {})
      .finally(() => !batal && setNopTitipan(null));
    return () => {
      batal = true;
    };
  }, [nopTitipan, formulir, toast]);

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

    const errs = validateRequired(pertanyaan, answers, { longgar });
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast("Periksa kolom yang ditandai merah.", true);
      fokusError(errs);
      return;
    }

    setMenyimpan(lanjut ? "lagi" : "simpan");

    // Data baru: minta konfirmasi bila koordinat pertanyaan Lokasi diambil
    // dengan GPS di kantor / kurang akurat. Tidak memblokir: GPS bisa gagal
    // karena alasan yang wajar. Posisi HP direkam apa adanya, tanpa ditanyakan.
    let rekam = null;
    if (!entriId) {
      const dariForm = titikDariFormulir(pertanyaan, answers);
      const nilaiForm = dariForm
        ? nilaiTitik({ ...dariForm, manual: dariForm.sumber === "peta" || dariForm.sumber === "bidang" }, aturanLokasi)
        : "baik";
      if (nilaiForm !== "baik") {
        setMenyimpan(null);
        if (!(await konfirmasi(dialogLokasi(nilaiForm, dariForm, aturanLokasi)))) return;
        setMenyimpan(lanjut ? "lagi" : "simpan");
      }
      rekam = await ambilPosisi(() => gpsRef.current);
    }

    try {
      const payload = buildPayload(pertanyaan, answers);
      const idDariEpbb = pertanyaan.filter((q) => dariEpbb[q.id]).map((q) => q.id);
      const hasil = entriId
        ? await api.updateEntri(entriId, payload, idDariEpbb, berkas)
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

  const sudahDihapus = () => {
    berubah.current = false;
    hapusDraf();
    toast("Data dihapus.");
    kembali(urlKembali);
  };

  const hapus = async () => {
    const ya = await konfirmasi({ judul: "Hapus data ini?", pesan: PESAN_HAPUS, ya: "Hapus", bahaya: true });
    if (!ya) return;
    try {
      await api.deleteEntri(entriId);
      sudahDihapus();
    } catch (e) {
      toast(e.message, true);
    }
  };

  const tombolKembali = (
    <button type="button" className="fk-textbtn hanya-desktop" onClick={() => kembali(urlKembali)}>
      {`‹ Kembali ke kertas kerja${nomor ? ` ${nomor}` : ""}`}
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

  const koordinatTerkunci = Boolean(entriId && koordinatDicek && !admin);

  const ubahKoordinatDicek = async () => {
    const hasil = await api.setKoordinatDicek(entriId, !koordinatDicek);
    setKoordinatDicek(hasil.lokasi.dicek);
    toast(hasil.lokasi.dicek ? "Koordinat objek ditandai sudah dicek dan dikunci." : "Kunci koordinat objek dibuka.");
  };

  /** Pertanyaan Lokasi yang terkunci: petugas hanya melihat titiknya. */
  const koordinatBaca = (v) => {
    const ada = v && typeof v.lat === "number";
    return (
      <div className="fk-koordinat-kunci">
        <span>{ada ? `${v.lat.toFixed(6)}, ${v.lon.toFixed(6)}` : "Belum diisi"}</span>
        {ada && (
          <a className="fk-lokasi-peta" href={urlPeta(v)} target="_blank" rel="noreferrer">
            Buka di Google Maps
          </a>
        )}
        <span className="fk-dicek-ket">
          ✓ Sudah dicek {namaAdmin(koordinatDicek.oleh)}, {formatWaktu(koordinatDicek.waktu)}. Hanya admin yang bisa
          mengubahnya.
        </span>
      </div>
    );
  };

  // Pertanyaan Bidang Tanah BPN: data yang sedang dibuka (tidak ikut disebut di
  // peringatan bidang ganda) dan titik Lokasi objeknya (usulan bidang, pusat peta).
  const titikNib = titikDariFormulir(formulir.pertanyaan, answers);
  const qNop = formulir.pertanyaan.find((q) => q.tipe === "nop");
  // Koordinat objek (pertanyaan Lokasi pertama) yang boleh diisi otomatis dari bidang NIB:
  // hanya bila masih kosong atau memang berasal dari bidang - titik GPS / pilihan petugas
  // di peta tidak ditimpa, begitu juga koordinat yang sudah dicek (dikunci) admin.
  const qLokasi = formulir.pertanyaan.find((q) => q.tipe === "lokasi");
  const nilaiLokasi = qLokasi ? answers[qLokasi.id] : null;
  const lokasiKosong = !nilaiLokasi || typeof nilaiLokasi.lat !== "number";
  const lokasiDariBidang = !lokasiKosong && nilaiLokasi.sumber === "bidang";
  const nopIni = qNop && /^\d{18}$/.test(answers[qNop.id] || "") ? answers[qNop.id] : "";
  const konteksNib = {
    entriId: entriId || null,
    titik: titikNib ? { lat: titikNib.lat, lon: titikNib.lon } : null,
    // NOP data ini: ditandai di daftar NOP tiap bidang.
    nop: nopIni,
    // Isian "NOP objek ini" di pertanyaan NIB = pertanyaan NOP PBB yang sama, lengkap dengan
    // cek / cari NOP EPBB dan "Isi ke Formulir". Tidak ada bila formulirnya tanpa pertanyaan NOP.
    nopObjek: qNop
      ? {
          value: answers[qNop.id] ?? "",
          onChange: (v) => setAnswer(qNop.id, v),
          isiEpbb,
          wajib: wajibBerlaku(qNop, longgar),
          invalid: Boolean(errors[qNop.id]),
        }
      : null,
    titikOtomatis:
      qLokasi && !koordinatDicek
        ? {
            boleh: lokasiKosong || lokasiDariBidang,
            dariBidang: lokasiDariBidang,
            atur: (t) =>
              setAnswer(qLokasi.id, { lat: t.lat, lon: t.lon, akurasi: null, ketinggian: null, waktu: new Date().toISOString(), sumber: "bidang" }),
            hapus: () => setAnswer(qLokasi.id, emptyValue("lokasi")),
          }
        : null,
  };

  const kolomIsian = (q) => (
    <div className="fk-field" key={q.id} data-qid={q.id}>
      <label className="fk-q-name">
        {q.label || "(Pertanyaan Tanpa Judul)"}
        {wajibBerlaku(q, longgar) && <span className="fk-star">*</span>}
        {dariEpbb[q.id] && (
          <span className="fk-epbb-tag" title="Diisi otomatis dari data EPBB. Penanda hilang bila isinya diubah.">
            <IkonEpbb /> Data EPBB
          </span>
        )}
      </label>
      {q.keterangan && <p className="fk-q-ket">{q.keterangan}</p>}
      {q.tipe === "lokasi" && koordinatTerkunci ? (
        koordinatBaca(answers[q.id])
      ) : (
        <FieldInput
          q={q}
          value={answers[q.id]}
          invalid={Boolean(errors[q.id])}
          onChange={(v) => setAnswer(q.id, v)}
          isiEpbb={q.tipe === "nop" ? isiEpbb : null}
          konteks={q.tipe === "nib" ? konteksNib : undefined}
        />
      )}
      {errors[q.id] && <span className="fk-err">{errors[q.id]}</span>}
      {q.tipe === "lokasi" && typeof answers[q.id]?.lat === "number" && (
        <PersilDiTitik lat={answers[q.id].lat} lon={answers[q.id].lon} />
      )}
      {q.tipe === "lokasi" && entriId && admin && typeof answers[q.id]?.lat === "number" && (
        <TombolDicek dicek={koordinatDicek} onUbah={ubahKoordinatDicek} label="Koordinat objek sudah dicek" />
      )}
    </div>
  );

  return (
    <div ref={wadah} className={"fk-fill" + (adaKolom ? " is-dua-kolom" : "")}>
      {tombolKembali}

      {entriId && (
        <PitaPengajuan
          pengajuan={pengajuan}
          admin={admin}
          pesanHapus={PESAN_HAPUS}
          onDisetujui={sudahDihapus}
          onBerubah={setPengajuan}
        />
      )}

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
          {`Kertas kerja ${nomor} · ${entriId ? "ubah data" : "data baru"}`}
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
            {formulir.simpanBerkasKurang &&
              " Bila ditandai, data boleh disimpan walau isian wajib belum lengkap — kecuali koordinat."}
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
          <AjukanHapus jenis="entri" sasaranId={entriId} tim={tim} pengajuan={pengajuan} onTerkirim={setPengajuan} />
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

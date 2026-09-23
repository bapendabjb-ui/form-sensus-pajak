/*
 * Layar hasil setelah petugas menekan Simpan pada latihan.
 *
 * Isinya sengaja menampilkan seluruh jawaban apa adanya — termasuk yang
 * dikosongkan — supaya petugas bisa mencocokkan sendiri apa yang sudah dan
 * belum terisi sebelum turun ke lapangan, bukan sekadar diberi tanda "berhasil".
 */

import { formatNilai, judulEntri } from "../lib/ringkas.js";
import { CheckIcon } from "./Icons.jsx";

/** Akurasi GPS dibulatkan ke meter; angka desimalnya tidak berarti apa-apa di lapangan. */
const meter = (n) => `${Math.round(Number(n))} m`;

function BarisNilai({ label, nilai, wajib }) {
  const kosong = !nilai;
  return (
    <div className={"fk-hasil-baris" + (kosong ? " is-kosong" : "")}>
      <span className="fk-hasil-label">
        {label}
        {wajib && <span className="fk-star">*</span>}
      </span>
      <span className="fk-hasil-nilai">{kosong ? "— belum diisi" : nilai}</span>
    </div>
  );
}

export default function RingkasanLatihan({ formulir, jawaban, rekam, berkas, onUlang, onSelesai }) {
  const pertanyaan = formulir.pertanyaan;

  return (
    <div className="fk-fill">
      <section className="fk-panel fk-hasil-kepala">
        <span className="fk-hasil-lencana" aria-hidden="true">
          <CheckIcon />
        </span>
        <h2 className="fk-kk-title-top">Isian latihan sudah lengkap</h2>
        <p className="fk-form-desc">
          Semua kolom wajib terisi dan formatnya benar. Pada kertas kerja sungguhan, data seperti
          ini akan tersimpan saat Anda menekan Simpan — latihan ini tidak menyimpan apa pun.
        </p>
      </section>

      <section className="fk-section fk-hasil-daftar">
        <div className="fk-bagian" style={{ margin: "12px 0 2px" }}>
          Data yang Anda isi
        </div>
        <div className="fk-hasil-judul">{judulEntri(pertanyaan, jawaban)}</div>
        {pertanyaan.map((q) => (
          <BarisNilai
            key={q.id}
            label={q.label || "(Pertanyaan Tanpa Judul)"}
            nilai={formatNilai(q, jawaban[q.id])}
            wajib={q.wajib}
          />
        ))}
        <BarisNilai
          label="Kelengkapan berkas"
          nilai={
            berkas.berkasLengkap
              ? "Lengkap"
              : `Tidak lengkap${berkas.catatanBerkas ? ` — ${berkas.catatanBerkas}` : ""}`
          }
        />
      </section>

      {/* Latihan sekaligus menguji GPS perangkat petugas: kalau di sini gagal,
          di lapangan pun titiknya tidak akan terekam. */}
      <section className={"fk-section fk-hasil-gps" + (rekam ? "" : " is-gagal")}>
        <div className="fk-field">
          <span className="fk-q-name">Perekaman titik lokasi</span>
          {rekam ? (
            <p className="fk-q-ket">
              Berhasil. Titik terekam{rekam.akurasi ? ` dengan ketelitian sekitar ${meter(rekam.akurasi)}` : ""}, jadi
              data Anda akan muncul di Peta Sensus.
            </p>
          ) : (
            <p className="fk-q-ket">
              Tidak didapat. Data tetap bisa disimpan, tetapi titiknya tidak muncul di Peta Sensus.
              Periksa izin lokasi untuk aplikasi ini dan pastikan GPS perangkat menyala, lalu coba
              latihan sekali lagi di luar ruangan.
            </p>
          )}
        </div>
      </section>

      <div className="fk-form-actions fk-sticky-actions">
        <button type="button" className="fk-btn-ghost" onClick={onSelesai}>
          Pilih formulir lain
        </button>
        <button type="button" className="fk-btn" onClick={onUlang}>
          Ulangi latihan
        </button>
      </div>
    </div>
  );
}

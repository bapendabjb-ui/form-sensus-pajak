/*
 * Pengajuan hapus. Petugas tidak bisa menghapus kertas kerja atau data sendiri,
 * jadi mereka mengajukannya ke admin beserta alasannya. Dipakai di halaman
 * kertas kerja dan halaman ubah data:
 *   - PitaPengajuan : pengajuan yang menunggu, di atas halaman. Admin memutuskan
 *                     dari sini; petugas bisa membatalkannya.
 *   - AjukanHapus   : tombol & isian pengajuan, di tempat tombol hapus admin.
 */

import { useState } from "react";
import * as api from "../api.js";
import CustomSelect from "./CustomSelect.jsx";
import { IconLock } from "./Icons.jsx";
import { useToast } from "./Toast.jsx";
import { useDialog } from "./Dialog.jsx";
import { formatWaktu } from "../lib/format.js";

const NAMA = { kertas_kerja: "kertas kerja", entri: "data" };

/** Sama dengan batas kolom alasan di server. */
const ALASAN_MAKS = 500;

const kapitalAwal = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * @param {object} props
 * @param {object|null} props.pengajuan  pengajuan terakhir sasaran ini (dari server)
 * @param {boolean} props.admin
 * @param {string} props.pesanHapus      keterangan dialog sebelum admin menyetujui
 * @param {() => void} props.onDisetujui sasaran sudah terhapus - pemanggil pindah layar
 * @param {(p: object|null) => void} props.onBerubah  pengajuan ditolak / dibatalkan
 */
export function PitaPengajuan({ pengajuan, admin, pesanHapus, onDisetujui, onBerubah }) {
  const toast = useToast();
  const { konfirmasi } = useDialog();
  const [sibuk, setSibuk] = useState(false);

  if (!pengajuan || pengajuan.status !== "menunggu") return null;
  const nama = NAMA[pengajuan.jenis];

  const jalankan = async (dialog, aksi) => {
    if (!(await konfirmasi(dialog))) return;
    setSibuk(true);
    try {
      await aksi();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setSibuk(false);
    }
  };

  const setujui = () =>
    jalankan({ judul: `Setujui & hapus ${nama} ini?`, pesan: pesanHapus, ya: "Setujui & hapus", bahaya: true }, async () => {
      await api.setujuiPengajuan(pengajuan.id);
      onDisetujui();
    });

  const tolak = () =>
    jalankan(
      {
        judul: "Tolak pengajuan ini?",
        pesan: `${kapitalAwal(nama)} tetap ada. Petugas akan melihat bahwa pengajuannya ditolak.`,
        ya: "Tolak",
      },
      async () => {
        onBerubah(await api.tolakPengajuan(pengajuan.id));
        toast("Pengajuan hapus ditolak.");
      }
    );

  const batalkan = () =>
    jalankan({ judul: "Batalkan pengajuan hapus?", ya: "Batalkan pengajuan", tidak: "Kembali" }, async () => {
      await api.batalkanPengajuan(pengajuan.id);
      onBerubah(null);
      toast("Pengajuan hapus dibatalkan.");
    });

  return (
    <div className="fk-pengajuan-pita" role="status">
      <div className="fk-pengajuan-isi">
        <span className="fk-pengajuan-judul">
          {kapitalAwal(nama)} ini diajukan untuk dihapus
        </span>
        <span className="fk-pengajuan-alasan">“{pengajuan.alasan}”</span>
        <span className="fk-pengajuan-meta">
          {pengajuan.pengaju} · {formatWaktu(pengajuan.createdAt)}
          {admin ? "" : " · menunggu persetujuan admin"}
        </span>
      </div>
      <div className="fk-pengajuan-aksi">
        {admin ? (
          <>
            <button type="button" className="fk-btn-ghost" onClick={tolak} disabled={sibuk}>
              Tolak
            </button>
            <button type="button" className="fk-btn-danger" onClick={setujui} disabled={sibuk}>
              Setujui & hapus
            </button>
          </>
        ) : (
          <button type="button" className="fk-mini" onClick={batalkan} disabled={sibuk}>
            Batalkan pengajuan
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {"kertas_kerja"|"entri"} props.jenis
 * @param {number} props.sasaranId
 * @param {object[]} props.tim           tim petugas kertas kerjanya - sumber nama pengaju
 * @param {object|null} props.pengajuan  pengajuan terakhir sasaran ini (dari server)
 * @param {(p: object) => void} props.onTerkirim
 */
export function AjukanHapus({ jenis, sasaranId, tim = [], pengajuan, onTerkirim }) {
  const toast = useToast();
  const [buka, setBuka] = useState(false);
  const [petugasId, setPetugasId] = useState(null);
  const [alasan, setAlasan] = useState("");
  const [galat, setGalat] = useState({});
  const [sibuk, setSibuk] = useState(false);

  // Yang menunggu sudah tampil sebagai pita di atas halaman.
  if (pengajuan?.status === "menunggu") return null;

  const nama = NAMA[jenis];
  const label = (p) => (p.nip ? `${p.nama} — ${p.nip}` : p.nama);
  const terpilih = tim.find((p) => p.id === petugasId) || null;

  const mulai = () => {
    setBuka(true);
    setGalat({});
    if (!terpilih && tim.length === 1) setPetugasId(tim[0].id);
  };

  const kirim = async () => {
    const g = {};
    if (!terpilih) g.petugas = "Pilih nama Anda.";
    if (!alasan.trim()) g.alasan = "Tuliskan alasannya supaya admin bisa menimbang.";
    setGalat(g);
    if (Object.keys(g).length) return;

    setSibuk(true);
    try {
      const p = await api.ajukanHapus(jenis, sasaranId, terpilih.id, alasan.trim());
      toast("Pengajuan hapus terkirim ke admin.");
      setBuka(false);
      setAlasan("");
      onTerkirim(p);
    } catch (e) {
      toast(e.message, true);
    } finally {
      setSibuk(false);
    }
  };

  if (!buka) {
    const ditolak = pengajuan?.status === "ditolak";
    return (
      <div className="fk-kunci-admin">
        <span className="fk-kunci-ikon" aria-hidden="true">
          <IconLock />
        </span>
        <span className="fk-kunci-teks">
          Menghapus {nama} memerlukan persetujuan admin.
          {ditolak && ` Pengajuan terakhir ditolak admin pada ${formatWaktu(pengajuan.diputuskanAt)}.`}
        </span>
        <button type="button" className="fk-mini" onClick={mulai}>
          Ajukan hapus
        </button>
      </div>
    );
  }

  const idAlasan = `fk-alasan-${jenis}-${sasaranId}`;

  return (
    <section className="fk-section fk-ajukan">
      <div className="fk-field">
        <span className="fk-q-name">Ajukan hapus {nama}</span>
        <p className="fk-q-ket">
          Admin akan meninjau pengajuan ini. {kapitalAwal(nama)} tetap ada sampai admin menyetujuinya.
        </p>
      </div>

      <div className="fk-field">
        <span className="fk-q-name">
          Diajukan oleh<span className="fk-star">*</span>
        </span>
        <CustomSelect
          value={terpilih ? label(terpilih) : ""}
          options={tim.map(label)}
          placeholder="Pilih nama Anda"
          title="Diajukan oleh"
          invalid={Boolean(galat.petugas)}
          emptyText="Kertas kerja ini belum punya petugas"
          onChange={(l) => {
            setPetugasId(tim.find((p) => label(p) === l)?.id ?? null);
            setGalat((g) => ({ ...g, petugas: "" }));
          }}
        />
        {galat.petugas && <span className="fk-err">{galat.petugas}</span>}
      </div>

      <div className="fk-field">
        <label className="fk-q-name" htmlFor={idAlasan}>
          Alasan<span className="fk-star">*</span>
        </label>
        <textarea
          id={idAlasan}
          className={"fk-input fk-textarea" + (galat.alasan ? " is-invalid" : "")}
          placeholder={
            jenis === "entri"
              ? "Mis. data ganda, salah memilih formulir"
              : "Mis. kertas kerja terbuat dua kali, salah memilih tim"
          }
          maxLength={ALASAN_MAKS}
          value={alasan}
          onChange={(e) => {
            setAlasan(e.target.value);
            setGalat((g) => ({ ...g, alasan: "" }));
          }}
        />
        {galat.alasan && <span className="fk-err">{galat.alasan}</span>}
      </div>

      <div className="fk-detail-aksi fk-ajukan-aksi">
        <button type="button" className="fk-btn-ghost" onClick={() => setBuka(false)} disabled={sibuk}>
          Batal
        </button>
        <button type="button" className="fk-btn" onClick={kirim} disabled={sibuk}>
          {sibuk ? "Mengirim..." : "Kirim pengajuan"}
        </button>
      </div>
    </section>
  );
}

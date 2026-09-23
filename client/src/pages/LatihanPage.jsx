/*
 * Latihan petugas: pilih satu formulir, lalu isi seperti di lapangan tanpa ada
 * yang tersimpan.
 *
 * Halaman ini hanya memilih formulir; pengisiannya memakai layar isi data yang
 * sama persis dengan yang dipakai pada kertas kerja sungguhan (IsiData dengan
 * `latihan`). Tiruan terpisah akan cepat berbeda dari aslinya, dan latihan yang
 * berbeda dari lapangan lebih berbahaya daripada tidak ada latihan.
 */

import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import { PageHead, Panel, Loading, ErrorBox, Empty } from "../components/Ui.jsx";
import { IkonFormulir } from "../components/Icons.jsx";
import { navigate } from "../lib/router.js";

const CATATAN = [
  "Isian, foto, dan cek NOP berjalan persis seperti di lapangan — hanya tombol Simpan yang tidak mengirim apa-apa.",
  "Tidak ada data latihan yang masuk ke kertas kerja, rekap petugas, maupun Peta Sensus.",
  "Aplikasi akan meminta izin lokasi. Izinkan saja: latihan ini sekaligus memastikan GPS perangkat Anda bekerja.",
  "Foto yang diunggah selama latihan tidak tertaut ke data mana pun, jadi terhapus sendiri dari server dalam 24 jam.",
];

export default function LatihanPage() {
  const [bank, setBank] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const muat = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setBank(await api.listFormulir());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  return (
    <>
      <PageHead
        title="Latihan Petugas"
        sub="Berlatih mengisi formulir sungguhan tanpa menyimpan data. Aman untuk dicoba berulang kali."
      />

      <Panel title="Sebelum mulai">
        <ul className="fk-latihan-catatan">
          {CATATAN.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Panel>

      {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}
      {loading && <Loading label="Memuat formulir..." />}

      {!loading && !error && (
        <>
          <div className="fk-bagian">Pilih formulir untuk dilatih</div>
          {bank.length === 0 ? (
            <Empty>Belum ada formulir. Minta admin menyusun bank formulir terlebih dahulu.</Empty>
          ) : (
            <div className="fk-baris-list">
              {bank.map((f, i) => {
                const kosong = f.jumlahPertanyaan === 0;
                return (
                  <button
                    type="button"
                    className="fk-baris"
                    key={f.id}
                    onClick={() => navigate(`/latihan/${f.id}`)}
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
                    <span className="fk-baris-panah">›</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

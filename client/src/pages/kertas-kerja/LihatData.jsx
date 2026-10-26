/*
 * Satu data dalam bentuk baca saja, untuk akun pejabat. Isinya sama dengan
 * layar ubah data, tetapi tanpa kolom isian dan tombol simpan / hapus.
 */

import { useCallback, useEffect, useState } from "react";
import * as api from "../../api.js";
import { Loading, ErrorBox, BerkasPill } from "../../components/Ui.jsx";
import { PitaPengajuan } from "../../components/PengajuanHapus.jsx";
import { IkonEpbb } from "../../components/Icons.jsx";
import { namaAdmin } from "../../components/LokasiObjek.jsx";
import { formatNilai } from "../../lib/ringkas.js";
import { formatWaktu, formatLokasi, formatNomorTelepon, formatHargaBaris, urlPeta } from "../../lib/format.js";
import { kembali } from "../../lib/router.js";
import { urlKk, susunTataLetak } from "./bersama.js";

const kosong = <span className="fk-nilai-kosong">Tidak diisi</span>;

/** Isi satu jawaban dalam bentuk tampilan. */
function Nilai({ q, nilai, dicek }) {
  switch (q.tipe) {
    case "foto": {
      const foto = (Array.isArray(nilai) ? nilai : []).filter((f) => f && f.id);
      if (!foto.length) return kosong;
      return (
        <div className="fk-foto-grid">
          {foto.map((f) => (
            <div className="fk-foto-item" key={f.id} title={f.nama}>
              <a href={api.fotoUrl(f.id)} target="_blank" rel="noreferrer">
                <img src={api.fotoUrl(f.id)} alt={f.nama || "Foto"} loading="lazy" />
              </a>
            </div>
          ))}
        </div>
      );
    }

    case "linetariff": {
      const baris = (Array.isArray(nilai) ? nilai : []).filter((r) => (r?.layanan || "").trim());
      if (!baris.length) return kosong;
      return (
        <ul className="fk-nilai-daftar">
          {baris.map((r, i) => (
            <li key={i}>
              <span>
                {r.layanan}
                {r.jenis && <span className="fk-nilai-ket"> · {r.jenis}</span>}
              </span>
              <span className="fk-nilai-harga">{formatHargaBaris(r) || "—"}</span>
            </li>
          ))}
        </ul>
      );
    }

    case "telepon": {
      const baris = (Array.isArray(nilai) ? nilai : []).filter((r) => r && r.nomor);
      if (!baris.length) return kosong;
      return (
        <ul className="fk-nilai-daftar">
          {baris.map((r, i) => (
            <li key={i}>
              <span>{r.keterangan || "Telepon"}</span>
              <a className="fk-nilai-harga" href={`tel:${r.nomor}`}>
                {formatNomorTelepon(r.nomor)}
              </a>
            </li>
          ))}
        </ul>
      );
    }

    case "lokasi": {
      const teks = formatLokasi(nilai);
      if (!teks) return kosong;
      return (
        <div className="fk-koordinat-kunci">
          <span>{teks}</span>
          <a className="fk-lokasi-peta" href={urlPeta(nilai)} target="_blank" rel="noreferrer">
            Buka di Google Maps
          </a>
          {dicek && (
            <span className="fk-dicek-ket">
              ✓ Sudah dicek {namaAdmin(dicek.oleh)}, {formatWaktu(dicek.waktu)}.
            </span>
          )}
        </div>
      );
    }

    default: {
      const teks = formatNilai(q, nilai);
      return teks ? <p className={"fk-nilai" + (q.tipe === "paragraph" ? " is-paragraf" : "")}>{teks}</p> : kosong;
    }
  }
}

export function LihatData({ kkId, entriId }) {
  const [e, setE] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const muat = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setE(await api.getEntri(entriId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [entriId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const urlKembali = urlKk(kkId);
  const nomor = e?.kertasKerja?.nomor || "";
  const tombolKembali = (
    <button type="button" className="fk-textbtn hanya-desktop" onClick={() => kembali(urlKembali)}>
      {`‹ Kembali ke kertas kerja${nomor ? ` ${nomor}` : ""}`}
    </button>
  );

  if (loading && !e) return <Loading label="Memuat data..." />;
  if (error)
    return (
      <>
        {tombolKembali}
        <ErrorBox onRetry={muat}>{error}</ErrorBox>
      </>
    );
  if (!e) return null;

  const { formulir, jawaban } = e;
  const dariEpbb = new Set(e.dariEpbb || []);
  const tataLetak = susunTataLetak(formulir.pertanyaan);
  const adaKolom = tataLetak.some((b) => !b.penuh);
  const dicek = e.lokasi?.dicek || null;

  const pengisi = [
    e.dibuatOleh ? `Diisi ${e.dibuatOleh}, ${formatWaktu(e.createdAt)}` : `Disimpan ${formatWaktu(e.createdAt)}`,
  ];
  // diubahOleh hanya terisi saat data diubah, bukan saat pertama disimpan.
  if (e.diubahOleh) {
    pengisi.push(`diubah ${e.diubahOleh}, ${formatWaktu(e.updatedAt)}`);
  }

  const baris = (q) => (
    <div className="fk-field" key={q.id}>
      <span className="fk-q-name">
        {q.label || "(Pertanyaan Tanpa Judul)"}
        {dariEpbb.has(q.id) && (
          <span className="fk-epbb-tag" title="Diisi otomatis dari data EPBB.">
            <IkonEpbb /> Data EPBB
          </span>
        )}
      </span>
      <Nilai q={q} nilai={jawaban[q.id]} dicek={dicek} />
    </div>
  );

  return (
    <div className={"fk-fill" + (adaKolom ? " is-dua-kolom" : "")}>
      {tombolKembali}

      <PitaPengajuan pengajuan={e.pengajuanHapus} hanyaLihat />

      <section className="fk-panel fk-form fk-form-kepala">
        <div className="fk-form-accent" />
        <span className="fk-opts-cap">{`Kertas kerja ${nomor} · lihat data`}</span>
        <h2 className="fk-kk-title-top" style={{ marginTop: 6 }}>
          {formulir.judul}
        </h2>
        <p className="fk-form-desc">{pengisi.join(" · ")}</p>
        {!e.berkasLengkap && (
          <p className="fk-lihat-berkas">
            <BerkasPill />
            {e.catatanBerkas && <span>{e.catatanBerkas}</span>}
          </p>
        )}
      </section>

      <section className="fk-section">
        {formulir.pertanyaan.length === 0 && <div className="fk-lt-empty">Formulir ini belum punya pertanyaan.</div>}
        {tataLetak.map((b, i) =>
          b.penuh ? (
            baris(b.penuh)
          ) : (
            <div className="fk-dua-kolom" key={`blok-${i}`}>
              {[
                ["kiri", formulir.judulKolomKiri],
                ["kanan", formulir.judulKolomKanan],
              ].map(([sisi, judul]) => (
                <div className={`fk-kolom fk-kolom-${sisi}`} key={sisi}>
                  {judul && <h3 className="fk-kolom-judul">{judul}</h3>}
                  {b[sisi].map(baris)}
                </div>
              ))}
            </div>
          )
        )}
      </section>
    </div>
  );
}

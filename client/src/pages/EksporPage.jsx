import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import CustomSelect from "../components/CustomSelect.jsx";
import { useToast } from "../components/Toast.jsx";
import { PageHead, Panel, Loading, ErrorBox } from "../components/Ui.jsx";
import LoginAdmin from "../components/LoginAdmin.jsx";

/**
 * Halaman ekspor: satu tempat untuk mengunduh data sebagai Excel atau CSV.
 *   - Per kertas kerja: semua formulir, atau satu formulir di kertas kerja itu.
 *   - Per formulir: seluruh data formulir itu dari semua kertas kerja.
 * Unduhannya sama dengan tombol ekspor di halaman kertas kerja & bank formulir.
 */

const SEMUA_FORMULIR = "Semua formulir";

/** "00012 · Andi Saputra +2 · 5 data" */
const labelKk = (k) => {
  const tim = k.petugas || [];
  const pj = tim[0]?.nama || "—";
  const lain = tim.length > 1 ? ` +${tim.length - 1}` : "";
  return `${k.nomor} · ${pj}${lain} · ${k.jumlahData} data`;
};

const labelJumlah = (judul, jumlah) => `${judul} · ${jumlah} data`;

function TombolUnduh({ onExcel, onCsv, disabled }) {
  return (
    <div className="fk-ekspor-aksi">
      <button type="button" className="fk-btn" onClick={onExcel} disabled={disabled}>
        Unduh Excel
      </button>
      <button type="button" className="fk-btn-ghost" onClick={onCsv} disabled={disabled}>
        Unduh CSV
      </button>
    </div>
  );
}

export default function EksporPage({ admin, onAuthChanged }) {
  const toast = useToast();
  // Unduhan lewat fetch bertoken bisa gagal (sesi habis, jaringan putus);
  // tanpa ini galatnya tenggelam sebagai promise yang ditolak diam-diam.
  const unduhKe = (janji) => janji.catch((e) => toast(e.message, true));
  const [kkList, setKkList] = useState([]);
  const [formList, setFormList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Per kertas kerja
  const [kkId, setKkId] = useState(null);
  const [grup, setGrup] = useState([]); // formulir yang punya data di kertas kerja terpilih
  const [memuatGrup, setMemuatGrup] = useState(false);
  const [kkFormId, setKkFormId] = useState(null); // null = semua formulir

  // Per formulir
  const [formId, setFormId] = useState(null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [kk, formulir] = await Promise.all([api.listKertasKerja(), api.listFormulir()]);
      setKkList(kk);
      setFormList(formulir);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Jangan memanggil API sebelum admin: layarnya pun tidak ditampilkan.
  useEffect(() => {
    if (admin) muat();
  }, [admin, muat]);

  // Daftar formulir untuk kertas kerja terpilih diambil dari detailnya (hanya yang sudah berisi data).
  useEffect(() => {
    setKkFormId(null);
    if (!kkId) {
      setGrup([]);
      return undefined;
    }
    let batal = false;
    setMemuatGrup(true);
    api
      .getKertasKerja(kkId)
      .then((d) => {
        if (batal) return;
        const jumlah = new Map();
        for (const e of d.entri) jumlah.set(e.formulirId, (jumlah.get(e.formulirId) || 0) + 1);
        setGrup(
          d.formulir.filter((f) => jumlah.has(f.id)).map((f) => ({ id: f.id, judul: f.judul, jumlah: jumlah.get(f.id) }))
        );
      })
      .catch((e) => !batal && toast(e.message, true))
      .finally(() => !batal && setMemuatGrup(false));
    return () => {
      batal = true;
    };
  }, [kkId, toast]);

  if (loading) return <Loading label="Memuat data ekspor..." />;
  if (error) return <ErrorBox onRetry={muat}>{error}</ErrorBox>;

  const kkTerpilih = kkList.find((k) => k.id === kkId) || null;
  const grupTerpilih = grup.find((g) => g.id === kkFormId) || null;
  const formBerisi = formList.filter((f) => f.jumlahData > 0);
  const formTerpilih = formBerisi.find((f) => f.id === formId) || null;

  // Menunya disembunyikan bagi yang belum login, tetapi alamat /ekspor masih
  // bisa diketik langsung - jadi layarnya sendiri ikut dijaga.
  if (!admin) return <LoginAdmin onLoggedIn={onAuthChanged} sub="Ekspor Data Hanya Untuk Admin." />;

  return (
    <>
      <PageHead title="Ekspor Data" sub="Unduh Data Sebagai Excel atau CSV, Per Kertas Kerja atau Per Formulir." />

      <Panel title="Per kertas kerja" sub="Satu kertas kerja — seluruh formulir atau satu formulir saja.">
        <div className="fk-ekspor-isian">
          <span className="fk-q-name">Kertas kerja</span>
          <CustomSelect
            value={kkTerpilih ? labelKk(kkTerpilih) : ""}
            options={kkList.map(labelKk)}
            placeholder="Pilih kertas kerja"
            title="Pilih kertas kerja"
            emptyText="Belum ada kertas kerja"
            onChange={(label) => setKkId(kkList.find((k) => labelKk(k) === label)?.id ?? null)}
          />

          <span className="fk-q-name">Formulir</span>
          <CustomSelect
            value={grupTerpilih ? labelJumlah(grupTerpilih.judul, grupTerpilih.jumlah) : SEMUA_FORMULIR}
            options={[SEMUA_FORMULIR, ...grup.map((g) => labelJumlah(g.judul, g.jumlah))]}
            title="Pilih formulir"
            disabled={!kkTerpilih || memuatGrup}
            onChange={(label) =>
              setKkFormId(grup.find((g) => labelJumlah(g.judul, g.jumlah) === label)?.id ?? null)
            }
          />
          {kkTerpilih && !memuatGrup && grup.length === 0 && (
            <span className="fk-hint-kecil">Kertas kerja ini belum berisi data — berkas hanya memuat identitasnya.</span>
          )}
        </div>

        <TombolUnduh
          disabled={!kkTerpilih || memuatGrup}
          onExcel={() => unduhKe(api.unduhExcel(kkId, kkFormId || undefined))}
          onCsv={() => unduhKe(api.unduhCsv(kkId, kkFormId || undefined))}
        />
      </Panel>

      <Panel title="Per formulir" sub="Seluruh data satu formulir dari semua kertas kerja, urut nomor kertas kerja.">
        <div className="fk-ekspor-isian">
          <span className="fk-q-name">Formulir</span>
          <CustomSelect
            value={formTerpilih ? labelJumlah(formTerpilih.judul, formTerpilih.jumlahData) : ""}
            options={formBerisi.map((f) => labelJumlah(f.judul, f.jumlahData))}
            placeholder="Pilih formulir"
            title="Pilih formulir"
            emptyText="Belum ada formulir yang berisi data"
            onChange={(label) =>
              setFormId(formBerisi.find((f) => labelJumlah(f.judul, f.jumlahData) === label)?.id ?? null)
            }
          />
        </div>

        <TombolUnduh
          disabled={!formTerpilih}
          onExcel={() => unduhKe(api.unduhFormulir(formId, "xlsx"))}
          onCsv={() => unduhKe(api.unduhFormulir(formId, "csv"))}
        />
      </Panel>
    </>
  );
}

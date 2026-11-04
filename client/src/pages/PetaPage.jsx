import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../api.js";
import { PageHead, Loading, ErrorBox, Empty } from "../components/Ui.jsx";
import { useToast } from "../components/Toast.jsx";
import CustomSelect from "../components/CustomSelect.jsx";
import { useAdmin } from "../lib/admin.js";
import { navigate } from "../lib/router.js";
import { useLapisanPeta } from "../lib/lapisanPeta.js";
import PilihLapisan from "../components/peta/PilihLapisan.jsx";

// Leaflet berat; hanya diunduh saat halaman peta benar-benar dibuka.
const PetaSebaran = lazy(() => import("../components/PetaSebaran.jsx"));

const SARING = [
  ["semua", "Semua"],
  ["draft", "Draft"],
  ["selesai", "Selesai"],
  ["kurang", "Berkas tidak lengkap"],
  ["belumdicek", "Belum dicek"],
  ["dicek", "Sudah dicek"],
];

const cocok = (t, f) => {
  if (f === "draft" || f === "selesai") return t.status === f;
  if (f === "kurang") return !t.berkasLengkap;
  if (f === "belumdicek") return !t.dicek;
  if (f === "dicek") return t.dicek;
  return true;
};

export default function PetaPage() {
  const toast = useToast();
  const admin = useAdmin();
  const [titik, setTitik] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saring, setSaring] = useState("semua");
  // Lapisan dari GIS (batas blok, persil) di bawah titik sensus.
  const lapisan = useLapisanPeta();

  const muat = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTitik(await api.listPeta());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  // Identitas daftar harus stabil: PetaSebaran menggambar ulang seluruh titik
  // setiap prop `titik` berubah, jadi array baru tiap render akan membuat peta
  // berkedip dan memaksa pandangan kembali merapat terus-menerus.
  const tampil = useMemo(() => titik.filter((t) => cocok(t, saring)), [titik, saring]);

  // Setiap titik adalah koordinat objek sebuah data: balonnya membuka data itu.
  const bukaData = (t) => navigate(`/kertas-kerja/${t.kertasKerjaId}/data/${t.entriId}`);

  /** Admin: tandai / buka "sudah dicek" koordinat objek langsung dari balon. */
  const ubahDicek = async (t) => {
    try {
      const hasil = await api.setKoordinatDicek(t.entriId, !t.dicek);
      const dicek = Boolean(hasil.lokasi.dicek);
      const sama = (x) => x.entriId === t.entriId;
      setTitik((daftar) => daftar.map((x) => (sama(x) ? { ...x, dicek } : x)));
      toast(dicek ? "Ditandai sudah dicek dan dikunci." : "Kunci dibuka.");
    } catch (e) {
      toast(e.message, true);
    }
  };

  const jumlahKk = useMemo(() => new Set(tampil.map((t) => t.kertasKerjaId)).size, [tampil]);

  // Saringan berupa satu dropdown, bukan deretan tombol, supaya peta mendapat
  // ruang sebanyak mungkin. Jumlahnya ikut di label tiap pilihan.
  const pilihanSaring = SARING.map(([kunci, label]) => ({
    kunci,
    teks: `${label} · ${titik.filter((t) => cocok(t, kunci)).length.toLocaleString("id-ID")}`,
  }));

  const alat = (
    <>
      <div className={"fk-peta-saring" + (saring === "semua" ? "" : " is-aktif")}>
        <CustomSelect
          title="Saring titik"
          value={pilihanSaring.find((p) => p.kunci === saring).teks}
          options={pilihanSaring.map((p) => p.teks)}
          onChange={(teks) => setSaring(pilihanSaring.find((p) => p.teks === teks).kunci)}
        />
      </div>
      <PilihLapisan lapisan={lapisan} admin={Boolean(admin)} />
    </>
  );

  const kosong = tampil.length === 0 ? "Tidak ada titik pada saringan ini." : "";

  return (
    <>
      <PageHead title="Peta Sensus" sub="Pemetaan Data Sensus" />

      {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}

      {loading ? (
        <Loading label="Memuat titik..." />
      ) : titik.length === 0 ? (
        <Empty>
          Belum ada data berkoordinat. Titik muncul setelah petugas mengisi pertanyaan Lokasi, mis. Koordinat
          Objek Pajak.
        </Empty>
      ) : (
        <Suspense fallback={<Loading label="Memuat peta..." />}>
          <PetaSebaran
            titik={tampil}
            onBuka={bukaData}
            onCek={admin ? ubahDicek : null}
            kunciPandang={saring}
            alat={alat}
            keterangan={
              tampil.length > 0 &&
              `${tampil.length.toLocaleString("id-ID")} titik dari ${jumlahKk.toLocaleString("id-ID")} kertas kerja`
            }
            kosong={kosong}
            lapisan={lapisan.aktif}
          />
        </Suspense>
      )}
    </>
  );
}

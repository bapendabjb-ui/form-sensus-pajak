import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../api.js";
import { PageHead, Loading, ErrorBox, Empty } from "../components/Ui.jsx";
import { useToast } from "../components/Toast.jsx";
import { useAdmin } from "../lib/admin.js";
import { navigate } from "../lib/router.js";

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

/**
 * Dua macam titik ditampilkan terpisah supaya tidak menumpuk:
 *   kk   : Lokasi sensus - satu titik per kertas kerja;
 *   data : Koordinat objek - jawaban pertanyaan Lokasi di formulir, mis.
 *          Koordinat Objek Pajak PBB-P2. Angkanya jumlah data berkoordinat,
 *          bukan jumlah seluruh data, jadi namanya sengaja bukan "Data".
 */
const TAMPILAN = [
  ["kk", "Lokasi sensus", "Satu titik per kertas kerja: tempat petugas mendata."],
  ["data", "Koordinat objek", "Satu titik per data yang mengisi pertanyaan Lokasi, mis. Koordinat Objek Pajak."],
];

const KUNCI_TAMPILAN = "sensus-pajak:peta-tampilan";

/** Pilihan tampilan diingat per tab, supaya tetap sama saat kembali dari membuka data. */
function bacaTampilan() {
  try {
    return sessionStorage.getItem(KUNCI_TAMPILAN) === "data" ? "data" : "kk";
  } catch {
    return "kk";
  }
}

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
  const [tampilan, setTampilanState] = useState(bacaTampilan);

  const setTampilan = (k) => {
    setTampilanState(k);
    try {
      sessionStorage.setItem(KUNCI_TAMPILAN, k);
    } catch {
      /* penyimpanan tidak tersedia - pilihan tetap berlaku di layar ini */
    }
  };

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
  const titikJenis = useMemo(() => titik.filter((t) => t.jenis === tampilan), [titik, tampilan]);
  const tampil = useMemo(() => titikJenis.filter((t) => cocok(t, saring)), [titikJenis, saring]);

  // Titik kertas kerja (rumah / bidang yang disensus) membuka kertas kerjanya;
  // titik objek lain dari pertanyaan Lokasi membuka datanya.
  const bukaData = (t) =>
    navigate(t.entriId ? `/kertas-kerja/${t.kertasKerjaId}/data/${t.entriId}` : `/kertas-kerja/${t.kertasKerjaId}`);

  /**
   * Admin: tandai / buka "sudah dicek" langsung dari balon. Titik lokasi sensus
   * mengubah tanda kertas kerjanya, titik koordinat objek mengubah tanda datanya.
   */
  const ubahDicek = async (t) => {
    try {
      const hasil =
        t.jenis === "kk" ? await api.setLokasiDicek(t.kertasKerjaId, !t.dicek) : await api.setKoordinatDicek(t.entriId, !t.dicek);
      const dicek = Boolean(hasil.lokasi.dicek);
      const sama = (x) => x.jenis === t.jenis && x.kertasKerjaId === t.kertasKerjaId && x.entriId === t.entriId;
      setTitik((daftar) => daftar.map((x) => (sama(x) ? { ...x, dicek } : x)));
      toast(dicek ? "Ditandai sudah dicek dan dikunci." : "Kunci dibuka.");
    } catch (e) {
      toast(e.message, true);
    }
  };

  const jumlahKk = useMemo(() => new Set(tampil.map((t) => t.kertasKerjaId)).size, [tampil]);

  const saringan = (
    <div className="fk-filter" role="tablist" aria-label="Saring titik">
      {SARING.map(([kunci, label]) => (
        <button
          type="button"
          role="tab"
          aria-selected={saring === kunci}
          key={kunci}
          className={"fk-filter-btn" + (saring === kunci ? " is-on" : "") + (kunci === "kurang" ? " is-kurang" : "")}
          onClick={() => setSaring(kunci)}
        >
          {label}
          <span className="fk-filter-jumlah">{titikJenis.filter((t) => cocok(t, kunci)).length}</span>
        </button>
      ))}
    </div>
  );

  let isiPeta;
  if (titikJenis.length === 0) {
    isiPeta = (
      <Empty>
        {tampilan === "data"
          ? "Belum ada data yang mengisi pertanyaan Lokasi, mis. Koordinat Objek Pajak."
          : "Belum ada kertas kerja yang punya lokasi sensus."}
      </Empty>
    );
  } else if (tampil.length === 0) {
    isiPeta = (
      <>
        {saringan}
        <Empty>Tidak ada titik pada saringan ini.</Empty>
      </>
    );
  } else {
    isiPeta = (
      <>
        {saringan}
        <p className="fk-hint">
          {tampil.length.toLocaleString("id-ID")} titik dari {jumlahKk.toLocaleString("id-ID")} kertas kerja. Ketuk
          titik untuk melihat ringkasannya.
        </p>
        <Suspense fallback={<Loading label="Memuat peta..." />}>
          <PetaSebaran
            titik={tampil}
            onBuka={bukaData}
            onCek={admin ? ubahDicek : null}
            kunciPandang={`${tampilan}|${saring}`}
          />
        </Suspense>
      </>
    );
  }

  return (
    <>
      <PageHead title="Peta Sensus" sub="Pemetaan Data Sensus" />

      {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}

      {loading ? (
        <Loading label="Memuat titik..." />
      ) : titik.length === 0 ? (
        <Empty>
          Belum ada data berkoordinat. Titik muncul setelah petugas menyimpan data dengan izin lokasi
          aktif di perangkatnya.
        </Empty>
      ) : (
        <>
          <div className="fk-peta-jenis fk-peta-tampilan" role="radiogroup" aria-label="Tampilkan titik">
            {TAMPILAN.map(([kunci, label]) => (
              <button
                type="button"
                role="radio"
                aria-checked={tampilan === kunci}
                key={kunci}
                className={tampilan === kunci ? "is-on" : ""}
                onClick={() => setTampilan(kunci)}
              >
                {label}
                <span className="fk-filter-jumlah">{titik.filter((t) => t.jenis === kunci).length}</span>
              </button>
            ))}
          </div>
          <p className="fk-hint">{TAMPILAN.find(([k]) => k === tampilan)[2]}</p>
          {isiPeta}
        </>
      )}
    </>
  );
}

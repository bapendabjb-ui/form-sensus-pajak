import { Suspense, lazy, useEffect, useState } from "react";
import {
  useMesinPeta,
  PilihJenis,
  PetaMemuat,
  CatatanCadangan,
  IkonTitik,
  PenahanPeta,
  WARNA_STATUS,
} from "./peta/bersama.jsx";

const SebaranGoogle = lazy(() => import("./peta/SebaranGoogle.jsx"));
const SebaranLeaflet = lazy(() => import("./peta/SebaranLeaflet.jsx"));

/**
 * Peta sebaran hasil sensus: banyak titik sekaligus, hanya untuk dilihat.
 *
 * Dipisah dari PetaLokasi karena tugasnya berbeda - PetaLokasi memilih satu
 * titik dan bisa digeser, peta ini menggambar seluruh titik dan tidak mengubah
 * data apa pun. Memakai peta Google bila tersedia, peta cadangan bila tidak.
 *
 * titik  : [{ entriId, lat, lon, judul, formulir, nomor, status, petugas, dicek, ... }]
 * onBuka : (titik) => void  - dipanggil saat tautan di balon diklik
 * onCek  : (titik) => void | null  - admin: tandai / buka "sudah dicek" dari balon
 * kunciPandang : pandangan dirapatkan ulang hanya bila nilai ini berganti
 */
export default function PetaSebaran({ titik = [], onBuka, onCek = null, kunciPandang }) {
  const [jenis, setJenis] = useState("peta");
  const [penuh, setPenuh] = useState(false);
  const mesin = useMesinPeta();

  // Layar penuh: Escape menutupnya, dan halaman di belakangnya tidak ikut bergulir.
  useEffect(() => {
    if (!penuh) return undefined;
    const saatTombol = (e) => e.key === "Escape" && setPenuh(false);
    document.addEventListener("keydown", saatTombol);
    const html = document.documentElement;
    const lama = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", saatTombol);
      html.style.overflow = lama;
    };
  }, [penuh]);

  let kanvas = (
    <div className="fk-peta is-sebaran">
      <PetaMemuat />
    </div>
  );
  if (mesin.jenis === "google") {
    kanvas = (
      <SebaranGoogle
        kunci={mesin.kunci}
        titik={titik}
        onBuka={onBuka}
        onCek={onCek}
        kunciPandang={kunciPandang}
        jenis={jenis}
      />
    );
  } else if (mesin.jenis === "leaflet") {
    kanvas = <SebaranLeaflet titik={titik} onBuka={onBuka} onCek={onCek} kunciPandang={kunciPandang} jenis={jenis} />;
  }

  return (
    <div className={"fk-peta-wadah" + (penuh ? " is-penuh" : "")}>
      <div className="fk-peta-alat">
        <div className="fk-peta-legenda">
          <span className="fk-legenda">
            <IkonTitik warna={WARNA_STATUS.selesai} /> Selesai
          </span>
          <span className="fk-legenda">
            <IkonTitik warna={WARNA_STATUS.draft} /> Draft
          </span>
          {titik.some((t) => t.sumber === "gps") && (
            <span className="fk-legenda">
              <IkonTitik warna="#647380" berlubang /> Terekam otomatis
            </span>
          )}
          {titik.some((t) => t.dicek) && (
            <span className="fk-legenda">
              <IkonTitik warna={WARNA_STATUS.selesai} dicek /> Sudah dicek
            </span>
          )}
        </div>
        <div className="fk-peta-tombol">
          <PilihJenis jenis={jenis} onChange={setJenis} />
          <button
            type="button"
            className="fk-mini fk-peta-penuh"
            onClick={() => setPenuh((p) => !p)}
            aria-pressed={penuh}
          >
            {penuh ? "Tutup layar penuh" : "Layar penuh"}
          </button>
        </div>
      </div>
      <PenahanPeta kelas="is-sebaran">
        <Suspense
          fallback={
            <div className="fk-peta is-sebaran">
              <PetaMemuat />
            </div>
          }
        >
          {kanvas}
        </Suspense>
      </PenahanPeta>
      {mesin.cadangan && <CatatanCadangan />}
    </div>
  );
}

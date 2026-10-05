import { Suspense, lazy, useState } from "react";
import { useMesinPeta, PilihJenis, PetaMemuat, CatatanCadangan } from "./peta/bersama.jsx";

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
  const mesin = useMesinPeta();

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
    <div className="fk-peta-wadah">
      <div className="fk-peta-alat">
        <div className="fk-peta-legenda">
          <span className="fk-legenda">
            <span className="fk-titik-contoh is-selesai" /> Selesai
          </span>
          <span className="fk-legenda">
            <span className="fk-titik-contoh is-draft" /> Draft
          </span>
          {titik.some((t) => t.sumber === "gps") && (
            <span className="fk-legenda">
              <span className="fk-titik-contoh is-rekam" /> Terekam otomatis
            </span>
          )}
          {titik.some((t) => t.dicek) && (
            <span className="fk-legenda">
              <span className="fk-titik-contoh is-dicek">✓</span> Sudah dicek
            </span>
          )}
        </div>
        <PilihJenis jenis={jenis} onChange={setJenis} />
      </div>
      <Suspense
        fallback={
          <div className="fk-peta is-sebaran">
            <PetaMemuat />
          </div>
        }
      >
        {kanvas}
      </Suspense>
      {mesin.cadangan && <CatatanCadangan />}
    </div>
  );
}

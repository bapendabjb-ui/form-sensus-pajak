import { Suspense, lazy, useState } from "react";
import { useMesinPeta, PilihJenis, PetaMemuat, CatatanCadangan, PenahanPeta } from "./peta/bersama.jsx";

// Hanya mesin yang dipakai yang diunduh: Leaflet tidak ikut termuat selama
// peta Google berjalan, dan sebaliknya.
const LokasiGoogle = lazy(() => import("./peta/LokasiGoogle.jsx"));
const LokasiLeaflet = lazy(() => import("./peta/LokasiLeaflet.jsx"));

/**
 * Peta untuk memilih titik lokasi: ketuk peta atau geser penanda.
 *
 * Memakai peta Google bila server punya kuncinya; bila tidak ada atau gagal,
 * memakai peta cadangan (OpenStreetMap / Esri) tanpa perlu tindakan petugas.
 *
 * titik   : { lat, lon } | null
 * onPilih : (lat, lon) => void
 */
export default function PetaLokasi({ titik, onPilih }) {
  const [jenis, setJenis] = useState("peta");
  const mesin = useMesinPeta();

  let kanvas = (
    <div className="fk-peta">
      <PetaMemuat />
    </div>
  );
  if (mesin.jenis === "google") {
    kanvas = <LokasiGoogle kunci={mesin.kunci} titik={titik} onPilih={onPilih} jenis={jenis} />;
  } else if (mesin.jenis === "leaflet") {
    kanvas = <LokasiLeaflet titik={titik} onPilih={onPilih} jenis={jenis} />;
  }

  return (
    <div className="fk-peta-wadah">
      <div className="fk-peta-alat">
        <span className="fk-hint-kecil">Ketuk peta atau geser penanda untuk menentukan titik.</span>
        <PilihJenis jenis={jenis} onChange={setJenis} />
      </div>
      <PenahanPeta>
        <Suspense
          fallback={
            <div className="fk-peta">
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

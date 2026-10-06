import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useMesinPeta, PilihJenis, PetaMemuat, CatatanCadangan, PenahanPeta } from "./peta/bersama.jsx";
import { useToast } from "./Toast.jsx";
import { IkonLokasiSaya } from "./Icons.jsx";
import { pantauPosisi } from "../lib/rekamPosisi.js";

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
 * Tombol "Lokasi saya" memusatkan peta ke posisi perangkat dan menampilkan
 * titik biru, seperti di Google Maps. Tombol ini hanya membantu menemukan
 * tempat di peta - titiknya tetap dipilih dengan mengetuk peta.
 *
 * titik   : { lat, lon } | null
 * onPilih : (lat, lon) => void
 */
export default function PetaLokasi({ titik, onPilih }) {
  const toast = useToast();
  const [jenis, setJenis] = useState("peta");
  const mesin = useMesinPeta();
  const [saya, setSaya] = useState({ status: "mati", posisi: null });
  // Naik setiap kali peta perlu dipusatkan ke lokasi saya.
  const [pusatkan, setPusatkan] = useState(0);
  const henti = useRef(null);
  // Tombol sudah ditekan, tetapi posisinya belum didapat.
  const tunggu = useRef(false);

  // GPS dipantau terus selama peta terbuka supaya titik birunya makin tepat.
  useEffect(() => () => henti.current && henti.current(), []);

  const keLokasiSaya = () => {
    if (saya.posisi) {
      setPusatkan((n) => n + 1);
      return;
    }
    tunggu.current = true;
    if (henti.current) return; // masih mencari; peta dipusatkan begitu posisi didapat

    const berhenti = (pesan) => {
      if (henti.current) henti.current();
      henti.current = null;
      tunggu.current = false;
      setSaya({ status: "mati", posisi: null });
      toast(pesan, true);
    };
    // pantauPosisi bisa melapor gagal sebelum penghentinya dikembalikan.
    let galatAwal = "";
    const stop = pantauPosisi(({ status, posisi, galat }) => {
      if (status === "gagal" && !posisi) {
        if (henti.current) berhenti(galat);
        else galatAwal = galat;
        return;
      }
      setSaya({ status, posisi });
      if (posisi && tunggu.current) {
        tunggu.current = false;
        setPusatkan((n) => n + 1);
      }
    });
    henti.current = stop;
    if (galatAwal) berhenti(galatAwal);
  };

  const props = { titik, onPilih, jenis, posisiSaya: saya.posisi, pusatkan };
  let kanvas = (
    <div className="fk-peta">
      <PetaMemuat />
    </div>
  );
  if (mesin.jenis === "google") kanvas = <LokasiGoogle kunci={mesin.kunci} {...props} />;
  else if (mesin.jenis === "leaflet") kanvas = <LokasiLeaflet {...props} />;

  return (
    <div className="fk-peta-wadah">
      <div className="fk-peta-alat">
        <span className="fk-hint-kecil">Ketuk peta atau geser penanda untuk menentukan titik.</span>
        <PilihJenis jenis={jenis} onChange={setJenis} />
      </div>
      <div className="fk-peta-tumpuk">
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
        <button
          type="button"
          className={
            "fk-lokasi-saya" + (saya.status === "mencari" ? " is-mencari" : saya.posisi ? " is-aktif" : "")
          }
          onClick={keLokasiSaya}
          aria-label="Lokasi saya"
          title="Lokasi saya"
        >
          <IkonLokasiSaya />
        </button>
      </div>
      {mesin.cadangan && <CatatanCadangan />}
    </div>
  );
}

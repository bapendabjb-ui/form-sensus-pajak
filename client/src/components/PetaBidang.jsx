import { Suspense, lazy, useState } from "react";
import { useMesinPeta, PilihJenis, PetaMemuat, CatatanCadangan, PenahanPeta, TombolLokasiSaya } from "./peta/bersama.jsx";
import { useLokasiSaya } from "../lib/useLokasiSaya.js";
import { PERSIL_ZOOM_MIN } from "../lib/persilBpn.js";

// Hanya mesin yang dipakai yang diunduh.
const BidangGoogle = lazy(() => import("./peta/BidangGoogle.jsx"));
const BidangLeaflet = lazy(() => import("./peta/BidangLeaflet.jsx"));

/** Keterangan persil di atas peta, menurut status dari mesin peta. */
const PESAN_PERSIL = {
  perbesar: `Perbesar peta (zoom ${PERSIL_ZOOM_MIN}+) untuk melihat bidang BPN`,
  memuat: "Memuat persil BPN…",
  galat: "Persil BPN gagal dimuat. Geser peta untuk mencoba lagi.",
};

/**
 * Peta pemilih bidang BPN pada pertanyaan Bidang Tanah BPN (NibInput):
 * petugas mengetuk bidang untuk memilihnya, mengetuk lagi untuk membatalkan.
 * Satu objek pajak boleh menempati beberapa bidang.
 *
 * persil   : usePersilBpn({ paksa: true }).peta
 * titik    : { lat, lon } | null - titik Lokasi objek, sebagai acuan
 * terpilih : [{ kunci, fitur }] - bidang terpilih yang bentuknya sudah diketahui
 * fokus    : { batas, ke } | null - rapatkan pandangan ke sana
 * onKetuk  : (lat, lon) => void
 * mencari  : true selagi bidang di titik ketukan sedang dicari
 */
export default function PetaBidang({ persil, titik, terpilih, fokus, onKetuk, mencari = false }) {
  const [jenis, setJenis] = useState("satelit");
  const [status, setStatus] = useState("");
  const mesin = useMesinPeta();
  const { saya, pusatkan, keLokasiSaya, berhentiIkuti } = useLokasiSaya();

  const props = {
    persil,
    jenis,
    titik,
    terpilih,
    fokus,
    onKetuk,
    posisiSaya: saya.posisi,
    pusatkan,
    onGeser: berhentiIkuti,
    onStatusPersil: setStatus,
  };
  let kanvas = (
    <div className="fk-peta">
      <PetaMemuat />
    </div>
  );
  if (mesin.jenis === "google") kanvas = <BidangGoogle kunci={mesin.kunci} {...props} />;
  else if (mesin.jenis === "leaflet") kanvas = <BidangLeaflet {...props} />;

  return (
    <div className="fk-peta-wadah fk-bidang-peta">
      <div className="fk-peta-alat">
        <span className="fk-hint-kecil">Ketuk bidang untuk memilih. Ketuk lagi untuk membatalkan.</span>
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
        {(PESAN_PERSIL[status] || mencari) && (
          <div className={"fk-peta-persil" + (status === "galat" && !mencari ? " is-galat" : "")} role="status">
            {mencari ? "Mencari bidang…" : PESAN_PERSIL[status]}
          </div>
        )}
        <TombolLokasiSaya saya={saya} onClick={keLokasiSaya} />
      </div>
      {mesin.cadangan && <CatatanCadangan />}
    </div>
  );
}

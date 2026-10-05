import { useEffect, useRef, useState } from "react";
import { muatGoogleMaps, tandaiGoogleGagal } from "../../lib/googleMaps.js";
import { PUSAT_AWAL, PetaMemuat } from "./bersama.jsx";

/**
 * Mesin Google untuk pemilih titik: ketuk peta atau geser penanda. Perilakunya
 * sama dengan LokasiLeaflet supaya petugas tidak merasakan bedanya saat peta
 * beralih ke cadangan.
 *
 * Setiap kali komponen ini dipasang, Google menghitung satu "map load" - itulah
 * satuan tagihan / kuota Maps JavaScript API. Geser dan zoom tidak dihitung.
 *
 * kunci   : kunci Maps JavaScript API dari /api/konfigurasi
 * titik   : { lat, lon } | null
 * onPilih : (lat, lon) => void
 * jenis   : "peta" | "satelit"
 */

/** Satelit memakai "hybrid" supaya nama jalan tetap terbaca di atas citra. */
const TIPE = { peta: "roadmap", satelit: "hybrid" };

export default function LokasiGoogle({ kunci, titik, onPilih, jenis }) {
  const wadah = useRef(null);
  const peta = useRef(null);
  const penanda = useRef(null);
  const g = useRef(null);
  const pilihRef = useRef(onPilih);
  pilihRef.current = onPilih;
  const [siap, setSiap] = useState(false);

  /** Taruh / pindahkan penanda. Penanda bisa digeser; hasil geser dilaporkan. */
  const pasangPenanda = (posisi) => {
    if (penanda.current) {
      penanda.current.setPosition(posisi);
      return;
    }
    penanda.current = new g.current.Marker({ map: peta.current, position: posisi, draggable: true });
    penanda.current.addListener("dragend", (e) => pilihRef.current(e.latLng.lat(), e.latLng.lng()));
  };

  // Buat peta sekali; titik awal diambil dari nilai saat peta dibuka.
  useEffect(() => {
    let batal = false;
    muatGoogleMaps(kunci)
      .then((lib) => {
        if (batal) return;
        try {
          g.current = lib;
          const awal = titik ? { lat: titik.lat, lng: titik.lon } : { lat: PUSAT_AWAL.lat, lng: PUSAT_AWAL.lon };
          const m = new lib.Map(wadah.current, {
            center: awal,
            zoom: titik ? 18 : 13,
            mapTypeId: TIPE[jenis],
            // Jenis peta diatur tombol aplikasi sendiri, sama dengan peta cadangan.
            disableDefaultUI: true,
            zoomControl: true,
            // Satu jari menggeser peta, seperti peta cadangan.
            gestureHandling: "greedy",
            // Mengetuk nama toko tidak membuka balon Google, tetapi menaruh titik.
            clickableIcons: false,
            tilt: 0,
          });
          peta.current = m;
          if (titik) pasangPenanda(awal);
          m.addListener("click", (e) => {
            pasangPenanda(e.latLng);
            pilihRef.current(e.latLng.lat(), e.latLng.lng());
          });
          setSiap(true);
        } catch (e) {
          tandaiGoogleGagal(`peta tidak dapat dibuat: ${e.message}`);
        }
      })
      .catch(() => {
        // Sudah ditandai gagal; PetaLokasi beralih ke peta cadangan.
      });
    return () => {
      batal = true;
      if (penanda.current) penanda.current.setMap(null);
      if (peta.current && g.current) g.current.event.clearInstanceListeners(peta.current);
      peta.current = null;
      penanda.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (peta.current) peta.current.setMapTypeId(TIPE[jenis]);
  }, [jenis, siap]);

  // Titik berubah dari luar (mis. GPS diambil saat peta terbuka, koordinat ditempel, atau dihapus).
  useEffect(() => {
    const m = peta.current;
    if (!m) return;
    if (!titik) {
      if (penanda.current) {
        penanda.current.setMap(null);
        penanda.current = null;
      }
      return;
    }
    const posisi = { lat: titik.lat, lng: titik.lon };
    const kini = penanda.current?.getPosition();
    if (!kini || kini.lat() !== posisi.lat || kini.lng() !== posisi.lng) pasangPenanda(posisi);
    const batas = m.getBounds();
    if (!batas || !batas.contains(posisi)) {
      m.setCenter(posisi);
      if (m.getZoom() < 17) m.setZoom(17);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titik?.lat, titik?.lon, siap]);

  return (
    <div className="fk-peta">
      <div className="fk-peta-kanvas" ref={wadah} />
      {!siap && <PetaMemuat />}
    </div>
  );
}

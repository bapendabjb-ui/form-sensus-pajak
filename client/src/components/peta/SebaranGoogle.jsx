import { useEffect, useRef, useState } from "react";
import { muatGoogleMaps, tandaiGoogleGagal } from "../../lib/googleMaps.js";
import { PUSAT_AWAL, PetaMemuat, WARNA_STATUS, isiBalon } from "./bersama.jsx";

/**
 * Mesin Google untuk Peta Sensus: seluruh titik hasil sensus, hanya untuk
 * dilihat. Tampilannya mengikuti SebaranLeaflet - warna menurut status kertas
 * kerja, titik GPS terekam otomatis digambar berlubang.
 *
 * kunci  : kunci Maps JavaScript API dari /api/konfigurasi
 * titik  : [{ entriId, lat, lon, judul, formulir, nomor, status, sumber, ... }]
 * onBuka : (titik) => void  - dipanggil saat tombol di balon diklik
 * jenis  : "peta" | "satelit"
 */

const TIPE = { peta: "roadmap", satelit: "hybrid" };
const ZOOM_MAKS_RAPAT = 17;

/** Lingkaran berwarna; berlubang untuk posisi yang terekam otomatis. */
function ikonTitik(lib, t) {
  const warna = WARNA_STATUS[t.status === "selesai" ? "selesai" : "draft"];
  const rekam = t.sumber === "gps";
  return {
    path: lib.SymbolPath.CIRCLE,
    scale: 7,
    fillColor: warna,
    fillOpacity: rekam ? 0 : 1,
    strokeColor: rekam ? warna : "#ffffff",
    strokeWeight: rekam ? 3 : 2,
  };
}

export default function SebaranGoogle({ kunci, titik = [], onBuka, jenis }) {
  const wadah = useRef(null);
  const peta = useRef(null);
  const balon = useRef(null);
  const penanda = useRef([]);
  const g = useRef(null);
  const bukaRef = useRef(onBuka);
  bukaRef.current = onBuka;
  const [siap, setSiap] = useState(false);

  // Buat peta sekali.
  useEffect(() => {
    let batal = false;
    muatGoogleMaps(kunci)
      .then((lib) => {
        if (batal) return;
        try {
          g.current = lib;
          peta.current = new lib.Map(wadah.current, {
            center: { lat: PUSAT_AWAL.lat, lng: PUSAT_AWAL.lon },
            zoom: 12,
            mapTypeId: TIPE[jenis],
            disableDefaultUI: true,
            zoomControl: true,
            fullscreenControl: true,
            gestureHandling: "greedy",
            clickableIcons: false,
          });
          balon.current = new lib.InfoWindow();
          setSiap(true);
        } catch (e) {
          tandaiGoogleGagal(`peta tidak dapat dibuat: ${e.message}`);
        }
      })
      .catch(() => {
        // Sudah ditandai gagal; PetaSebaran beralih ke peta cadangan.
      });
    return () => {
      batal = true;
      for (const p of penanda.current) p.setMap(null);
      penanda.current = [];
      if (balon.current) balon.current.close();
      if (peta.current && g.current) g.current.event.clearInstanceListeners(peta.current);
      peta.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (peta.current) peta.current.setMapTypeId(TIPE[jenis]);
  }, [jenis, siap]);

  // Gambar ulang titik setiap daftarnya berubah (mis. saringan diganti).
  useEffect(() => {
    const m = peta.current;
    const lib = g.current;
    if (!m || !lib) return;

    for (const p of penanda.current) p.setMap(null);
    balon.current.close();

    penanda.current = titik.map((t) => {
      const p = new lib.Marker({ map: m, position: { lat: t.lat, lng: t.lon }, icon: ikonTitik(lib, t), title: t.judul || t.formulir });
      p.addListener("click", () => {
        const isi = document.createElement("div");
        isi.innerHTML = isiBalon(t); // semua teks sudah di-escape di isiBalon
        const tombol = isi.querySelector(".fk-balon-buka");
        if (tombol) tombol.onclick = () => bukaRef.current?.(t);
        balon.current.setContent(isi);
        balon.current.open({ map: m, anchor: p });
      });
      return p;
    });

    // Rapatkan pandangan ke titik yang ada. Satu titik tidak punya rentang,
    // jadi fitBounds akan memperbesar habis-habisan - pakai setCenter.
    if (titik.length === 1) {
      m.setCenter({ lat: titik[0].lat, lng: titik[0].lon });
      m.setZoom(ZOOM_MAKS_RAPAT);
    } else if (titik.length > 1) {
      const batas = new lib.LatLngBounds();
      for (const t of titik) batas.extend({ lat: t.lat, lng: t.lon });
      m.fitBounds(batas, 40);
      lib.event.addListenerOnce(m, "idle", () => {
        if (m.getZoom() > ZOOM_MAKS_RAPAT) m.setZoom(ZOOM_MAKS_RAPAT);
      });
    }
  }, [titik, siap]);

  return (
    <div className="fk-peta is-sebaran">
      <div className="fk-peta-kanvas" ref={wadah} />
      {!siap && <PetaMemuat />}
    </div>
  );
}

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
 * onCek  : (titik) => void | null  - admin: tombol "sudah dicek" di balon
 * kunciPandang : pandangan dirapatkan ulang hanya bila nilai ini berganti
 * jenis  : "peta" | "satelit"
 */

const TIPE = { peta: "roadmap", satelit: "hybrid" };
const ZOOM_MAKS_RAPAT = 17;

/** Tanda centang di tengah titik yang sudah dicek admin. */
function labelTitik(t) {
  if (!t.dicek) return null;
  const warna = t.sumber === "gps" ? WARNA_STATUS[t.status === "selesai" ? "selesai" : "draft"] : "#ffffff";
  return { text: "✓", color: warna, fontSize: "10px", fontWeight: "700" };
}

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

export default function SebaranGoogle({ kunci, titik = [], onBuka, onCek = null, kunciPandang, jenis }) {
  const wadah = useRef(null);
  const peta = useRef(null);
  const balon = useRef(null);
  const penanda = useRef([]);
  const g = useRef(null);
  const bukaRef = useRef(onBuka);
  bukaRef.current = onBuka;
  const cekRef = useRef(onCek);
  cekRef.current = onCek;
  const pandangRef = useRef(Symbol("belum"));
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
      const p = new lib.Marker({
        map: m,
        position: { lat: t.lat, lng: t.lon },
        icon: ikonTitik(lib, t),
        label: labelTitik(t),
        title: t.judul || t.formulir,
      });
      p.addListener("click", () => {
        const isi = document.createElement("div");
        isi.innerHTML = isiBalon(t, { bisaCek: Boolean(cekRef.current) }); // semua teks sudah di-escape
        const buka = isi.querySelector(".fk-balon-buka");
        if (buka) buka.onclick = () => bukaRef.current?.(t);
        const cek = isi.querySelector(".fk-balon-cek");
        if (cek) {
          cek.onclick = () => {
            balon.current.close();
            cekRef.current?.(t);
          };
        }
        balon.current.setContent(isi);
        balon.current.open({ map: m, anchor: p });
      });
      return p;
    });

    // Rapatkan pandangan hanya saat tampilan / saringan berganti, bukan setiap
    // kali sebuah titik ditandai sudah dicek (lihat SebaranLeaflet).
    if (pandangRef.current === kunciPandang) return;
    pandangRef.current = kunciPandang;
    // Satu titik tidak punya rentang, jadi fitBounds akan memperbesar
    // habis-habisan - pakai setCenter.
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
  }, [titik, siap, kunciPandang]);

  return (
    <div className="fk-peta is-sebaran">
      <div className="fk-peta-kanvas" ref={wadah} />
      {!siap && <PetaMemuat />}
    </div>
  );
}

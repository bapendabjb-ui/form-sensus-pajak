import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { pasangUbin } from "../../lib/ubinPeta";
import { PUSAT_AWAL, isiBalon } from "./bersama.jsx";

/**
 * Mesin cadangan Peta Sensus (Leaflet + OpenStreetMap / Esri): banyak titik
 * sekaligus, hanya untuk dilihat. Dipakai bila peta Google tidak dikonfigurasi
 * atau gagal; legenda dan tombol jenis peta digambar oleh components/PetaSebaran.jsx.
 *
 * titik  : [{ entriId, lat, lon, judul, formulir, nomor, status, petugas, ... }]
 * onBuka : (titik) => void  - dipanggil saat tautan di balon diklik
 * jenis  : "peta" | "satelit"
 */

/**
 * Warna = status kertas kerja. Titik dari koordinat yang terekam otomatis
 * digambar berlubang supaya tidak tertukar dengan titik yang sengaja diukur
 * petugas lewat pertanyaan lokasi - ketelitiannya bisa jauh berbeda.
 */
const ikonTitik = (t) =>
  L.divIcon({
    className: `fk-titik is-${t.status === "selesai" ? "selesai" : "draft"}${t.sumber === "gps" ? " is-rekam" : ""}`,
    html: '<span class="fk-titik-isi"></span>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

export default function SebaranLeaflet({ titik = [], onBuka, jenis }) {
  const wadah = useRef(null);
  const peta = useRef(null);
  const ubin = useRef(null);
  const lapisanTitik = useRef(null);
  const bukaRef = useRef(onBuka);
  bukaRef.current = onBuka;

  // Buat peta sekali.
  useEffect(() => {
    const m = L.map(wadah.current, { center: [PUSAT_AWAL.lat, PUSAT_AWAL.lon], zoom: 12 });
    peta.current = m;
    lapisanTitik.current = L.layerGroup().addTo(m);

    const t = setTimeout(() => m.invalidateSize(), 60);
    return () => {
      clearTimeout(t);
      m.remove();
      peta.current = null;
      ubin.current = null;
      lapisanTitik.current = null;
    };
  }, []);

  // Ganti lapisan peta jalan / satelit. Sumber ubin dipilih di lib/ubinPeta.js:
  // pemasangan bisa tertunda sesaat saat sumber peta jalan diuji lebih dulu.
  useEffect(() => {
    const m = peta.current;
    if (!m) return;
    const batalkan = pasangUbin(L, m, jenis, (l) => (ubin.current = l), ubin.current);
    return batalkan;
  }, [jenis]);

  // Gambar ulang titik setiap daftarnya berubah (mis. saringan diganti).
  useEffect(() => {
    const m = peta.current;
    const grup = lapisanTitik.current;
    if (!m || !grup) return;

    grup.clearLayers();
    for (const t of titik) {
      const penanda = L.marker([t.lat, t.lon], { icon: ikonTitik(t) }).bindPopup(isiBalon(t));
      // Tombol di dalam balon baru ada di DOM setelah balon terbuka.
      penanda.on("popupopen", (e) => {
        const tombol = e.popup.getElement()?.querySelector(".fk-balon-buka");
        if (tombol) tombol.onclick = () => bukaRef.current?.(t);
      });
      grup.addLayer(penanda);
    }

    // Rapatkan pandangan ke titik yang ada. Satu titik tidak punya rentang,
    // jadi fitBounds akan mengecilkan peta habis-habisan - pakai setView.
    if (titik.length === 1) {
      m.setView([titik[0].lat, titik[0].lon], 17);
    } else if (titik.length > 1) {
      m.fitBounds(L.latLngBounds(titik.map((t) => [t.lat, t.lon])), { padding: [40, 40], maxZoom: 17 });
    }
  }, [titik]);

  return <div className="fk-peta is-sebaran" ref={wadah} />;
}

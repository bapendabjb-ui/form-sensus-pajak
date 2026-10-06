import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { pasangUbin } from "../../lib/ubinPeta";
import { PUSAT_AWAL, WARNA_SAYA, zoomAkurasi } from "./bersama.jsx";

/**
 * Mesin cadangan pemilih titik (Leaflet + OpenStreetMap / Esri): ketuk peta
 * atau geser penanda. Dipakai bila peta Google tidak dikonfigurasi atau gagal;
 * perkakas di atas peta digambar oleh components/PetaLokasi.jsx.
 *
 * Dimuat terpisah (React.lazy) supaya Leaflet hanya diunduh bila dipakai.
 * Potongan peta diambil dari internet, jadi peta butuh koneksi — pengambilan
 * lewat GPS tetap jalan tanpa peta.
 *
 * titik   : { lat, lon } | null
 * onPilih : (lat, lon) => void
 * jenis   : "peta" | "satelit"
 * posisiSaya : { lat, lon, akurasi } | null - titik biru posisi perangkat
 * pusatkan   : angka yang naik setiap kali peta perlu dipusatkan ke posisiSaya
 */

// Ikon HTML biasa: ikon gambar bawaan Leaflet tidak ikut terbawa oleh Vite.
const IKON_PIN = L.divIcon({
  className: "fk-pin",
  html: '<span class="fk-pin-kepala"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 34],
});

export default function LokasiLeaflet({ titik, onPilih, jenis, posisiSaya, pusatkan }) {
  const wadah = useRef(null);
  const peta = useRef(null);
  const penanda = useRef(null);
  const saya = useRef(null); // { titik, lingkar }
  const ubin = useRef(null);
  const pilihRef = useRef(onPilih);
  pilihRef.current = onPilih;

  /** Taruh / pindahkan penanda. Penanda bisa digeser; hasil geser dilaporkan. */
  const pasangPenanda = (latlng) => {
    if (penanda.current) {
      penanda.current.setLatLng(latlng);
      return;
    }
    penanda.current = L.marker(latlng, { icon: IKON_PIN, draggable: true, autoPan: true }).addTo(peta.current);
    penanda.current.on("dragend", () => {
      const ll = penanda.current.getLatLng();
      pilihRef.current(ll.lat, ll.lng);
    });
  };

  // Buat peta sekali; titik awal diambil dari nilai saat peta dibuka.
  useEffect(() => {
    const awal = titik ? [titik.lat, titik.lon] : [PUSAT_AWAL.lat, PUSAT_AWAL.lon];
    const m = L.map(wadah.current, { center: awal, zoom: titik ? 18 : 13 });
    peta.current = m;
    if (titik) pasangPenanda(awal);

    m.on("click", (e) => {
      pasangPenanda(e.latlng);
      pilihRef.current(e.latlng.lat, e.latlng.lng);
    });

    // Peta muncul di dalam kartu yang baru dibuka: ukur ulang setelah tata letak selesai.
    const t = setTimeout(() => m.invalidateSize(), 60);
    return () => {
      clearTimeout(t);
      m.remove();
      peta.current = null;
      penanda.current = null;
      saya.current = null;
      ubin.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ganti lapisan peta jalan / satelit. Sumber ubin dipilih di lib/ubinPeta.js:
  // pemasangan bisa tertunda sesaat saat sumber peta jalan diuji lebih dulu.
  useEffect(() => {
    const m = peta.current;
    if (!m) return;
    const batalkan = pasangUbin(L, m, jenis, (l) => (ubin.current = l), ubin.current);
    return batalkan;
  }, [jenis]);

  // Titik berubah dari luar (mis. GPS diambil saat peta terbuka, atau dihapus).
  useEffect(() => {
    const m = peta.current;
    if (!m) return;
    if (!titik) {
      if (penanda.current) {
        m.removeLayer(penanda.current);
        penanda.current = null;
      }
      return;
    }
    const ll = L.latLng(titik.lat, titik.lon);
    if (!penanda.current || !penanda.current.getLatLng().equals(ll)) pasangPenanda(ll);
    if (!m.getBounds().contains(ll)) m.setView(ll, Math.max(m.getZoom(), 17));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titik?.lat, titik?.lon]);

  // Titik biru lokasi saya, dengan lingkaran akurasinya. Tidak bisa diketuk:
  // ketukan di atasnya tetap menaruh titik sensus. Penanda titik sensus ada di
  // lapisan penanda, jadi selalu di atas titik biru.
  useEffect(() => {
    const m = peta.current;
    if (!m || !posisiSaya) return;
    const ll = L.latLng(posisiSaya.lat, posisiSaya.lon);
    const radius = posisiSaya.akurasi ?? 0;
    if (saya.current) {
      saya.current.titik.setLatLng(ll);
      saya.current.lingkar.setLatLng(ll).setRadius(radius);
      return;
    }
    saya.current = {
      lingkar: L.circle(ll, {
        radius,
        interactive: false,
        color: WARNA_SAYA,
        opacity: 0.35,
        weight: 1,
        fillColor: WARNA_SAYA,
        fillOpacity: 0.12,
      }).addTo(m),
      titik: L.circleMarker(ll, {
        radius: 8,
        interactive: false,
        color: "#fff",
        weight: 3,
        fillColor: WARNA_SAYA,
        fillOpacity: 1,
      }).addTo(m),
    };
  }, [posisiSaya]);

  useEffect(() => {
    const m = peta.current;
    if (!m || !pusatkan || !posisiSaya) return;
    m.setView([posisiSaya.lat, posisiSaya.lon], zoomAkurasi(posisiSaya.akurasi));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pusatkan]);

  return <div className="fk-peta" ref={wadah} />;
}

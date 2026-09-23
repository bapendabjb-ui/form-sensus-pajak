import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LAPISAN, pasangUbin } from "../lib/ubinPeta";

/**
 * Peta untuk memilih titik lokasi: ketuk peta atau geser penanda.
 *
 * Dimuat terpisah (React.lazy di LokasiInput) supaya Leaflet hanya diunduh
 * saat petugas benar-benar membuka peta. Potongan peta diambil dari internet,
 * jadi peta butuh koneksi — pengambilan lewat GPS tetap jalan tanpa peta.
 *
 * titik   : { lat, lon } | null
 * onPilih : (lat, lon) => void
 */

/** Pusat Kota Banjarbaru — titik awal bila belum ada koordinat. */
const PUSAT_AWAL = [-3.4572, 114.8105];

// Ikon HTML biasa: ikon gambar bawaan Leaflet tidak ikut terbawa oleh Vite.
const IKON_PIN = L.divIcon({
  className: "fk-pin",
  html: '<span class="fk-pin-kepala"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 34],
});

export default function PetaLokasi({ titik, onPilih }) {
  const wadah = useRef(null);
  const peta = useRef(null);
  const penanda = useRef(null);
  const ubin = useRef(null);
  const pilihRef = useRef(onPilih);
  pilihRef.current = onPilih;
  const [jenis, setJenis] = useState("peta");

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
    const awal = titik ? [titik.lat, titik.lon] : PUSAT_AWAL;
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

  return (
    <div className="fk-peta-wadah">
      <div className="fk-peta-alat">
        <span className="fk-hint-kecil">Ketuk peta atau geser penanda untuk menentukan titik.</span>
        <div className="fk-peta-jenis" role="radiogroup" aria-label="Jenis peta">
          {Object.entries(LAPISAN).map(([k, l]) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={jenis === k}
              className={jenis === k ? "is-on" : ""}
              onClick={() => setJenis(k)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div className="fk-peta" ref={wadah} />
    </div>
  );
}

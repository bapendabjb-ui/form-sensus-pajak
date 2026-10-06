import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// Plugin ini menempel pada window.L, yang dipasang oleh "leaflet" di atas -
// urutan impor ini penting.
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { pasangUbin } from "../../lib/ubinPeta";
import { PUSAT_AWAL, isiBalon, svgTitik, warnaTitik, svgKlaster, KLASTER_ZOOM_MAKS } from "./bersama.jsx";

/**
 * Mesin cadangan Peta Sensus (Leaflet + OpenStreetMap / Esri): banyak titik
 * sekaligus, hanya untuk dilihat. Dipakai bila peta Google tidak dikonfigurasi
 * atau gagal; legenda dan tombol jenis peta digambar oleh components/PetaSebaran.jsx.
 *
 * titik  : [{ entriId, lat, lon, judul, formulir, nomor, status, petugas, ... }]
 * onBuka : (titik) => void  - dipanggil saat tautan di balon diklik
 * onCek  : (titik) => void | null  - admin: tombol "sudah dicek" di balon
 * kunciPandang : pandangan dirapatkan ulang hanya bila nilai ini berganti
 *                (tampilan / saringan), bukan setiap titik berubah tanda
 * jenis  : "peta" | "satelit"
 */

/**
 * Warna = status kertas kerja. Titik dari koordinat yang terekam otomatis
 * digambar berlubang supaya tidak tertukar dengan titik yang sengaja diukur
 * petugas lewat pertanyaan lokasi - ketelitiannya bisa jauh berbeda.
 */
const ikonTitik = (t) => {
  const { svg, ukuran } = svgTitik({ warna: warnaTitik(t), berlubang: t.sumber === "gps", dicek: t.dicek });
  return L.divIcon({
    className: `fk-titik${t.dicek ? " is-dicek" : ""}`,
    html: svg,
    iconSize: [ukuran, ukuran],
    iconAnchor: [ukuran / 2, ukuran / 2],
  });
};

export default function SebaranLeaflet({ titik = [], onBuka, onCek = null, kunciPandang, jenis }) {
  const wadah = useRef(null);
  const peta = useRef(null);
  const ubin = useRef(null);
  const lapisanTitik = useRef(null);
  const bukaRef = useRef(onBuka);
  bukaRef.current = onBuka;
  const cekRef = useRef(onCek);
  cekRef.current = onCek;
  const pandangRef = useRef(Symbol("belum"));

  // Buat peta sekali.
  useEffect(() => {
    // maxZoom ditetapkan di sini, bukan menunggu lapisan ubin: lapisan itu
    // dipasang belakangan (lib/ubinPeta.js menguji OSM dulu), sedangkan
    // pengelompok titik langsung membutuhkan batas zoom peta.
    const m = L.map(wadah.current, { center: [PUSAT_AWAL.lat, PUSAT_AWAL.lon], zoom: 12, maxZoom: 19 });
    peta.current = m;
    // Kelompok titik: hanya yang terlihat yang digambar, zoom tetap ringan.
    lapisanTitik.current = L.markerClusterGroup({
      maxClusterRadius: 50,
      disableClusteringAtZoom: KLASTER_ZOOM_MAKS + 1,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: false,
      chunkedLoading: true,
      iconCreateFunction: (kelompok) => {
        const { svg, ukuran } = svgKlaster(kelompok.getChildCount());
        return L.divIcon({ className: "fk-klaster", html: svg, iconSize: [ukuran, ukuran], iconAnchor: [ukuran / 2, ukuran / 2] });
      },
    }).addTo(m);

    const t = setTimeout(() => m.invalidateSize(), 60);
    // Ukuran wadah berubah tanpa jendela berubah (mis. layar penuh): Leaflet
    // tidak tahu sendiri, potongan petanya jadi terpotong.
    const amati = new ResizeObserver(() => m.invalidateSize());
    amati.observe(wadah.current);
    return () => {
      clearTimeout(t);
      amati.disconnect();
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
    const semua = [];
    for (const t of titik) {
      const penanda = L.marker([t.lat, t.lon], { icon: ikonTitik(t) }).bindPopup(
        isiBalon(t, { bisaCek: Boolean(cekRef.current) })
      );
      // Tombol di dalam balon baru ada di DOM setelah balon terbuka.
      penanda.on("popupopen", (e) => {
        const el = e.popup.getElement();
        const buka = el?.querySelector(".fk-balon-buka");
        if (buka) buka.onclick = () => bukaRef.current?.(t);
        const cek = el?.querySelector(".fk-balon-cek");
        if (cek) {
          cek.onclick = () => {
            m.closePopup();
            cekRef.current?.(t);
          };
        }
      });
      semua.push(penanda);
    }
    // Sekaligus, bukan satu per satu: kelompoknya dihitung sekali saja.
    grup.addLayers(semua);

    // Rapatkan pandangan ke titik yang ada - hanya saat tampilan / saringan
    // berganti. Menandai sudah dicek mengubah daftar titik juga, dan pandangan
    // yang melompat setiap kali akan membuat admin kehilangan wilayah kerjanya.
    if (pandangRef.current === kunciPandang) return;
    pandangRef.current = kunciPandang;
    // Satu titik tidak punya rentang, jadi fitBounds akan mengecilkan peta
    // habis-habisan - pakai setView.
    if (titik.length === 1) {
      m.setView([titik[0].lat, titik[0].lon], 17);
    } else if (titik.length > 1) {
      m.fitBounds(L.latLngBounds(titik.map((t) => [t.lat, t.lon])), { padding: [40, 40], maxZoom: 17 });
    }
  }, [titik, kunciPandang]);

  return <div className="fk-peta is-sebaran" ref={wadah} />;
}

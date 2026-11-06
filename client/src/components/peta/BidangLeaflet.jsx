import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { pasangUbin } from "../../lib/ubinPeta";
import { PUSAT_AWAL, WARNA_SAYA, zoomAkurasi, gayaTerpilih } from "./bersama.jsx";
import { PERSIL_ZOOM_MIN, dengarPetak, statusPersil } from "../../lib/persilBpn.js";
import { LapisanUbinPersil, aturUbinPersil } from "./ubinPersilLeaflet.js";

/**
 * Mesin cadangan pemilih bidang BPN (Leaflet + OpenStreetMap / Esri). Props
 * sama dengan BidangGoogle.
 */

const IKON_PIN = L.divIcon({
  className: "fk-pin",
  html: '<span class="fk-pin-kepala"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 34],
});

export default function BidangLeaflet({
  persil,
  jenis,
  titik,
  terpilih = [],
  fokus = null,
  onKetuk,
  posisiSaya,
  pusatkan,
  onStatusPersil,
}) {
  const wadah = useRef(null);
  const peta = useRef(null);
  const ubinDasar = useRef(null);
  const ubin = useRef(null); // { ubin: LapisanUbinPersil, kunci }
  const kanvas = useRef(null);
  const sorot = useRef(null);
  const penanda = useRef(null);
  const saya = useRef(null);
  const ketukRef = useRef(onKetuk);
  ketukRef.current = onKetuk;
  const persilRef = useRef(persil);
  persilRef.current = persil;
  const statusRef = useRef(onStatusPersil);
  statusRef.current = onStatusPersil;

  const lapor = () => {
    if (peta.current) statusRef.current?.(statusPersil({ aktif: Boolean(persilRef.current), zoom: peta.current.getZoom() }));
  };
  const laporRef = useRef(lapor);
  laporRef.current = lapor;

  useEffect(() => {
    const awal = titik ? [titik.lat, titik.lon] : [PUSAT_AWAL.lat, PUSAT_AWAL.lon];
    const m = L.map(wadah.current, { center: awal, zoom: titik ? 18 : 13, maxZoom: 19 });
    peta.current = m;
    kanvas.current = L.canvas({ padding: 0.5 });
    ubin.current = {
      ubin: new LapisanUbinPersil({ minZoom: PERSIL_ZOOM_MIN, maxZoom: 22, zIndex: 5, updateWhenZooming: false }),
      kunci: "",
    };
    m.on("click", (e) => ketukRef.current?.(e.latlng.lat, e.latlng.lng));
    m.on("zoomend", () => laporRef.current());
    const t = setTimeout(() => m.invalidateSize(), 60);
    const amati = new ResizeObserver(() => m.invalidateSize());
    amati.observe(wadah.current);
    return () => {
      clearTimeout(t);
      amati.disconnect();
      m.remove();
      peta.current = null;
      ubinDasar.current = null;
      ubin.current = null;
      kanvas.current = null;
      sorot.current = null;
      penanda.current = null;
      saya.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = peta.current;
    if (!m) return;
    return pasangUbin(L, m, jenis, (l) => (ubinDasar.current = l), ubinDasar.current);
  }, [jenis]);

  useEffect(() => {
    const m = peta.current;
    if (!m || !ubin.current) return;
    aturUbinPersil(m, ubin.current, persil, jenis);
    lapor();
     
  }, [persil, jenis]);

  useEffect(() => dengarPetak(() => laporRef.current()), []);

  // Bidang terpilih disorot. Tidak menangkap ketukan: ketukannya sampai ke peta
  // dan membatalkan pilihan.
  useEffect(() => {
    const m = peta.current;
    if (!m) return;
    if (sorot.current) sorot.current.remove();
    const gaya = gayaTerpilih(jenis);
    sorot.current = L.geoJSON(
      terpilih.map((b) => b.fitur),
      {
        renderer: kanvas.current,
        interactive: false,
        style: { color: gaya.garis, weight: 3.5, opacity: 1, fillColor: gaya.isi, fillOpacity: gaya.isiTembus },
      }
    ).addTo(m);
  }, [terpilih, jenis]);

  useEffect(() => {
    const m = peta.current;
    if (!m || !fokus) return;
    const [barat, selatan, timur, utara] = fokus.batas;
    m.fitBounds(
      [
        [selatan, barat],
        [utara, timur],
      ],
      { padding: [60, 60], maxZoom: 18 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fokus?.ke]);

  useEffect(() => {
    const m = peta.current;
    if (!m) return;
    if (!titik) {
      if (penanda.current) penanda.current.remove();
      penanda.current = null;
      return;
    }
    const ll = L.latLng(titik.lat, titik.lon);
    if (penanda.current) penanda.current.setLatLng(ll);
    else penanda.current = L.marker(ll, { icon: IKON_PIN, interactive: false, title: "Titik Lokasi objek" }).addTo(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titik?.lat, titik?.lon]);

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
    m.setView([posisiSaya.lat, posisiSaya.lon], Math.max(zoomAkurasi(posisiSaya.akurasi), 18));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pusatkan]);

  return <div className="fk-peta" ref={wadah} />;
}

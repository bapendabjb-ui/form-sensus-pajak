import { useEffect, useRef, useState } from "react";
import { muatGoogleMaps, tandaiGoogleGagal } from "../../lib/googleMaps.js";
import { PUSAT_AWAL, PetaMemuat, WARNA_SAYA, zoomAkurasi, gayaTerpilih } from "./bersama.jsx";
import { dengarPetak, statusPersil } from "../../lib/persilBpn.js";
import { pasangUbinPersil } from "./ubinPersilGoogle.js";

/**
 * Mesin Google untuk pemilih bidang BPN di formulir (components/PetaBidang.jsx):
 * persil BPN digambar sebagai ubin kanvas, ketukan di peta dilaporkan ke
 * pemanggil (yang mencari bidang di titik itu), dan bidang yang sudah dipilih
 * disorot. Perilakunya sama dengan BidangLeaflet.
 *
 * kunci    : kunci Maps JavaScript API
 * persil   : usePersilBpn({ paksa: true }).peta | null
 * jenis    : "peta" | "satelit"
 * titik    : { lat, lon } | null - titik Lokasi objek (penanda, tidak bisa digeser)
 * terpilih : [{ kunci, fitur }] - bidang terpilih yang bentuknya sudah diketahui
 * fokus    : { batas: [barat, selatan, timur, utara], ke } | null - rapatkan pandangan setiap `ke` berganti
 * onKetuk  : (lat, lon) => void
 * posisiSaya, pusatkan : lihat lib/useLokasiSaya.js
 * onGeser  : () => void - petugas menggeser peta (berhenti mengikuti lokasi saya)
 * onStatusPersil : (status) => void - lib/persilBpn.js statusPersil
 */

const TIPE = { peta: "roadmap", satelit: "hybrid" };

export default function BidangGoogle({
  kunci,
  persil,
  jenis,
  titik,
  terpilih = [],
  fokus = null,
  onKetuk,
  posisiSaya,
  pusatkan,
  onGeser,
  onStatusPersil,
}) {
  const wadah = useRef(null);
  const peta = useRef(null);
  const g = useRef(null);
  const ubin = useRef({ ubin: null, kunci: "" });
  const sorot = useRef(null);
  const penanda = useRef(null);
  const saya = useRef(null);
  const ketukRef = useRef(onKetuk);
  ketukRef.current = onKetuk;
  const geserRef = useRef(onGeser);
  geserRef.current = onGeser;
  const persilRef = useRef(persil);
  persilRef.current = persil;
  const statusRef = useRef(onStatusPersil);
  statusRef.current = onStatusPersil;
  const [siap, setSiap] = useState(false);

  const lapor = () => {
    if (peta.current) statusRef.current?.(statusPersil({ aktif: Boolean(persilRef.current), zoom: peta.current.getZoom() }));
  };
  const laporRef = useRef(lapor);
  laporRef.current = lapor;

  // Buat peta sekali; pusat awal dari titik Lokasi bila ada.
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
            disableDefaultUI: true,
            zoomControl: true,
            zoomControlOptions: { position: lib.ControlPosition.RIGHT_TOP },
            gestureHandling: "greedy",
            clickableIcons: false,
            tilt: 0,
          });
          peta.current = m;
          sorot.current = new lib.Data({ map: m });
          // Ketukan pada bidang terpilih = ketukan di peta (membatalkan pilihannya).
          sorot.current.addListener("click", (e) => ketukRef.current?.(e.latLng.lat(), e.latLng.lng()));
          m.addListener("click", (e) => ketukRef.current?.(e.latLng.lat(), e.latLng.lng()));
          m.addListener("dragstart", () => geserRef.current?.());
          m.addListener("zoom_changed", () => laporRef.current());
          setSiap(true);
        } catch (e) {
          tandaiGoogleGagal(`peta tidak dapat dibuat: ${e.message}`);
        }
      })
      .catch(() => {
        // Sudah ditandai gagal; PetaBidang beralih ke peta cadangan.
      });
    return () => {
      batal = true;
      if (sorot.current) sorot.current.setMap(null);
      if (penanda.current) penanda.current.setMap(null);
      if (saya.current) {
        saya.current.titik.setMap(null);
        saya.current.lingkar.setMap(null);
      }
      if (peta.current && g.current) g.current.event.clearInstanceListeners(peta.current);
      peta.current = null;
      sorot.current = null;
      penanda.current = null;
      saya.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (peta.current) peta.current.setMapTypeId(TIPE[jenis]);
  }, [jenis, siap]);

  // Lapisan ubin persil.
  useEffect(() => {
    const m = peta.current;
    if (!m || !g.current) return;
    pasangUbinPersil(g.current, m, ubin.current, persil, jenis);
    lapor();
     
  }, [persil, jenis, siap]);

  useEffect(() => dengarPetak(() => laporRef.current()), []);

  // Bidang terpilih disorot.
  useEffect(() => {
    const d = sorot.current;
    if (!d) return;
    d.forEach((f) => d.remove(f));
    const gaya = gayaTerpilih(jenis);
    d.setStyle({ strokeColor: gaya.garis, strokeOpacity: 1, strokeWeight: 3.5, fillColor: gaya.isi, fillOpacity: gaya.isiTembus, zIndex: 2 });
    for (const b of terpilih) {
      try {
        d.addGeoJson(b.fitur);
      } catch {
        // Bentuk yang ditolak Google tidak menggagalkan peta.
      }
    }
  }, [terpilih, jenis, siap]);

  // Rapatkan pandangan ke bidang (mis. hasil cari NIB).
  useEffect(() => {
    const m = peta.current;
    const lib = g.current;
    if (!m || !lib || !fokus) return;
    const [barat, selatan, timur, utara] = fokus.batas;
    m.fitBounds(new lib.LatLngBounds({ lat: selatan, lng: barat }, { lat: utara, lng: timur }), 60);
    lib.event.addListenerOnce(m, "idle", () => {
      if (m.getZoom() > 19) m.setZoom(19);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fokus?.ke, siap]);

  // Penanda titik Lokasi objek: hanya acuan, ketukan di atasnya tetap memilih bidang.
  useEffect(() => {
    const m = peta.current;
    const lib = g.current;
    if (!m || !lib) return;
    if (!titik) {
      if (penanda.current) penanda.current.setMap(null);
      penanda.current = null;
      return;
    }
    const posisi = { lat: titik.lat, lng: titik.lon };
    if (penanda.current) penanda.current.setPosition(posisi);
    else penanda.current = new lib.Marker({ map: m, position: posisi, clickable: false, zIndex: 3, title: "Titik Lokasi objek" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titik?.lat, titik?.lon, siap]);

  // Titik biru lokasi saya.
  useEffect(() => {
    const m = peta.current;
    const lib = g.current;
    if (!m || !lib) return;
    if (!posisiSaya) {
      // Posisi terlalu kasar / hilang: titik biru dilepas (lib/useLokasiSaya.js posisiPeta).
      if (saya.current) {
        saya.current.titik.setMap(null);
        saya.current.lingkar.setMap(null);
        saya.current = null;
      }
      return;
    }
    const posisi = { lat: posisiSaya.lat, lng: posisiSaya.lon };
    const radius = posisiSaya.akurasi ?? 0;
    if (saya.current) {
      saya.current.titik.setPosition(posisi);
      saya.current.lingkar.setCenter(posisi);
      saya.current.lingkar.setRadius(radius);
      return;
    }
    saya.current = {
      lingkar: new lib.Circle({
        map: m,
        center: posisi,
        radius,
        clickable: false,
        strokeColor: WARNA_SAYA,
        strokeOpacity: 0.35,
        strokeWeight: 1,
        fillColor: WARNA_SAYA,
        fillOpacity: 0.12,
      }),
      titik: new lib.Marker({
        map: m,
        position: posisi,
        clickable: false,
        zIndex: 1,
        icon: { path: lib.SymbolPath.CIRCLE, scale: 8, fillColor: WARNA_SAYA, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 },
      }),
    };
  }, [posisiSaya, siap]);

  useEffect(() => {
    const m = peta.current;
    if (!m || !pusatkan || !posisiSaya) return;
    m.setZoom(Math.max(zoomAkurasi(posisiSaya.akurasi), 18));
    m.panTo({ lat: posisiSaya.lat, lng: posisiSaya.lon });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pusatkan, siap]);

  return (
    <div className="fk-peta">
      <div className="fk-peta-kanvas" ref={wadah} />
      {!siap && <PetaMemuat />}
    </div>
  );
}

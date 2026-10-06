import { useEffect, useRef, useState } from "react";
import { muatGoogleMaps, tandaiGoogleGagal } from "../../lib/googleMaps.js";
import { PUSAT_AWAL, PetaMemuat, WARNA_SAYA, zoomAkurasi } from "./bersama.jsx";

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
 * posisiSaya : { lat, lon, akurasi } | null - titik biru posisi perangkat
 * pusatkan   : angka yang naik setiap kali peta perlu dipusatkan ke posisiSaya
 */

/** Satelit memakai "hybrid" supaya nama jalan tetap terbaca di atas citra. */
const TIPE = { peta: "roadmap", satelit: "hybrid" };

export default function LokasiGoogle({ kunci, titik, onPilih, jenis, posisiSaya, pusatkan }) {
  const wadah = useRef(null);
  const peta = useRef(null);
  const penanda = useRef(null);
  const saya = useRef(null); // { titik, lingkar }
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
    penanda.current = new g.current.Marker({ map: peta.current, position: posisi, draggable: true, zIndex: 2 });
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
            // Pojok kanan bawah dipakai tombol "Lokasi saya".
            zoomControlOptions: { position: lib.ControlPosition.RIGHT_TOP },
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
      if (saya.current) {
        saya.current.titik.setMap(null);
        saya.current.lingkar.setMap(null);
      }
      if (peta.current && g.current) g.current.event.clearInstanceListeners(peta.current);
      peta.current = null;
      penanda.current = null;
      saya.current = null;
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

  // Titik biru lokasi saya, dengan lingkaran akurasinya. Tidak bisa diketuk:
  // ketukan di atasnya tetap menaruh titik sensus.
  useEffect(() => {
    const m = peta.current;
    if (!m || !posisiSaya) return;
    const posisi = { lat: posisiSaya.lat, lng: posisiSaya.lon };
    const radius = posisiSaya.akurasi ?? 0;
    if (saya.current) {
      saya.current.titik.setPosition(posisi);
      saya.current.lingkar.setCenter(posisi);
      saya.current.lingkar.setRadius(radius);
      return;
    }
    const lib = g.current;
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
        icon: {
          path: lib.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: WARNA_SAYA,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 3,
        },
      }),
    };
  }, [posisiSaya, siap]);

  useEffect(() => {
    const m = peta.current;
    if (!m || !pusatkan || !posisiSaya) return;
    m.setZoom(zoomAkurasi(posisiSaya.akurasi));
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

import { useEffect, useRef, useState } from "react";
import { MarkerClusterer, SuperClusterViewportAlgorithm } from "@googlemaps/markerclusterer";
import { muatGoogleMaps, tandaiGoogleGagal } from "../../lib/googleMaps.js";
import { PUSAT_AWAL, PetaMemuat, isiBalon, svgTitik, warnaTitik, svgKlaster, KLASTER_ZOOM_MAKS } from "./bersama.jsx";

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

/** Ikon Google dari gambar SVG bersama (lihat svgTitik / svgKlaster). */
function ikonSvg(lib, { svg, ukuran }) {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new lib.Size(ukuran, ukuran),
    anchor: new lib.Point(ukuran / 2, ukuran / 2),
  };
}

/** Gambar titik yang sama dengan peta cadangan. */
const ikonTitik = (lib, t) =>
  ikonSvg(lib, svgTitik({ warna: warnaTitik(t), berlubang: t.sumber === "gps", dicek: t.dicek }));

/**
 * Pengelompok titik: hanya titik di layar yang digambar, dan titik berdekatan
 * menjadi satu lingkaran berangka sampai KLASTER_ZOOM_MAKS. Bila pustakanya
 * gagal, peta tetap jalan dengan titik biasa (null).
 */
function buatPengelompok(lib, peta) {
  try {
    return new MarkerClusterer({
      map: peta,
      algorithm: new SuperClusterViewportAlgorithm({ maxZoom: KLASTER_ZOOM_MAKS, radius: 60, viewportPadding: 80 }),
      renderer: {
        render: ({ count, position }) =>
          new lib.Marker({ position, icon: ikonSvg(lib, svgKlaster(count)), zIndex: 1000 + count }),
      },
    });
  } catch (e) {
    console.warn("[Sensus Pajak] pengelompokan titik tidak tersedia:", e.message);
    return null;
  }
}

export default function SebaranGoogle({ kunci, titik = [], onBuka, onCek = null, kunciPandang, jenis }) {
  const wadah = useRef(null);
  const peta = useRef(null);
  const balon = useRef(null);
  const penanda = useRef([]);
  const kelompok = useRef(null);
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
            // Layar penuh memakai tombol aplikasi sendiri (PetaSebaran), sama
            // untuk peta cadangan, dan legenda serta tombol jenis peta ikut terbawa.
            fullscreenControl: false,
            gestureHandling: "greedy",
            clickableIcons: false,
          });
          balon.current = new lib.InfoWindow();
          kelompok.current = buatPengelompok(lib, peta.current);
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
      if (kelompok.current) {
        kelompok.current.clearMarkers();
        kelompok.current.setMap(null);
        kelompok.current = null;
      }
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

    if (kelompok.current) kelompok.current.clearMarkers(true);
    for (const p of penanda.current) p.setMap(null);
    balon.current.close();

    penanda.current = titik.map((t) => {
      const p = new lib.Marker({
        // Dengan pengelompok, pengelompoklah yang memasang titik ke peta.
        map: kelompok.current ? null : m,
        position: { lat: t.lat, lng: t.lon },
        icon: ikonTitik(lib, t),
        title: t.judul || t.formulir,
        // Yang sudah dicek digambar di atas, supaya tidak tertutup titik lain.
        zIndex: t.dicek ? 2 : 1,
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
    if (kelompok.current) kelompok.current.addMarkers(penanda.current);

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

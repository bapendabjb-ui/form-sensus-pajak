import { useEffect, useRef, useState } from "react";
import { MarkerClusterer, SuperClusterViewportAlgorithm } from "@googlemaps/markerclusterer";
import { muatGoogleMaps, tandaiGoogleGagal } from "../../lib/googleMaps.js";
import {
  PUSAT_AWAL,
  PetaMemuat,
  isiBalon,
  svgTitik,
  warnaTitik,
  svgKlaster,
  KLASTER_ZOOM_MAKS,
  isiBalonLapisan,
  isiBalonPersil,
  gayaLapisan,
  TITIK_LAPISAN_RADIUS,
} from "./bersama.jsx";
import { WARNA_PERSIL, PERSIL_ZOOM_MIN, PemuatPersil, statusPersil } from "../../lib/persilBpn.js";

/**
 * Mesin Google untuk Peta Sensus: seluruh titik hasil sensus, hanya untuk
 * dilihat. Tampilannya mengikuti SebaranLeaflet - warna menurut status kertas
 * kerja.
 *
 * kunci  : kunci Maps JavaScript API dari /api/konfigurasi
 * titik  : [{ entriId, lat, lon, judul, formulir, nomor, status, sumber, ... }]
 * onBuka : (titik) => void  - dipanggil saat tombol di balon diklik
 * onCek  : (titik) => void | null  - admin: tombol "sudah dicek" di balon
 * kunciPandang : pandangan dirapatkan ulang hanya bila nilai ini berganti
 * jenis  : "peta" | "satelit"
 * lapisan : [{ versi, nama, warna, data }] - lapisan GIS yang menyala (lib/lapisanPeta.js),
 *           digambar di bawah titik sensus
 * persil : { versi, ukuranPetak } | null - persil BPN (lib/persilBpn.js usePersilBpn().peta);
 *          dimuat per petak hanya saat peta diperbesar
 * sorot  : { fitur, batas: [barat, selatan, timur, utara] } | null - bidang hasil cari NIB:
 *          disorot, peta dirapatkan ke sana, dan balonnya dibuka
 * onStatusPersil : (status) => void - "", "perbesar", "memuat", "galat" (lib/persilBpn.js statusPersil)
 */

const TIPE = { peta: "roadmap", satelit: "hybrid" };

/** Kunci gambar sebuah lapisan: berganti bila isi, nama, atau warnanya berganti. */
const kunciLapisan = (l) => `${l.versi}|${l.warna}|${l.nama}`;

/** Satu lapisan GIS sebagai google.maps.Data; ketukan pada bidangnya membuka balon atribut. */
function buatLapisanGis(lib, peta, balon, l) {
  const g = gayaLapisan(l.warna);
  const d = new lib.Data({ map: peta });
  d.addGeoJson(l.data);
  d.setStyle({
    strokeColor: g.garis,
    strokeWeight: g.tebal,
    strokeOpacity: 0.9,
    fillColor: g.isi,
    fillOpacity: g.isiTembus,
    // Hanya berlaku untuk titik.
    icon: {
      path: lib.SymbolPath.CIRCLE,
      scale: TITIK_LAPISAN_RADIUS,
      fillColor: g.isi,
      fillOpacity: 0.95,
      strokeColor: "#fff",
      strokeWeight: 1.5,
    },
  });
  d.addListener("click", (e) => {
    const properti = {};
    e.feature.forEachProperty((v, k) => {
      properti[k] = v;
    });
    const isi = document.createElement("div");
    isi.innerHTML = isiBalonLapisan(l.nama, properti); // semua teks sudah di-escape
    balon.setContent(isi);
    balon.setPosition(e.latLng);
    balon.open({ map: peta });
  });
  return d;
}
const ZOOM_MAKS_RAPAT = 17;

/** Atribut sebuah fitur google.maps.Data sebagai objek biasa. */
function propertiFitur(f) {
  const p = {};
  f.forEachProperty((v, k) => {
    p[k] = v;
  });
  return p;
}

/** Balon keterangan bidang persil di sebuah posisi. */
function bukaBalonPersil(balon, peta, posisi, properti) {
  const isi = document.createElement("div");
  isi.innerHTML = isiBalonPersil(properti); // semua teks sudah di-escape
  balon.setContent(isi);
  balon.setPosition(posisi);
  balon.open({ map: peta });
}

/**
 * Lapisan persil BPN: bidang-bidang petak yang terlihat (dimuat PemuatPersil)
 * dan bidang yang disorot hasil cari NIB.
 */
function buatLapisanPersil(lib, peta, balon, onStatus) {
  const gaya = { strokeColor: WARNA_PERSIL, strokeOpacity: 0.85, fillColor: WARNA_PERSIL };
  const data = new lib.Data({ map: null });
  data.setStyle({ ...gaya, strokeWeight: 1, fillOpacity: 0.04, zIndex: 0 });
  const sorot = new lib.Data({ map: peta });
  sorot.setStyle({ ...gaya, strokeOpacity: 1, strokeWeight: 4, fillOpacity: 0.22, zIndex: 1 });
  for (const d of [data, sorot]) {
    d.addListener("click", (e) => bukaBalonPersil(balon, peta, e.latLng, propertiFitur(e.feature)));
  }
  const pemuat = new PemuatPersil({
    tambah: (f) => data.addGeoJson(f),
    buang: (id) => {
      const f = data.getFeatureById(id);
      if (f) data.remove(f);
    },
    onStatus,
  });
  return { data, sorot, pemuat, tampak: false };
}

/** Sesuaikan persil dengan pandangan peta dan pilihan pemakai (`cfg` null = mati). */
function perbaruiPersil(peta, lp, cfg) {
  if (!cfg) {
    lp.tampak = false;
  } else {
    lp.pemuat.atur(cfg);
    const b = peta.getBounds();
    lp.tampak =
      Boolean(b) &&
      peta.getZoom() >= PERSIL_ZOOM_MIN &&
      lp.pemuat.tampilkan({
        barat: b.getSouthWest().lng(),
        selatan: b.getSouthWest().lat(),
        timur: b.getNorthEast().lng(),
        utara: b.getNorthEast().lat(),
      });
  }
  const sasaran = lp.tampak ? peta : null;
  if (lp.data.getMap() !== sasaran) lp.data.setMap(sasaran);
}

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
  ikonSvg(lib, svgTitik({ warna: warnaTitik(t), dicek: t.dicek }));

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

export default function SebaranGoogle({
  kunci,
  titik = [],
  onBuka,
  onCek = null,
  kunciPandang,
  jenis,
  lapisan = [],
  persil = null,
  sorot = null,
  onStatusPersil,
}) {
  const wadah = useRef(null);
  const peta = useRef(null);
  const balon = useRef(null);
  const penanda = useRef([]);
  // Tetap satu Map selama komponen hidup (bukan ref: isinya dibaca saat dibersihkan).
  const [lapisanGis] = useState(() => new Map()); // kunciLapisan -> google.maps.Data
  const kelompok = useRef(null);
  const g = useRef(null);
  const bukaRef = useRef(onBuka);
  bukaRef.current = onBuka;
  const cekRef = useRef(onCek);
  cekRef.current = onCek;
  const pandangRef = useRef(Symbol("belum"));
  const [siap, setSiap] = useState(false);

  // Persil BPN. Pendengar peta dipasang sekali, jadi mereka membaca pilihan
  // terbaru lewat ref.
  const lapisanPersil = useRef(null);
  const persilRef = useRef(persil);
  persilRef.current = persil;
  const statusRef = useRef(onStatusPersil);
  statusRef.current = onStatusPersil;
  const laporPersil = () => {
    const lp = lapisanPersil.current;
    if (lp) statusRef.current?.(statusPersil({ aktif: Boolean(persilRef.current), tampak: lp.tampak, pemuat: lp.pemuat }));
  };
  const laporRef = useRef(laporPersil);
  laporRef.current = laporPersil;
  const segarkanPersil = () => {
    if (!peta.current || !lapisanPersil.current) return;
    perbaruiPersil(peta.current, lapisanPersil.current, persilRef.current);
    laporPersil();
  };
  const segarkanRef = useRef(segarkanPersil);
  segarkanRef.current = segarkanPersil;

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
          lapisanPersil.current = buatLapisanPersil(lib, peta.current, balon.current, () => laporRef.current());
          peta.current.addListener("idle", () => segarkanRef.current());
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
      for (const d of lapisanGis.values()) d.setMap(null);
      lapisanGis.clear();
      if (lapisanPersil.current) {
        lapisanPersil.current.data.setMap(null);
        lapisanPersil.current.sorot.setMap(null);
        lapisanPersil.current = null;
      }
      if (balon.current) balon.current.close();
      if (peta.current && g.current) g.current.event.clearInstanceListeners(peta.current);
      peta.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (peta.current) peta.current.setMapTypeId(TIPE[jenis]);
  }, [jenis, siap]);

  // Lapisan GIS: pasang yang baru menyala, lepas yang dimatikan / berubah warna.
  useEffect(() => {
    const m = peta.current;
    const lib = g.current;
    if (!m || !lib) return;
    const ingin = new Map(lapisan.map((l) => [kunciLapisan(l), l]));
    for (const [k, d] of lapisanGis) {
      if (ingin.has(k)) continue;
      d.setMap(null);
      lapisanGis.delete(k);
    }
    for (const [k, l] of ingin) {
      if (lapisanGis.has(k)) continue;
      try {
        lapisanGis.set(k, buatLapisanGis(lib, m, balon.current, l));
      } catch (e) {
        // GeoJSON yang ditolak Google tidak boleh menjatuhkan seluruh peta.
        console.warn(`[Sensus Pajak] lapisan "${l.nama}" tidak dapat digambar:`, e.message);
      }
    }
  }, [lapisan, siap, lapisanGis]);

  // Persil dinyalakan / dimatikan, atau isinya berganti versi.
  useEffect(() => {
    segarkanRef.current();
  }, [persil, siap]);

  // Bidang hasil cari NIB: sorot, rapatkan pandangan ke sana, buka balonnya.
  useEffect(() => {
    const m = peta.current;
    const lib = g.current;
    const lp = lapisanPersil.current;
    if (!m || !lib || !lp) return;
    lp.sorot.forEach((f) => lp.sorot.remove(f));
    if (!sorot) return;
    lp.sorot.addGeoJson(sorot.fitur);
    const [barat, selatan, timur, utara] = sorot.batas;
    m.fitBounds(new lib.LatLngBounds({ lat: selatan, lng: barat }, { lat: utara, lng: timur }), 60);
    lib.event.addListenerOnce(m, "idle", () => {
      if (m.getZoom() > 19) m.setZoom(19);
    });
    bukaBalonPersil(balon.current, m, { lat: (selatan + utara) / 2, lng: (barat + timur) / 2 }, sorot.fitur.properties);
  }, [sorot, siap]);

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

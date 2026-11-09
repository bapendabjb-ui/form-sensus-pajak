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
  gayaLapisan,
  TITIK_LAPISAN_RADIUS,
  geserPanel,
  WARNA_SAYA,
  zoomAkurasi,
} from "./bersama.jsx";
import * as api from "../../api.js";
import { PERSIL_ZOOM_MIN, dengarPetak, statusPersil, warnaSorotBidang } from "../../lib/persilBpn.js";
import { pasangUbinPersil } from "./ubinPersilGoogle.js";

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
 * persil : persil BPN yang menyala (lib/persilBpn.js usePersilBpn().peta) | null; digambar
 *          sebagai ubin kanvas mulai PERSIL_ZOOM_MIN, warna per kecamatan. Mengetuk bidang
 *          menyorotnya dan mengirim keterangannya dari server ke onBidang.
 * sorot  : { fitur, batas: [barat, selatan, timur, utara] } | null - bidang hasil cari NIB:
 *          disorot, peta dirapatkan ke sana, dan keterangannya dikirim ke onBidang
 * bidang : bidang yang keterangannya sedang tampil di panel (PanelBidang), atau null -
 *          null = panelnya ditutup, sorotnya dilepas
 * onBidang : (bidang | null) => void - bidang diketuk / dicari, atau ketukan di luar bidang
 * panelRef : ref elemen panel; bidang yang diketuk di bawah panel digeser keluar
 * onStatusPersil : (status) => void - "", "perbesar", "memuat", "galat" (lib/persilBpn.js statusPersil)
 * posisiSaya, pusatkan : titik biru "Lokasi saya" - lihat lib/useLokasiSaya.js
 * onGeser : () => void - peta digeser (berhenti mengikuti lokasi saya)
 *
 * Tombol zoom di kanan atas: kanan bawah untuk tombol "Lokasi saya" (PetaSebaran).
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

/** Posisi piksel sebuah koordinat dari sudut kiri atas peta (Google tidak menyediakannya langsung). */
function pikselDi(lib, peta, posisi) {
  const proyeksi = peta.getProjection();
  const batas = peta.getBounds();
  if (!proyeksi || !batas) return null;
  const skala = 2 ** peta.getZoom();
  const kiriAtas = proyeksi.fromLatLngToPoint(
    new lib.LatLng(batas.getNorthEast().lat(), batas.getSouthWest().lng())
  );
  const t = proyeksi.fromLatLngToPoint(posisi instanceof lib.LatLng ? posisi : new lib.LatLng(posisi.lat, posisi.lng));
  return { x: (t.x - kiriAtas.x) * skala, y: (t.y - kiriAtas.y) * skala };
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
  bidang = null,
  onBidang,
  panelRef = null,
  onStatusPersil,
  posisiSaya = null,
  pusatkan = 0,
  onGeser,
}) {
  const wadah = useRef(null);
  const peta = useRef(null);
  const balon = useRef(null);
  const saya = useRef(null);
  const geserRef = useRef(onGeser);
  geserRef.current = onGeser;
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

  // Persil BPN: { ubin: lapisan ubin terpasang, kunci, sorot: google.maps.Data }.
  // Pendengar peta dipasang sekali, jadi mereka membaca pilihan terbaru lewat ref.
  const lapisanPersil = useRef(null);
  const persilRef = useRef(persil);
  persilRef.current = persil;
  const jenisRef = useRef(jenis);
  jenisRef.current = jenis;
  const statusRef = useRef(onStatusPersil);
  statusRef.current = onStatusPersil;
  const bidangRef = useRef(onBidang);
  bidangRef.current = onBidang;
  const ketukKe = useRef(0);
  // Titik yang dijaga tetap terlihat di samping panel, dan apakah peta sedang dirapatkan ke bidangnya.
  const jagaRef = useRef({ posisi: null, rapatkan: false });

  const laporPersil = () => {
    if (peta.current) statusRef.current?.(statusPersil({ aktif: Boolean(persilRef.current), zoom: peta.current.getZoom() }));
  };

  /** Lepas sorot bidang dari peta (panelnya sudah ditutup). */
  const lepasSorot = () => {
    const lp = lapisanPersil.current;
    if (lp) lp.sorot.forEach((f) => lp.sorot.remove(f));
  };

  /** Lepas sorot dan tutup panelnya. */
  const tutupBidang = () => {
    lepasSorot();
    bidangRef.current?.(null);
  };

  /** Sorot satu bidang (hasil cari NIB / diketuk) dan tampilkan keterangannya; `rapatkan` = peta menuju bidangnya. */
  const tampilkanSorot = (b, { posisi = null, rapatkan = false } = {}) => {
    const m = peta.current;
    const lib = g.current;
    const lp = lapisanPersil.current;
    if (!m || !lib || !lp) return;
    lepasSorot();
    const warna = warnaSorotBidang(persilRef.current, b, jenisRef.current);
    // Tidak menangkap ketukan: ketukan pada bidangnya sampai ke peta dan memperbarui keterangannya.
    lp.sorot.setStyle({ strokeColor: warna, strokeOpacity: 1, strokeWeight: 4, fillColor: warna, fillOpacity: 0.22, zIndex: 1, clickable: false });
    lp.sorot.addGeoJson(b.fitur);
    const [barat, selatan, timur, utara] = b.batas;
    if (rapatkan) {
      m.fitBounds(new lib.LatLngBounds({ lat: selatan, lng: barat }, { lat: utara, lng: timur }), 60);
      lib.event.addListenerOnce(m, "idle", () => {
        if (m.getZoom() > 19) m.setZoom(19);
      });
    }
    jagaRef.current = { posisi: posisi || { lat: (selatan + utara) / 2, lng: (barat + timur) / 2 }, rapatkan };
    bidangRef.current?.(b);
  };

  /** Geser peta bila titik bidang yang ditampilkan tertutup panelnya. */
  const jagaTerlihat = () => {
    const m = peta.current;
    const lib = g.current;
    const { posisi } = jagaRef.current;
    if (!m || !lib || !posisi) return;
    const geser = geserPanel(pikselDi(lib, m, posisi), panelRef?.current, wadah.current);
    if (geser) m.panBy(-geser.x, -geser.y);
  };

  /** Ketukan di peta: bidang persil di titik itu (bila persil menyala dan sudah tergambar). */
  const ketukPeta = async (e) => {
    const m = peta.current;
    const cfg = persilRef.current;
    if (!m || !cfg || m.getZoom() < PERSIL_ZOOM_MIN) return;
    const ke = ++ketukKe.current;
    try {
      const { persil: b } = await api.bidangDiTitik(e.latLng.lat(), e.latLng.lng());
      const kini = persilRef.current;
      if (ke !== ketukKe.current || !kini) return;
      // Ketukan di luar bidang (atau di bidang kecamatan yang disembunyikan) menutup panelnya.
      if (!b || kini.tersembunyi.includes(b.kecamatan)) tutupBidang();
      else tampilkanSorot(b, { posisi: e.latLng });
    } catch {
      // Tanpa sinyal: ketukan di peta tidak berbuat apa-apa.
    }
  };

  const panggilan = useRef({});
  panggilan.current = { laporPersil, lepasSorot, tutupBidang, tampilkanSorot, jagaTerlihat, ketukPeta };

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
            zoomControlOptions: { position: lib.ControlPosition.RIGHT_TOP },
            // Layar penuh memakai tombol aplikasi sendiri (PetaSebaran), sama
            // untuk peta cadangan, dan legenda serta tombol jenis peta ikut terbawa.
            fullscreenControl: false,
            gestureHandling: "greedy",
            clickableIcons: false,
          });
          balon.current = new lib.InfoWindow();
          kelompok.current = buatPengelompok(lib, peta.current);
          const sorotData = new lib.Data({ map: peta.current });
          lapisanPersil.current = { ubin: null, kunci: "", sorot: sorotData };
          peta.current.addListener("zoom_changed", () => panggilan.current.laporPersil());
          peta.current.addListener("click", (e) => panggilan.current.ketukPeta(e));
          // Menggeser peta menghentikan peta mengikuti lokasi saya (lib/useLokasiSaya.js).
          peta.current.addListener("dragstart", () => geserRef.current?.());
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
        lapisanPersil.current.sorot.setMap(null);
        lapisanPersil.current = null;
      }
      if (balon.current) balon.current.close();
      if (saya.current) {
        saya.current.titik.setMap(null);
        saya.current.lingkar.setMap(null);
        saya.current = null;
      }
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

  // Persil: pasang / ganti / lepas lapisan ubinnya saat pilihan, isi, atau jenis peta berganti.
  useEffect(() => {
    const m = peta.current;
    const lib = g.current;
    const lp = lapisanPersil.current;
    if (!m || !lib || !lp) return;
    pasangUbinPersil(lib, m, lp, persil, jenis);
    if (!persil) panggilan.current.tutupBidang();
    panggilan.current.laporPersil();
  }, [persil, jenis, siap]);

  // Petak data mulai / selesai dimuat: perbarui keterangan di atas peta.
  useEffect(() => dengarPetak(() => panggilan.current.laporPersil()), []);

  // Bidang hasil cari NIB: sorot, rapatkan pandangan ke sana, tampilkan keterangannya.
  useEffect(() => {
    if (sorot) panggilan.current.tampilkanSorot(sorot, { rapatkan: true });
  }, [sorot, siap]);

  // Panel bidang: ditutup = sorot dilepas; tampil = bidangnya dijaga tidak tertutup panel
  // (setelah peta selesai dirapatkan ke bidang hasil cari NIB).
  useEffect(() => {
    if (!bidang) {
      panggilan.current.lepasSorot();
      return undefined;
    }
    if (!jagaRef.current.rapatkan) {
      panggilan.current.jagaTerlihat();
      return undefined;
    }
    const t = setTimeout(() => panggilan.current.jagaTerlihat(), 450);
    return () => clearTimeout(t);
  }, [bidang]);

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

  // Titik biru lokasi saya, sama dengan peta pemilih (BidangGoogle).
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
    <div className="fk-peta is-sebaran">
      <div className="fk-peta-kanvas" ref={wadah} />
      {!siap && <PetaMemuat />}
    </div>
  );
}

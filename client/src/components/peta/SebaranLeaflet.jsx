import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// Plugin ini menempel pada window.L, yang dipasang oleh "leaflet" di atas -
// urutan impor ini penting.
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { pasangUbin } from "../../lib/ubinPeta";
import {
  PUSAT_AWAL,
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
import {
  PERSIL_ZOOM_MIN,
  dengarPetak,
  statusPersil,
  warnaSorotBidang,
} from "../../lib/persilBpn.js";
import { LapisanUbinPersil, aturUbinPersil } from "./ubinPersilLeaflet.js";

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
 * lapisan : [{ versi, nama, warna, data }] - lapisan GIS yang menyala (lib/lapisanPeta.js),
 *           digambar di bawah titik sensus
 * persil, sorot, bidang, onBidang, panelRef, onStatusPersil : persil BPN - lihat SebaranGoogle
 * posisiSaya, pusatkan, onGeser : titik biru "Lokasi saya" - lihat lib/useLokasiSaya.js
 *
 * Tombol zoom di kanan atas: kiri atas untuk panel keterangan bidang, kanan bawah untuk
 * tombol "Lokasi saya" (PetaSebaran).
 */

/** Warna = status kertas kerja; sudah dicek admin bercentang. */
const ikonTitik = (t) => {
  const { svg, ukuran } = svgTitik({ warna: warnaTitik(t), dicek: t.dicek });
  return L.divIcon({
    className: `fk-titik${t.dicek ? " is-dicek" : ""}`,
    html: svg,
    iconSize: [ukuran, ukuran],
    iconAnchor: [ukuran / 2, ukuran / 2],
  });
};

/*
 * Ketukan pada lapisan GIS membuka balonnya sendiri; ketukan yang sama juga
 * sampai ke peta dan tidak boleh ikut mencari persil.
 */
let ketukLapisan = 0;
const tandaiKetuk = () => {
  ketukLapisan = Date.now();
};

/**
 * Satu lapisan GIS sebagai L.GeoJSON. Digambar di kanvas, bukan SVG: ribuan
 * bidang persil sebagai elemen SVG membuat geser dan zoom tersendat.
 */
function buatLapisanGis(l, kanvas) {
  const g = gayaLapisan(l.warna);
  const titik = (f) => /Point$/.test(f?.geometry?.type || "");
  return L.geoJSON(l.data, {
    renderer: kanvas,
    style: (f) =>
      titik(f)
        ? { color: "#fff", weight: 1.5, opacity: 1, fillColor: g.isi, fillOpacity: 0.95 }
        : { color: g.garis, weight: g.tebal, opacity: 0.9, fillColor: g.isi, fillOpacity: g.isiTembus },
    pointToLayer: (_f, latlng) => L.circleMarker(latlng, { renderer: kanvas, radius: TITIK_LAPISAN_RADIUS }),
    onEachFeature: (f, layer) => {
      layer.bindPopup(() => isiBalonLapisan(l.nama, f.properties), { maxWidth: 320 });
      layer.on("click", tandaiKetuk);
    },
  });
}

/** Kunci gambar sebuah lapisan: berganti bila isi, nama, atau warnanya berganti. */
const kunciLapisan = (l) => `${l.versi}|${l.warna}|${l.nama}`;

/** Bidang yang disorot (hasil cari NIB / diketuk): garis tebal berwarna kecamatannya. */
const gayaSorot = (warna) => ({ color: warna, weight: 4, opacity: 1, fillColor: warna, fillOpacity: 0.22 });

export default function SebaranLeaflet({
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
  const ubin = useRef(null);
  const saya = useRef(null);
  const geserRef = useRef(onGeser);
  geserRef.current = onGeser;
  const lapisanTitik = useRef(null);
  const kanvas = useRef(null);
  // Tetap satu Map selama komponen hidup (bukan ref: isinya dibaca saat dibersihkan).
  const [lapisanGis] = useState(() => new Map()); // kunciLapisan -> L.GeoJSON
  const bukaRef = useRef(onBuka);
  bukaRef.current = onBuka;
  const cekRef = useRef(onCek);
  cekRef.current = onCek;
  const pandangRef = useRef(Symbol("belum"));

  // Persil BPN: { ubin: LapisanUbinPersil, kunci, sorot: L.GeoJSON | null }.
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
    if (lp?.sorot) {
      lp.sorot.remove();
      lp.sorot = null;
    }
  };

  /** Lepas sorot dan tutup panelnya. */
  const tutupBidang = () => {
    lepasSorot();
    bidangRef.current?.(null);
  };

  /** Sorot satu bidang (hasil cari NIB / diketuk) dan tampilkan keterangannya; `rapatkan` = peta menuju bidangnya. */
  const tampilkanSorot = (b, { posisi = null, rapatkan = false } = {}) => {
    const m = peta.current;
    const lp = lapisanPersil.current;
    if (!m || !lp) return;
    lepasSorot();
    const warna = warnaSorotBidang(persilRef.current, b, jenisRef.current);
    // Tidak menangkap ketukan: ketukan pada bidangnya sampai ke peta dan menyorotnya lagi.
    const layer = L.geoJSON(b.fitur, { renderer: kanvas.current, style: gayaSorot(warna), interactive: false }).addTo(m);
    lp.sorot = layer;
    const [barat, selatan, timur, utara] = b.batas;
    if (rapatkan) {
      m.fitBounds(
        [
          [selatan, barat],
          [utara, timur],
        ],
        { padding: [60, 60], maxZoom: 19 }
      );
    }
    jagaRef.current = { posisi: posisi || [(selatan + utara) / 2, (barat + timur) / 2], rapatkan };
    bidangRef.current?.(b);
  };

  /** Geser peta bila titik bidang yang ditampilkan tertutup panelnya. */
  const jagaTerlihat = () => {
    const m = peta.current;
    const { posisi } = jagaRef.current;
    if (!m || !posisi) return;
    const geser = geserPanel(m.latLngToContainerPoint(posisi), panelRef?.current, wadah.current);
    if (geser) m.panBy([-geser.x, -geser.y]);
  };

  /** Ketukan di peta: bidang persil di titik itu (bila persil menyala dan sudah tergambar). */
  const ketukPeta = async (e) => {
    const m = peta.current;
    const cfg = persilRef.current;
    if (!m || !cfg || m.getZoom() < PERSIL_ZOOM_MIN || Date.now() - ketukLapisan < 400) return;
    const ke = ++ketukKe.current;
    try {
      const { persil: b } = await api.bidangDiTitik(e.latlng.lat, e.latlng.lng);
      const kini = persilRef.current;
      if (ke !== ketukKe.current || !kini) return;
      // Ketukan di luar bidang (atau di bidang kecamatan yang disembunyikan) menutup panelnya.
      if (!b || kini.tersembunyi.includes(b.kecamatan)) tutupBidang();
      else tampilkanSorot(b, { posisi: e.latlng });
    } catch {
      // Tanpa sinyal: ketukan di peta tidak berbuat apa-apa.
    }
  };

  const panggilan = useRef({});
  panggilan.current = { laporPersil, lepasSorot, tutupBidang, tampilkanSorot, jagaTerlihat, ketukPeta };

  // Buat peta sekali.
  useEffect(() => {
    // maxZoom ditetapkan di sini, bukan menunggu lapisan ubin: lapisan itu
    // dipasang belakangan (lib/ubinPeta.js menguji OSM dulu), sedangkan
    // pengelompok titik langsung membutuhkan batas zoom peta.
    const m = L.map(wadah.current, { center: [PUSAT_AWAL.lat, PUSAT_AWAL.lon], zoom: 12, maxZoom: 19, zoomControl: false });
    L.control.zoom({ position: "topright" }).addTo(m);
    peta.current = m;
    // Menggeser peta menghentikan peta mengikuti lokasi saya (lib/useLokasiSaya.js).
    m.on("dragstart", () => geserRef.current?.());
    kanvas.current = L.canvas({ padding: 0.5 });
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

    // Di atas peta dasar (zIndex 1), di bawah lapisan GIS dan titik sensus.
    const ubinPersil = new LapisanUbinPersil({ minZoom: PERSIL_ZOOM_MIN, maxZoom: 22, zIndex: 5, updateWhenZooming: false });
    lapisanPersil.current = { ubin: ubinPersil, kunci: "", sorot: null };
    m.on("zoomend", () => panggilan.current.laporPersil());
    m.on("click", (e) => panggilan.current.ketukPeta(e));

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
      kanvas.current = null;
      saya.current = null;
      lapisanPersil.current = null;
      // Ikut terhapus bersama petanya; kosongkan supaya peta baru (mis. saat
      // efek dijalankan dua kali di mode pengembangan) menggambarnya lagi.
      lapisanGis.clear();
    };
  }, [lapisanGis]);

  // Lapisan GIS: pasang yang baru menyala, lepas yang dimatikan / berubah warna.
  useEffect(() => {
    const m = peta.current;
    if (!m) return;
    const ingin = new Map(lapisan.map((l) => [kunciLapisan(l), l]));
    for (const [k, layer] of lapisanGis) {
      if (ingin.has(k)) continue;
      layer.remove();
      lapisanGis.delete(k);
    }
    for (const [k, l] of ingin) {
      if (lapisanGis.has(k)) continue;
      try {
        lapisanGis.set(k, buatLapisanGis(l, kanvas.current).addTo(m));
      } catch (e) {
        // GeoJSON yang ditolak Leaflet tidak boleh menjatuhkan seluruh peta.
        console.warn(`[Sensus Pajak] lapisan "${l.nama}" tidak dapat digambar:`, e.message);
      }
    }
  }, [lapisan, lapisanGis]);

  // Persil: pasang / gambar ulang / lepas lapisan ubinnya saat pilihan, isi, atau jenis peta berganti.
  useEffect(() => {
    const m = peta.current;
    const lp = lapisanPersil.current;
    if (!m || !lp) return;
    aturUbinPersil(m, lp, persil, jenis);
    if (!persil) panggilan.current.tutupBidang();
    panggilan.current.laporPersil();
  }, [persil, jenis]);

  // Petak data mulai / selesai dimuat: perbarui keterangan di atas peta.
  useEffect(() => dengarPetak(() => panggilan.current.laporPersil()), []);

  // Bidang hasil cari NIB: sorot, rapatkan pandangan ke sana, tampilkan keterangannya.
  useEffect(() => {
    if (sorot) panggilan.current.tampilkanSorot(sorot, { rapatkan: true });
  }, [sorot]);

  // Panel bidang: ditutup = sorot dilepas; tampil = bidangnya dijaga tidak tertutup panel
  // (setelah animasi rapat ke bidang hasil cari NIB selesai).
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

  // Titik biru lokasi saya, sama dengan peta pemilih (BidangLeaflet).
  useEffect(() => {
    const m = peta.current;
    if (!m) return;
    if (!posisiSaya) {
      // Posisi terlalu kasar / hilang: titik biru dilepas (lib/useLokasiSaya.js posisiPeta).
      if (saya.current) {
        saya.current.titik.remove();
        saya.current.lingkar.remove();
        saya.current = null;
      }
      return;
    }
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

  return <div className="fk-peta is-sebaran" ref={wadah} />;
}

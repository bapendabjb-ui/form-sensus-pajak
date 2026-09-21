import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Peta sebaran hasil sensus: banyak titik sekaligus, hanya untuk dilihat.
 *
 * Dipisah dari PetaLokasi karena tugasnya berbeda - PetaLokasi memilih satu
 * titik dan bisa digeser, peta ini menggambar seluruh titik dan tidak mengubah
 * data apa pun. Sama-sama dimuat terpisah (React.lazy) supaya Leaflet hanya
 * diunduh oleh yang membukanya.
 *
 * titik  : [{ entriId, lat, lon, judul, formulir, nomor, status, petugas, ... }]
 * onBuka : (titik) => void  - dipanggil saat tautan di balon diklik
 */

/** Pusat Kota Banjarbaru - dipakai bila belum ada satu titik pun. */
const PUSAT_AWAL = [-3.4572, 114.8105];

const LAPISAN = {
  peta: {
    label: "Peta",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    opsi: { maxZoom: 19, attribution: "&copy; OpenStreetMap" },
  },
  satelit: {
    label: "Satelit",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    opsi: { maxZoom: 19, attribution: "&copy; Esri" },
  },
};

/**
 * Warna = status kertas kerja. Titik dari koordinat yang terekam otomatis
 * digambar berlubang supaya tidak tertukar dengan titik yang sengaja diukur
 * petugas lewat pertanyaan lokasi - ketelitiannya bisa jauh berbeda.
 */
const ikonTitik = (t) =>
  L.divIcon({
    className: `fk-titik is-${t.status === "selesai" ? "selesai" : "draft"}${t.sumber === "rekam" ? " is-rekam" : ""}`,
    html: '<span class="fk-titik-isi"></span>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

/** Teks aman untuk disisipkan ke HTML balon. */
const aman = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ringkasTim = (petugas = []) => {
  if (!petugas.length) return "—";
  const lain = petugas.length - 1;
  return lain > 0 ? `${petugas[0].nama} +${lain}` : petugas[0].nama;
};

function isiBalon(t) {
  const baris = [
    `<strong>${aman(t.judul || t.formulir)}</strong>`,
    `<span class="fk-balon-sub">${aman(t.nomor)} · ${aman(t.formulir)}</span>`,
    `<span class="fk-balon-sub">${aman(ringkasTim(t.petugas))}</span>`,
  ];
  if (t.sumber === "rekam") {
    baris.push(`<span class="fk-balon-rekam">Posisi terekam otomatis · hanya admin</span>`);
  }
  if (!t.berkasLengkap) {
    const catatan = t.catatanBerkas ? `: ${aman(t.catatanBerkas)}` : "";
    baris.push(`<span class="fk-balon-kurang">Berkas tidak lengkap${catatan}</span>`);
  }
  baris.push(`<button type="button" class="fk-balon-buka">Buka data</button>`);
  return `<div class="fk-balon">${baris.join("")}</div>`;
}

export default function PetaSebaran({ titik = [], onBuka }) {
  const wadah = useRef(null);
  const peta = useRef(null);
  const ubin = useRef(null);
  const lapisanTitik = useRef(null);
  const bukaRef = useRef(onBuka);
  bukaRef.current = onBuka;
  const [jenis, setJenis] = useState("peta");

  // Buat peta sekali.
  useEffect(() => {
    const m = L.map(wadah.current, { center: PUSAT_AWAL, zoom: 12 });
    peta.current = m;
    lapisanTitik.current = L.layerGroup().addTo(m);

    const t = setTimeout(() => m.invalidateSize(), 60);
    return () => {
      clearTimeout(t);
      m.remove();
      peta.current = null;
      ubin.current = null;
      lapisanTitik.current = null;
    };
  }, []);

  // Ganti lapisan peta jalan / satelit.
  useEffect(() => {
    const m = peta.current;
    if (!m) return;
    if (ubin.current) m.removeLayer(ubin.current);
    const l = LAPISAN[jenis];
    ubin.current = L.tileLayer(l.url, l.opsi).addTo(m);
  }, [jenis]);

  // Gambar ulang titik setiap daftarnya berubah (mis. saringan diganti).
  useEffect(() => {
    const m = peta.current;
    const grup = lapisanTitik.current;
    if (!m || !grup) return;

    grup.clearLayers();
    for (const t of titik) {
      const penanda = L.marker([t.lat, t.lon], { icon: ikonTitik(t) }).bindPopup(isiBalon(t));
      // Tombol di dalam balon baru ada di DOM setelah balon terbuka.
      penanda.on("popupopen", (e) => {
        const tombol = e.popup.getElement()?.querySelector(".fk-balon-buka");
        if (tombol) tombol.onclick = () => bukaRef.current?.(t);
      });
      grup.addLayer(penanda);
    }

    // Rapatkan pandangan ke titik yang ada. Satu titik tidak punya rentang,
    // jadi fitBounds akan mengecilkan peta habis-habisan - pakai setView.
    if (titik.length === 1) {
      m.setView([titik[0].lat, titik[0].lon], 17);
    } else if (titik.length > 1) {
      m.fitBounds(L.latLngBounds(titik.map((t) => [t.lat, t.lon])), { padding: [40, 40], maxZoom: 17 });
    }
  }, [titik]);

  return (
    <div className="fk-peta-wadah">
      <div className="fk-peta-alat">
        <div className="fk-peta-legenda">
          <span className="fk-legenda">
            <span className="fk-titik-contoh is-selesai" /> Selesai
          </span>
          <span className="fk-legenda">
            <span className="fk-titik-contoh is-draft" /> Draft
          </span>
          {titik.some((t) => t.sumber === "rekam") && (
            <span className="fk-legenda">
              <span className="fk-titik-contoh is-rekam" /> Terekam otomatis
            </span>
          )}
        </div>
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
      <div className="fk-peta is-sebaran" ref={wadah} />
    </div>
  );
}

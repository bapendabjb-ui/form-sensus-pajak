/*
 * Bagian bersama peta Google dan peta cadangan (Leaflet).
 *
 * Komponen peta yang dipakai halaman lain (PetaLokasi, PetaSebaran) hanya
 * memilih mesin dan menggambar perkakas di atas peta; menggambar petanya
 * sendiri diserahkan ke mesin di folder ini.
 */

import { useEffect, useState } from "react";
import * as api from "../../api.js";
import { LAPISAN } from "../../lib/ubinPeta";
import { googleGagal, onGoogleGagal } from "../../lib/googleMaps.js";

/** Pusat Kota Banjarbaru - titik awal bila belum ada koordinat. */
export const PUSAT_AWAL = { lat: -3.4572, lon: 114.8105 };

/** Warna titik per status kertas kerja - sama dengan .fk-titik di styles.css. */
export const WARNA_STATUS = { selesai: "#0F766E", draft: "#B87309" };

/**
 * Mesin peta yang dipakai: { jenis: "tunggu" | "google" | "leaflet", kunci, cadangan }.
 *
 * Google dipakai bila server punya kuncinya dan Google belum gagal di sesi ini.
 * Kegagalan yang datang belakangan (mis. kunci ditolak setelah peta tampil)
 * langsung memindahkan peta yang sedang terbuka ke Leaflet.
 */
export function useMesinPeta() {
  const [mesin, setMesin] = useState({ jenis: "tunggu", kunci: "", cadangan: false });

  useEffect(() => {
    let batal = false;
    api
      .getKonfigurasi()
      .then((k) => {
        if (batal) return;
        if (k.googleMapsKey && !googleGagal()) setMesin({ jenis: "google", kunci: k.googleMapsKey, cadangan: false });
        else setMesin({ jenis: "leaflet", kunci: "", cadangan: Boolean(k.googleMapsKey) });
      })
      .catch(() => !batal && setMesin({ jenis: "leaflet", kunci: "", cadangan: false }));
    const lepas = onGoogleGagal(() => !batal && setMesin({ jenis: "leaflet", kunci: "", cadangan: true }));
    return () => {
      batal = true;
      lepas();
    };
  }, []);

  return mesin;
}

/** Tombol Peta / Satelit. */
export function PilihJenis({ jenis, onChange }) {
  return (
    <div className="fk-peta-jenis" role="radiogroup" aria-label="Jenis peta">
      {Object.entries(LAPISAN).map(([k, l]) => (
        <button
          type="button"
          key={k}
          role="radio"
          aria-checked={jenis === k}
          className={jenis === k ? "is-on" : ""}
          onClick={() => onChange(k)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

/** Lapisan "memuat" di atas kanvas peta. */
export function PetaMemuat() {
  return (
    <div className="fk-peta-memuat" role="status">
      <span className="fk-spinner" aria-hidden="true" />
      <span>Memuat peta…</span>
    </div>
  );
}

/** Keterangan bahwa peta Google sedang tidak dipakai. */
export function CatatanCadangan() {
  return <span className="fk-hint-kecil">Peta Google sedang tidak tersedia — memakai peta cadangan.</span>;
}

/* ---------- balon titik Peta Sensus ---------- */

/** Teks aman untuk disisipkan ke HTML balon. */
const aman = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ringkasTim = (petugas = []) => {
  if (!petugas.length) return "—";
  const lain = petugas.length - 1;
  return lain > 0 ? `${petugas[0].nama} +${lain}` : petugas[0].nama;
};

/** HTML isi balon sebuah titik; semua teks dari data sudah di-escape. */
/** Keterangan asal titik di balon. */
const ASAL_TITIK = {
  gps: "Titik dari GPS saat pendataan",
  rekam: "Titik direkam di lokasi",
  koreksi: "Titik ditetapkan di peta",
  formulir: "Koordinat dari pertanyaan Lokasi",
};

export function isiBalon(t) {
  const kk = !t.entriId;
  const baris = [
    `<strong>${aman(t.judul || (kk ? `Kertas kerja ${t.nomor}` : t.formulir))}</strong>`,
    `<span class="fk-balon-sub">${aman(t.nomor)} · ${aman(t.formulir)}</span>`,
    `<span class="fk-balon-sub">${aman(ringkasTim(t.petugas))}</span>`,
  ];
  if (ASAL_TITIK[t.sumber]) baris.push(`<span class="fk-balon-rekam">${ASAL_TITIK[t.sumber]}</span>`);
  if (!t.berkasLengkap) {
    const catatan = t.catatanBerkas ? `: ${aman(t.catatanBerkas)}` : "";
    baris.push(`<span class="fk-balon-kurang">Berkas tidak lengkap${catatan}</span>`);
  }
  baris.push(`<button type="button" class="fk-balon-buka">${kk ? "Buka kertas kerja" : "Buka data"}</button>`);
  return `<div class="fk-balon">${baris.join("")}</div>`;
}

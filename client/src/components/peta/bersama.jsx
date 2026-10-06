/*
 * Bagian bersama peta Google dan peta cadangan (Leaflet).
 *
 * Komponen peta yang dipakai halaman lain (PetaLokasi, PetaSebaran) hanya
 * memilih mesin dan menggambar perkakas di atas peta; menggambar petanya
 * sendiri diserahkan ke mesin di folder ini.
 */

import { Component, useEffect, useState } from "react";
import * as api from "../../api.js";
import { LAPISAN } from "../../lib/ubinPeta";
import { googleGagal, onGoogleGagal } from "../../lib/googleMaps.js";

/** Pusat Kota Banjarbaru - titik awal bila belum ada koordinat. */
export const PUSAT_AWAL = { lat: -3.4572, lon: 114.8105 };

/** Warna titik per status kertas kerja - sama dengan --brand / --amber di styles.css. */
export const WARNA_STATUS = { selesai: "#0F766E", draft: "#B87309" };

/** Warna titik sebuah data peta. */
export const warnaTitik = (t) => WARNA_STATUS[t.status === "selesai" ? "selesai" : "draft"];

/**
 * Gambar titik peta (SVG), dipakai peta Google, peta cadangan, dan legenda
 * supaya ketiganya persis sama.
 *
 *   - lingkaran berwarna menurut status, berbingkai putih;
 *   - berlubang (putih dengan cincin berwarna) untuk posisi GPS terekam otomatis;
 *   - sudah dicek admin: sedikit lebih besar, dengan centang di tengahnya.
 *
 * @returns {{ svg: string, ukuran: number }}
 */
export function svgTitik({ warna, berlubang = false, dicek = false }) {
  const ukuran = dicek ? 22 : 16;
  const c = ukuran / 2;
  const r = c - 2;
  const isi = berlubang
    ? `<circle cx="${c}" cy="${c}" r="${r}" fill="#fff" stroke="${warna}" stroke-width="3"/>`
    : `<circle cx="${c}" cy="${c}" r="${r}" fill="${warna}" stroke="#fff" stroke-width="2"/>`;
  const centang = dicek
    ? `<path d="M${c - 4.2} ${c + 0.2}l2.8 2.8 5.6-5.8" fill="none" stroke="${berlubang ? warna : "#fff"}" ` +
      `stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
    : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ukuran}" height="${ukuran}" viewBox="0 0 ${ukuran} ${ukuran}">` +
    `<circle cx="${c}" cy="${c + 1}" r="${r}" fill="#000" opacity=".22"/>${isi}${centang}</svg>`;
  return { svg, ukuran };
}

/**
 * Titik yang berdekatan dikelompokkan menjadi satu lingkaran berangka sampai
 * zoom ini; dari zoom berikutnya semua titik tampil satu per satu. Ratusan
 * titik yang digambar terpisah membuat zoom dan geser tersendat.
 */
export const KLASTER_ZOOM_MAKS = 16;

/** Gambar kelompok titik (SVG): lingkaran berangka, makin besar makin banyak isinya. */
export function svgKlaster(jumlah) {
  const ukuran = jumlah < 10 ? 32 : jumlah < 100 ? 38 : 44;
  const c = ukuran / 2;
  const teks = jumlah > 999 ? "999+" : String(jumlah);
  const huruf = teks.length > 2 ? 11.5 : 13;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ukuran}" height="${ukuran}" viewBox="0 0 ${ukuran} ${ukuran}">` +
    `<circle cx="${c}" cy="${c}" r="${c}" fill="${WARNA_STATUS.selesai}" opacity=".22"/>` +
    `<circle cx="${c}" cy="${c}" r="${c - 5}" fill="${WARNA_STATUS.selesai}" stroke="#fff" stroke-width="2"/>` +
    `<text x="${c}" y="${c}" dy=".36em" text-anchor="middle" fill="#fff" font-size="${huruf}" font-weight="700" ` +
    `font-family="IBM Plex Sans, Segoe UI, Roboto, Arial, sans-serif">${teks}</text></svg>`;
  return { svg, ukuran };
}

/** Gambar titik untuk legenda; isinya SVG buatan svgTitik sendiri, bukan data. */
export function IkonTitik(props) {
  return <span className="fk-titik-contoh" dangerouslySetInnerHTML={{ __html: svgTitik(props).svg }} />;
}

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

/**
 * Penahan galat mesin peta. Tanpa ini, satu galat di dalam peta (pustaka
 * pihak ketiga, ubin, Google) mengosongkan seluruh halaman; dengan ini yang
 * hilang hanya petanya, dan bisa dicoba lagi.
 */
export class PenahanPeta extends Component {
  constructor(props) {
    super(props);
    this.state = { galat: null };
  }

  static getDerivedStateFromError(galat) {
    return { galat };
  }

  componentDidCatch(galat) {
    console.error("[Sensus Pajak] peta gagal:", galat);
  }

  render() {
    if (!this.state.galat) return this.props.children;
    return (
      <div className={"fk-peta" + (this.props.kelas ? ` ${this.props.kelas}` : "")}>
        <div className="fk-peta-memuat" role="alert">
          <span>Peta gagal dimuat.</span>
          <button type="button" className="fk-mini" onClick={() => this.setState({ galat: null })}>
            Coba lagi
          </button>
        </div>
      </div>
    );
  }
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

/** Keterangan asal titik di balon. */
const ASAL_TITIK = {
  gps: "Titik dari GPS saat pendataan",
  rekam: "Titik direkam di lokasi",
  koreksi: "Titik ditetapkan di peta",
  formulir: "Koordinat dari pertanyaan Lokasi",
};

/**
 * HTML isi balon sebuah titik; semua teks dari data sudah di-escape.
 * `bisaCek` = admin: ada tombol "sudah dicek" (.fk-balon-cek).
 */
export function isiBalon(t, { bisaCek = false } = {}) {
  const kk = !t.entriId;
  const baris = [
    `<strong>${aman(t.judul || (kk ? `Kertas kerja ${t.nomor}` : t.formulir))}</strong>`,
    `<span class="fk-balon-sub">${aman(t.nomor)} · ${aman(t.formulir)}</span>`,
    `<span class="fk-balon-sub">${aman(ringkasTim(t.petugas))}</span>`,
  ];
  if (ASAL_TITIK[t.sumber]) baris.push(`<span class="fk-balon-rekam">${ASAL_TITIK[t.sumber]}</span>`);
  if (t.dicek) baris.push(`<span class="fk-balon-dicek">✓ Sudah dicek admin · terkunci</span>`);
  if (!t.berkasLengkap) {
    const catatan = t.catatanBerkas ? `: ${aman(t.catatanBerkas)}` : "";
    baris.push(`<span class="fk-balon-kurang">Berkas tidak lengkap${catatan}</span>`);
  }
  const tombol = [`<button type="button" class="fk-balon-buka">${kk ? "Buka kertas kerja" : "Buka data"}</button>`];
  if (bisaCek) {
    tombol.push(
      `<button type="button" class="fk-balon-cek${t.dicek ? " is-on" : ""}">${t.dicek ? "Buka kunci" : "✓ Sudah dicek"}</button>`
    );
  }
  baris.push(`<div class="fk-balon-aksi">${tombol.join("")}</div>`);
  return `<div class="fk-balon">${baris.join("")}</div>`;
}

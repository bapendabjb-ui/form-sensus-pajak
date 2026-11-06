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
import { formatNop } from "../../lib/format.js";

/** Pusat Kota Banjarbaru - titik awal bila belum ada koordinat. */
export const PUSAT_AWAL = { lat: -3.4572, lon: 114.8105 };

/** Warna titik per status kertas kerja - sama dengan --brand / --amber di styles.css. */
export const WARNA_STATUS = { selesai: "#0F766E", draft: "#B87309" };

/** Warna titik sebuah data peta. */
export const warnaTitik = (t) => WARNA_STATUS[t.status === "selesai" ? "selesai" : "draft"];

/** Titik biru "Lokasi saya" - biru Google, supaya tidak tertukar dengan penanda titik sensus. */
export const WARNA_SAYA = "#1A73E8";

/** Zoom saat peta dipusatkan ke lokasi saya: makin kasar GPS-nya, makin jauh, supaya lingkarannya muat. */
export const zoomAkurasi = (m) => (m == null || m <= 50 ? 18 : m <= 150 ? 17 : m <= 400 ? 16 : 15);

/**
 * Gambar titik peta (SVG), dipakai peta Google, peta cadangan, dan legenda
 * supaya ketiganya persis sama.
 *
 *   - lingkaran berwarna menurut status, berbingkai putih;
 *   - sudah dicek admin: sedikit lebih besar, dengan centang di tengahnya.
 *
 * @returns {{ svg: string, ukuran: number }}
 */
export function svgTitik({ warna, dicek = false }) {
  const ukuran = dicek ? 22 : 16;
  const c = ukuran / 2;
  const r = c - 2;
  const isi = `<circle cx="${c}" cy="${c}" r="${r}" fill="${warna}" stroke="#fff" stroke-width="2"/>`;
  const centang = dicek
    ? `<path d="M${c - 4.2} ${c + 0.2}l2.8 2.8 5.6-5.8" fill="none" stroke="#fff" ` +
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
const ASAL_TITIK = { formulir: "Koordinat dari pertanyaan Lokasi" };

/**
 * HTML isi balon sebuah titik; semua teks dari data sudah di-escape.
 * `bisaCek` = admin: ada tombol "sudah dicek" (.fk-balon-cek).
 */
export function isiBalon(t, { bisaCek = false } = {}) {
  const baris = [
    `<strong>${aman(t.judul || t.formulir)}</strong>`,
    `<span class="fk-balon-sub">${aman(t.nomor)} · ${aman(t.formulir)}</span>`,
    `<span class="fk-balon-sub">${aman(ringkasTim(t.petugas))}</span>`,
  ];
  if (ASAL_TITIK[t.sumber]) baris.push(`<span class="fk-balon-rekam">${ASAL_TITIK[t.sumber]}</span>`);
  if (t.dicek) baris.push(`<span class="fk-balon-dicek">✓ Sudah dicek admin · terkunci</span>`);
  if (!t.berkasLengkap) {
    const catatan = t.catatanBerkas ? `: ${aman(t.catatanBerkas)}` : "";
    baris.push(`<span class="fk-balon-kurang">Berkas tidak lengkap${catatan}</span>`);
  }
  const tombol = [`<button type="button" class="fk-balon-buka">Buka data</button>`];
  if (bisaCek) {
    tombol.push(
      `<button type="button" class="fk-balon-cek${t.dicek ? " is-on" : ""}">${t.dicek ? "Buka kunci" : "✓ Sudah dicek"}</button>`
    );
  }
  baris.push(`<div class="fk-balon-aksi">${tombol.join("")}</div>`);
  return `<div class="fk-balon">${baris.join("")}</div>`;
}

/* ---------- lapisan dari GIS (lib/lapisanPeta.js) ---------- */

/** Atribut yang tampil di balon bidang lapisan; sisanya cukup disebut jumlahnya. */
const ATRIBUT_BALON_MAKS = 12;

/**
 * HTML balon sebuah bidang / garis / titik lapisan: nama lapisan lalu
 * atributnya dari QGIS (mis. NOP, nomor blok). Semua teks di-escape.
 */
export function isiBalonLapisan(namaLapisan, properti) {
  const isi = Object.entries(properti || {}).filter(([, v]) => v !== null && v !== undefined && v !== "");
  const baris = isi
    .slice(0, ATRIBUT_BALON_MAKS)
    .map(([k, v]) => `<tr><th>${aman(k)}</th><td>${aman(v)}</td></tr>`)
    .join("");
  const lebih = isi.length - ATRIBUT_BALON_MAKS;
  return (
    `<div class="fk-balon fk-balon-lapisan"><strong>${aman(namaLapisan)}</strong>` +
    (baris ? `<table class="fk-balon-tabel">${baris}</table>` : `<span class="fk-balon-sub">Tanpa atribut</span>`) +
    (lebih > 0 ? `<span class="fk-balon-sub">+${lebih} atribut lain</span>` : "") +
    "</div>"
  );
}

/**
 * HTML balon sebuah bidang persil BPN (properti dari server/src/persil.js):
 * NIB, tipe hak, luas peta, kelurahan, lalu atribut lain dari berkasnya.
 */
export function isiBalonPersil(p = {}) {
  const luas = Number.isFinite(p.luasPeta)
    ? `${p.luasPeta.toLocaleString("id-ID", { maximumFractionDigits: 2 })} m²`
    : "";
  const utama = [
    ["NIB", p.nib],
    ["Tipe hak", p.tipeHak],
    ["Luas peta", luas],
    ["Kelurahan", p.kelurahan],
    ["Kecamatan", p.kecamatan],
  ];
  const lain = Object.entries(p.lain && typeof p.lain === "object" ? p.lain : {});
  const isi = [...utama, ...lain].filter(([, v]) => v !== null && v !== undefined && v !== "");
  const baris = isi
    .slice(0, ATRIBUT_BALON_MAKS)
    .map(([k, v]) => `<tr><th>${aman(k)}</th><td>${aman(v)}</td></tr>`)
    .join("");
  return (
    `<div class="fk-balon fk-balon-lapisan"><strong>Persil BPN</strong><table class="fk-balon-tabel">${baris}</table>` +
    isiSensusBidang(p.sensus) +
    "</div>"
  );
}

/**
 * Bagian balon persil: data sensus yang mencatat bidang ini (server/src/integrasi.js
 * sensusBidang), masing-masing dengan tombol ke datanya (data-url, lihat
 * peta/balonPersil.js). Tidak tampil bila keterangannya tidak dikirim.
 */
function isiSensusBidang(sensus) {
  if (!Array.isArray(sensus)) return "";
  if (!sensus.length) return `<span class="fk-balon-sub fk-balon-sensus-kosong">Belum tercatat di sensus.</span>`;
  const nop = new Set(sensus.map((s) => s.nop).filter(Boolean));
  const ringkas =
    nop.size > 1
      ? `<span class="fk-balon-kurang">${nop.size} NOP berbeda di bidang ini</span>`
      : nop.size === 0
        ? `<span class="fk-balon-kurang">Tercatat tanpa NOP</span>`
        : "";
  const daftar = sensus
    .map(
      (s) =>
        `<li><span><b>${aman(s.nop ? formatNop(s.nop) : "Tanpa NOP")}</b>` +
        `<span class="fk-balon-sub">${aman(s.nomor)}${s.judul ? ` · ${aman(s.judul)}` : ""}</span></span>` +
        `<button type="button" class="fk-balon-buka" data-url="/kertas-kerja/${Number(s.kkId)}/data/${Number(s.entriId)}">Buka</button></li>`
    )
    .join("");
  return `<div class="fk-balon-sensus"><span class="fk-balon-rekam">Tercatat di sensus</span>${ringkas}<ul>${daftar}</ul></div>`;
}

/** Sorot bidang terpilih di pemilih bidang: gelap di peta jalan, putih di satelit - beda dari warna kecamatan mana pun. */
export const gayaTerpilih = (jenis) =>
  jenis === "satelit"
    ? { garis: "#ffffff", isi: "#ffffff", isiTembus: 0.3 }
    : { garis: "#111827", isi: "#111827", isiTembus: 0.22 };

/** Gaya bidang & garis lapisan: garis tegas, isian tipis supaya peta di bawahnya tetap terbaca. */
export const gayaLapisan = (warna) => ({ garis: warna, tebal: 2, isi: warna, isiTembus: 0.12 });

/** Titik lapisan: lingkaran kecil berbingkai putih, lebih kecil dari titik sensus. */
export const TITIK_LAPISAN_RADIUS = 5;

/** Contoh warna persil BPN: satu kotak berisi warna kecamatan-kecamatannya berjajar. */
export function ContohPersil({ warna = [] }) {
  const n = warna.length;
  const latar = n
    ? `linear-gradient(90deg, ${warna.map((w, i) => `${w} ${(i / n) * 100}% ${((i + 1) / n) * 100}%`).join(", ")})`
    : "#64748B";
  return <span className="fk-persil-contoh" style={{ background: latar }} aria-hidden="true" />;
}

/** Contoh warna lapisan di legenda dan daftar lapisan. */
export function ContohLapisan({ warna }) {
  return <span className="fk-lapisan-contoh" style={{ "--warna": warna }} aria-hidden="true" />;
}

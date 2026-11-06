import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../api.js";

/*
 * Persil BPN di Peta Sensus: ringkasan dari server, nyala / mati per browser,
 * dan pemuat petak untuk mesin peta (SebaranGoogle / SebaranLeaflet).
 *
 * Satu kota berisi ratusan ribu bidang, jadi persil hanya digambar saat peta
 * diperbesar, dan hanya petak (±550 m, server/src/persil.js) yang terlihat yang
 * diunduh. Pengelolaannya di components/KelolaPersil.jsx.
 */

/** Warna garis bidang: terbaca di peta jalan maupun satelit, dan tidak menyerupai titik sensus maupun palet lapisan. */
export const WARNA_PERSIL = "#DB2777";

/**
 * Persil mulai digambar dari zoom ini. Di zoom 17 bidang rumah (±10-20 m)
 * selebar 8-17 piksel - lebih jauh dari itu bidangnya hanya jadi arsiran.
 */
export const PERSIL_ZOOM_MIN = 17;

/** Petak paling banyak yang digambar sekaligus; layar yang lebih luas diminta memperbesar peta. */
const PETAK_TAMPIL_MAKS = 30;

/** Petak yang disimpan di memori: yang terlihat ditambah yang baru dilewati. */
const PETAK_SIMPAN_MAKS = 60;

/** Sampai /api/konfigurasi menjawab - sama dengan server/src/persil.js UKURAN_PETAK. */
const UKURAN_PETAK_BAWAAN = 0.005;

const KUNCI_SIMPAN = "sensus.persilNyala";

function bacaNyala() {
  try {
    return localStorage.getItem(KUNCI_SIMPAN) !== "0";
  } catch {
    return true;
  }
}

function simpanNyala(nyala) {
  try {
    localStorage.setItem(KUNCI_SIMPAN, nyala ? "1" : "0");
  } catch {
    // Penyimpanan browser ditutup: pilihannya berlaku sampai halaman ditutup.
  }
}

/** 1234.5 -> "1.234,5 m²". */
export const formatLuas = (n) =>
  Number.isFinite(n) ? `${n.toLocaleString("id-ID", { maximumFractionDigits: 2 })} m²` : "";

/**
 * @returns {{
 *   ringkasan: object | null,   GET /api/persil
 *   ada: boolean,               ada persil tersimpan
 *   nyala: boolean,             pilihan pemakai ini (bawaan menyala)
 *   ubahNyala: (nyala: boolean) => void,
 *   muatUlang: () => Promise<void>,
 *   peta: { versi, ukuranPetak } | null   untuk mesin peta; null = jangan digambar
 * }}
 */
export function usePersilBpn() {
  const [ringkasan, setRingkasan] = useState(null);
  const [nyala, setNyala] = useState(bacaNyala);
  const [ukuranPetak, setUkuranPetak] = useState(UKURAN_PETAK_BAWAAN);

  const muatUlang = useCallback(
    () =>
      api
        .ringkasanPersil()
        .then(setRingkasan)
        // Persil hanya pelengkap: peta tetap dipakai walau ringkasannya gagal dimuat.
        .catch((e) => console.warn("[Sensus Pajak] ringkasan persil gagal dimuat:", e.message)),
    []
  );

  useEffect(() => {
    muatUlang();
    api
      .getKonfigurasi()
      .then((k) => k.persil?.ukuranPetak && setUkuranPetak(k.persil.ukuranPetak))
      .catch(() => {});
  }, [muatUlang]);

  const ubahNyala = useCallback((n) => {
    setNyala(n);
    simpanNyala(n);
  }, []);

  const ada = Boolean(ringkasan && ringkasan.jumlah > 0);
  const versi = ringkasan?.versi;
  // Identitas stabil: mesin peta mengatur ulang pemuatnya setiap objek ini berganti.
  const peta = useMemo(() => (ada && nyala ? { versi, ukuranPetak } : null), [ada, nyala, versi, ukuranPetak]);

  return { ringkasan, ada, nyala, ubahNyala, muatUlang, peta };
}

/**
 * Pemuat persil per petak untuk satu peta. Mesin peta memberi tahu pandangannya
 * (tampilkan); pemuat mengunduh petak yang belum ada lalu memanggil
 * `tambah(fitur)` dan `buang(id)` milik mesin peta untuk menggambar /
 * menghapus bidang. Satu bidang bisa menyentuh beberapa petak: digambar sekali,
 * dan baru dihapus setelah tidak ada lagi petak tersimpan yang memuatnya.
 */
export class PemuatPersil {
  /**
   * @param {{ tambah: (fitur: object) => void, buang: (id: number) => void, onStatus?: () => void }} o
   *        onStatus dipanggil setiap jumlah petak yang sedang dimuat atau galatnya berubah
   */
  constructor({ tambah, buang, onStatus = () => {} }) {
    this.tambah = tambah;
    this.buang = buang;
    this.onStatus = onStatus;
    this.versi = null;
    this.ukuran = UKURAN_PETAK_BAWAAN;
    this.petak = new Map(); // "i,j" -> { ids: number[] | null (sedang dimuat) }; urutan = terakhir dipakai
    this.hitung = new Map(); // id bidang -> jumlah petak tersimpan yang memuatnya
    this.generasi = 0;
    this.memuat = 0;
    this.galat = "";
  }

  /** Versi persil / ukuran petak berganti: semua yang tergambar dibuang. */
  atur({ versi, ukuranPetak }) {
    if (versi === this.versi && ukuranPetak === this.ukuran) return;
    this.kosongkan();
    this.versi = versi;
    this.ukuran = ukuranPetak;
  }

  kosongkan() {
    for (const id of this.hitung.keys()) this.buang(id);
    this.hitung.clear();
    this.petak.clear();
    // Jawaban petak yang masih di jalan diabaikan.
    this.generasi++;
    this.memuat = 0;
    this.galat = "";
  }

  /**
   * Pandangan peta (derajat). false = terlalu banyak petak untuk digambar:
   * mesin peta menyembunyikan persil dan meminta peta diperbesar.
   */
  tampilkan({ barat, selatan, timur, utara }) {
    const g = this.ukuran;
    const [i0, i1] = [Math.floor(barat / g), Math.floor(timur / g)];
    const [j0, j1] = [Math.floor(selatan / g), Math.floor(utara / g)];
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > PETAK_TAMPIL_MAKS) return false;
    const terlihat = new Set();
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        terlihat.add(`${i},${j}`);
        this.muatPetak(i, j);
      }
    }
    this.rapikan(terlihat);
    return true;
  }

  muatPetak(i, j) {
    const kunci = `${i},${j}`;
    const ada = this.petak.get(kunci);
    if (ada) {
      // Pindahkan ke ujung: petak yang paling lama tidak dilihat dibuang lebih dulu.
      this.petak.delete(kunci);
      this.petak.set(kunci, ada);
      return;
    }
    const isi = { ids: null };
    this.petak.set(kunci, isi);
    const gen = this.generasi;
    this.memuat++;
    this.onStatus();
    api
      .petakPersil(i, j, this.versi)
      .then((koleksi) => {
        if (gen !== this.generasi || this.petak.get(kunci) !== isi) return;
        isi.ids = [];
        for (const f of koleksi.features || []) {
          const n = this.hitung.get(f.id) || 0;
          if (n === 0) this.tambah(f);
          this.hitung.set(f.id, n + 1);
          isi.ids.push(f.id);
        }
        this.galat = "";
      })
      .catch((e) => {
        if (gen !== this.generasi) return;
        // Dicoba lagi saat pandangan berubah.
        if (this.petak.get(kunci) === isi) this.petak.delete(kunci);
        this.galat = e.message || "Persil gagal dimuat.";
      })
      .finally(() => {
        if (gen !== this.generasi) return;
        this.memuat--;
        this.onStatus();
      });
  }

  /** Buang petak yang paling lama tidak dilihat bila melebihi batas simpan; petak yang terlihat tetap. */
  rapikan(terlihat) {
    for (const [kunci, isi] of this.petak) {
      if (this.petak.size <= PETAK_SIMPAN_MAKS) return;
      if (terlihat.has(kunci)) continue;
      this.petak.delete(kunci);
      for (const id of isi.ids || []) {
        const n = this.hitung.get(id) - 1;
        if (n > 0) {
          this.hitung.set(id, n);
        } else {
          this.hitung.delete(id);
          this.buang(id);
        }
      }
    }
  }
}

/**
 * Keterangan persil untuk mesin peta: "" (tidak ada yang perlu dikatakan),
 * "perbesar", "memuat", atau "galat".
 */
export function statusPersil({ aktif, tampak, pemuat }) {
  if (!aktif) return "";
  if (!tampak) return "perbesar";
  if (pemuat.memuat > 0) return "memuat";
  return pemuat.galat ? "galat" : "";
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "../components/Toast.jsx";
import { pantauPosisi, perluPusatkanUlang, posisiLayak } from "./rekamPosisi.js";

/**
 * Selama ini sejak tombol ditekan, peta ikut dipusatkan ulang setiap posisi
 * membaik nyata: pembacaan pertama biasanya dari jaringan dan meleset, GPS
 * baru mengunci beberapa detik kemudian. Menggeser peta menghentikannya.
 */
const IKUTI_MS = 30000;

/**
 * Tombol "Lokasi saya" pada peta pemilih (PetaLokasi, PetaBidang): memusatkan
 * peta ke posisi perangkat dan menampilkan titik biru, seperti di Google Maps.
 * GPS dipantau terus selama peta terbuka, dengan pembacaan terbaru (bukan
 * hasil cache browser), supaya titik birunya mengikuti perangkat.
 *
 * Posisi yang terlalu kasar (lib/rekamPosisi.js posisiLayak, mis. ± 50 km dari
 * alamat internet) tidak dipakai: peta tidak dipindah, titik birunya tidak
 * digambar, dan peta pemilih menampilkan sebabnya (terlaluKasar). Begitu GPS
 * mengunci, peta ikut.
 *
 * @returns {{
 *   saya: { status: "mati" | "mencari" | ..., posisi: { lat, lon, akurasi } | null },
 *   posisiPeta: { lat, lon, akurasi } | null,  posisi untuk titik biru (null bila terlalu kasar)
 *   terlaluKasar: boolean,     posisi ada tetapi bukan GPS (lib/rekamPosisi.js pesanTerlaluKasar)
 *   pusatkan: number,          naik setiap kali peta perlu dipusatkan ke posisiPeta
 *   keLokasiSaya: () => void,  dipanggil tombolnya
 *   berhentiIkuti: () => void, dipanggil mesin peta saat petugas menggeser peta
 * }}
 */
export function useLokasiSaya() {
  const toast = useToast();
  const [saya, setSaya] = useState({ status: "mati", posisi: null });
  const [pusatkan, setPusatkan] = useState(0);
  const henti = useRef(null);
  // Tombol sudah ditekan, tetapi posisi yang cukup teliti belum didapat.
  const tunggu = useRef(false);
  // Pusat terakhir dan batas waktu mengikuti posisi.
  const ikuti = useRef({ sampai: 0, pusat: null });

  useEffect(() => () => henti.current && henti.current(), []);

  const pusatkanKe = (posisi) => {
    ikuti.current.pusat = posisi;
    setPusatkan((n) => n + 1);
  };

  const berhentiIkuti = useCallback(() => {
    ikuti.current.sampai = 0;
    tunggu.current = false;
  }, []);

  const keLokasiSaya = () => {
    ikuti.current = { sampai: Date.now() + IKUTI_MS, pusat: null };
    if (saya.posisi && posisiLayak(saya.posisi)) {
      pusatkanKe(saya.posisi);
      return;
    }
    tunggu.current = true;
    if (henti.current) return; // masih mencari; peta dipusatkan begitu posisi yang teliti didapat

    const berhenti = (pesan) => {
      if (henti.current) henti.current();
      henti.current = null;
      tunggu.current = false;
      setSaya({ status: "mati", posisi: null });
      toast(pesan, true);
    };
    // pantauPosisi bisa melapor gagal sebelum penghentinya dikembalikan.
    let galatAwal = "";
    const stop = pantauPosisi(
      ({ status, posisi, galat }) => {
        if (status === "gagal" && !posisi) {
          if (henti.current) berhenti(galat);
          else galatAwal = galat;
          return;
        }
        setSaya({ status, posisi });
        if (!posisi) return;
        const masihIkuti = tunggu.current || Date.now() < ikuti.current.sampai;
        if (!masihIkuti) return;
        if (!posisiLayak(posisi)) return; // ditunggu sampai GPS mengunci
        if (tunggu.current) {
          tunggu.current = false;
          pusatkanKe(posisi);
        } else if (perluPusatkanUlang(ikuti.current.pusat, posisi)) {
          pusatkanKe(posisi);
        }
      },
      { ikuti: true }
    );
    henti.current = stop;
    if (galatAwal) berhenti(galatAwal);
  };

  const posisiPeta = posisiLayak(saya.posisi) ? saya.posisi : null;
  const terlaluKasar = Boolean(saya.posisi) && !posisiPeta;
  return { saya, posisiPeta, terlaluKasar, pusatkan, keLokasiSaya, berhentiIkuti };
}

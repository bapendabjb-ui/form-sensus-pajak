import { useEffect, useState } from "react";

/**
 * Bidang (dan NOP) yang dititipkan dari tab NOP di Peta Sensus ("Isi formulir
 * PBB"): petugas lalu memilih kertas kerja dan formulirnya seperti biasa, dan
 * formulir baru pertama yang punya pertanyaan Bidang Tanah BPN terisi otomatis
 * (pages/kertas-kerja/IsiData.jsx). Disimpan di sessionStorage: hilang saat tab
 * ditutup, dan kedaluwarsa sendiri supaya tidak terisi ke formulir yang salah
 * berjam-jam kemudian.
 *
 * Isi: { bidang: jawaban NIB satu bidang (lib/nib.js bidangDariPersil), nop: "18 digit" | "", waktu }
 */

const KUNCI = "sensus-pajak:titipan-bidang";
const UMUR_MS = 60 * 60 * 1000;

const pendengar = new Set();
const kabari = () => {
  for (const fn of pendengar) fn(bacaTitipan());
};

export function titipBidang({ bidang, nop = "" }) {
  try {
    sessionStorage.setItem(KUNCI, JSON.stringify({ bidang, nop: /^\d{18}$/.test(nop) ? nop : "", waktu: Date.now() }));
  } catch {
    /* penyimpanan tidak tersedia: formulir tetap bisa diisi manual */
  }
  kabari();
}

/** Titipan yang masih berlaku, atau null. */
export function bacaTitipan() {
  try {
    const t = JSON.parse(sessionStorage.getItem(KUNCI) || "null");
    if (!t || !t.bidang || !t.bidang.nib || Date.now() - (t.waktu || 0) > UMUR_MS) return null;
    return t;
  } catch {
    return null;
  }
}

export function hapusTitipan() {
  try {
    sessionStorage.removeItem(KUNCI);
  } catch {
    /* penyimpanan tidak tersedia */
  }
  kabari();
}

/** Titipan terkini, ikut berubah saat dititipkan / dipakai / dibatalkan. */
export function useTitipan() {
  const [t, setT] = useState(bacaTitipan);
  useEffect(() => {
    pendengar.add(setT);
    return () => pendengar.delete(setT);
  }, []);
  return t;
}

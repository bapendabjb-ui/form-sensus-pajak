import { useEffect } from "react";

/**
 * Pasang latar lembar/modal (position:fixed) tepat di area layar yang masih terlihat.
 *
 * Tidak semua browser HP mengikuti interactive-widget=resizes-content di index.html:
 * di sana keyboard menutupi elemen fixed tanpa memperkecil layar, sehingga bagian bawah
 * lembar (kolom isian, tombol) tertutup. visualViewport selalu tahu area yang terlihat.
 *
 * Saat keyboard terbuka (area terlihat jauh lebih pendek dari tinggi penuh), latar
 * mendapat kelas `is-keyboard` - lembar boleh memakai seluruh ruang di atas keyboard -
 * dan kolom yang sedang diketik digulir ke pandangan.
 */
export function useLayarTerlihat(latarRef, aktif = true) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!aktif || !vv) return undefined;

    let tinggiPenuh = Math.max(window.innerHeight, vv.height);
    let keyboardTadi = false;
    const ikutiLayar = () => {
      const el = latarRef.current;
      if (!el) return;
      tinggiPenuh = Math.max(tinggiPenuh, vv.height);
      el.style.top = `${vv.offsetTop}px`;
      el.style.height = `${vv.height}px`;
      el.style.bottom = "auto";
      const keyboard = vv.height < tinggiPenuh * 0.8;
      el.classList.toggle("is-keyboard", keyboard);
      if (keyboard && !keyboardTadi) {
        const fokus = document.activeElement;
        if (fokus && el.contains(fokus)) fokus.scrollIntoView({ block: "nearest" });
      }
      keyboardTadi = keyboard;
    };

    ikutiLayar();
    vv.addEventListener("resize", ikutiLayar);
    vv.addEventListener("scroll", ikutiLayar);
    return () => {
      vv.removeEventListener("resize", ikutiLayar);
      vv.removeEventListener("scroll", ikutiLayar);
    };
  }, [latarRef, aktif]);
}

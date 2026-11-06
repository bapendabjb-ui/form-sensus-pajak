import { isiBalonPersil } from "./bersama.jsx";
import { navigate } from "../../lib/router.js";

/**
 * Isi balon bidang persil BPN sebagai elemen siap pasang (Google InfoWindow
 * maupun popup Leaflet): keterangan bidang, lalu data sensus yang mencatatnya.
 * Tombol "Buka" di daftar sensus membuka datanya di aplikasi.
 *
 * @param {object} properti  properties Feature bidang (server/src/persil.js propertiPeta + sensus)
 * @param {() => void} [tutup]  menutup balon sebelum berpindah layar
 */
export function elemenBalonPersil(properti, tutup) {
  const el = document.createElement("div");
  el.innerHTML = isiBalonPersil(properti); // semua teks sudah di-escape
  el.addEventListener("click", (e) => {
    const tombol = e.target.closest("[data-url]");
    if (!tombol) return;
    tutup?.();
    navigate(tombol.dataset.url);
  });
  return el;
}

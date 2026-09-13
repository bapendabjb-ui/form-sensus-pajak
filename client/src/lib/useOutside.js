import { useEffect } from "react";

/** Tutup popover saat klik di luar elemen atau menekan Escape. */
export function useOutside(ref, onClose, aktif = true) {
  useEffect(() => {
    if (!aktif) return undefined;

    const handleKlik = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const handleTombol = (e) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleKlik);
    document.addEventListener("keydown", handleTombol);
    return () => {
      document.removeEventListener("mousedown", handleKlik);
      document.removeEventListener("keydown", handleTombol);
    };
  }, [ref, onClose, aktif]);
}

import { useEffect, useState } from "react";

/** Batas tata letak HP — sama dengan media query utama di styles.css. */
export const QUERY_HP = "(max-width: 820px)";

/** true bila layar selebar HP/tablet kecil; ikut berubah saat layar diputar. */
export function useMobile() {
  const [hp, setHp] = useState(() => window.matchMedia(QUERY_HP).matches);

  useEffect(() => {
    const mq = window.matchMedia(QUERY_HP);
    const perbarui = () => setHp(mq.matches);
    perbarui();
    mq.addEventListener("change", perbarui);
    return () => mq.removeEventListener("change", perbarui);
  }, []);

  return hp;
}

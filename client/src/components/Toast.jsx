import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ToastContext = createContext(() => {});

/** Ambil fungsi toast: toast("Tersimpan.") atau toast("Gagal.", true). */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const fire = useCallback((msg, err = false) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, err, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), err ? 4200 : 2600);
  }, []);

  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={fire}>
      {children}
      {toast && (
        <div className={"fk-toast" + (toast.err ? " is-err" : "")} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}

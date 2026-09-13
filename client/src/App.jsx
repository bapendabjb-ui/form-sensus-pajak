import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";
import { ToastProvider } from "./components/Toast.jsx";
import { CheckIcon, IconGrid, IconDoc, IconUser, IconList, IconLock } from "./components/Icons.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import KertasKerjaPage from "./pages/KertasKerjaPage.jsx";
import PetugasPage from "./pages/PetugasPage.jsx";
import FormulirPage from "./pages/FormulirPage.jsx";

const NAV = [
  { key: "dashboard", label: "Dashboard", Icon: IconGrid },
  { key: "kk", label: "Kertas Kerja", Icon: IconDoc },
  { key: "petugas", label: "Petugas", Icon: IconUser },
  { key: "forms", label: "Formulir", Icon: IconList, admin: true },
];

function Shell() {
  const [view, setView] = useState("dashboard");
  const [admin, setAdmin] = useState(api.isLoggedIn());
  // Permintaan navigasi ke halaman Kertas Kerja: { jenis: "list" | "baru" | "buka", id? }
  const [permintaan, setPermintaan] = useState(null);

  // Ikuti perubahan status login (termasuk token kedaluwarsa saat request).
  useEffect(() => api.onAuthChange(setAdmin), []);

  // Verifikasi token tersimpan saat aplikasi dibuka.
  useEffect(() => {
    api.cekSesi().then((ok) => setAdmin(ok));
  }, []);

  const pindah = (key) => {
    setView(key);
    if (key === "kk") setPermintaan({ jenis: "list" });
  };

  const buatKertasKerja = () => {
    setView("kk");
    setPermintaan({ jenis: "baru" });
  };

  const bukaKertasKerja = (id) => {
    setView("kk");
    setPermintaan({ jenis: "buka", id });
  };

  const permintaanDiproses = useCallback(() => setPermintaan(null), []);

  const keluar = () => {
    api.clearToken();
    setView("dashboard");
  };

  return (
    <div className="fk-app">
      <aside className="fk-side">
        <div className="fk-side-logo">
          <span className="fk-logo">
            <CheckIcon />
          </span>
          <span className="fk-word">FormKita</span>
        </div>

        <nav className="fk-nav" aria-label="Navigasi utama">
          {NAV.map(({ key, label, Icon, admin: perluAdmin }) => (
            <button
              type="button"
              key={key}
              className={"fk-nav-item" + (view === key ? " is-active" : "")}
              onClick={() => pindah(key)}
              aria-current={view === key ? "page" : undefined}
            >
              <span className="fk-nav-ic">
                <Icon />
              </span>
              <span className="fk-nav-label">{label}</span>
              {perluAdmin && !admin && (
                <span className="fk-nav-lock" title="Perlu login admin">
                  <IconLock />
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="fk-side-foot">
          {admin ? (
            <div className="fk-admin-row">
              <span className="fk-admin-badge">● Admin</span>
              <button type="button" className="fk-logout" onClick={keluar}>
                Keluar
              </button>
            </div>
          ) : (
            <span className="fk-side-note">Mode pengguna</span>
          )}
        </div>
      </aside>

      <div className="fk-content">
        <main className="fk-main">
          {view === "dashboard" && (
            <Dashboard
              onNew={buatKertasKerja}
              onOpen={bukaKertasKerja}
              onGoForms={() => setView("forms")}
            />
          )}

          {view === "kk" && (
            <KertasKerjaPage
              permintaan={permintaan}
              onPermintaanDiproses={permintaanDiproses}
            />
          )}

          {view === "petugas" && <PetugasPage />}

          {view === "forms" && (
            <FormulirPage admin={admin} onAuthChanged={() => setAdmin(api.isLoggedIn())} />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

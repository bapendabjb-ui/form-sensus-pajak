import { useEffect, useState } from "react";
import * as api from "./api.js";
import { ToastProvider } from "./components/Toast.jsx";
import { Empty } from "./components/Ui.jsx";
import { CheckIcon, IconGrid, IconDoc, IconUser, IconList, IconLock } from "./components/Icons.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import { DaftarKertasKerja, BuatKertasKerja, DetailKertasKerja, IsiData } from "./pages/KertasKerjaPage.jsx";
import PetugasPage from "./pages/PetugasPage.jsx";
import FormulirPage from "./pages/FormulirPage.jsx";
import { useLokasi, navigate, kembali, cocokkanRute } from "./lib/router.js";

const NAV = [
  { tab: "dashboard", path: "/", label: "Dashboard", pendek: "Beranda", Icon: IconGrid },
  { tab: "kk", path: "/kertas-kerja", label: "Kertas Kerja", pendek: "Kertas Kerja", Icon: IconDoc },
  { tab: "petugas", path: "/petugas", label: "Petugas", pendek: "Petugas", Icon: IconUser },
  { tab: "formulir", path: "/formulir", label: "Formulir", pendek: "Formulir", Icon: IconList, admin: true },
];

const IconKembali = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 18-6-6 6-6" />
  </svg>
);

/** Klik tautan internal tanpa memuat ulang halaman (Ctrl/Cmd+klik tetap membuka tab baru). */
const klikTautan = (path) => (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(path);
};

/** Tandai <html> saat papan ketik kemungkinan terbuka, agar bilah tab disembunyikan. */
function usePenandaKetik() {
  useEffect(() => {
    const html = document.documentElement;
    const sedangKetik = () => {
      const el = document.activeElement;
      if (!el) return false;
      if (el.tagName === "TEXTAREA") return true;
      if (el.tagName !== "INPUT") return false;
      return !["checkbox", "radio", "file", "button", "submit", "range", "color"].includes(el.type);
    };
    const perbarui = () => html.classList.toggle("fk-ketik", sedangKetik());
    const saatLepas = () => setTimeout(perbarui, 80);
    document.addEventListener("focusin", perbarui);
    document.addEventListener("focusout", saatLepas);
    return () => {
      document.removeEventListener("focusin", perbarui);
      document.removeEventListener("focusout", saatLepas);
    };
  }, []);
}

function Shell() {
  const lokasi = useLokasi();
  const rute = cocokkanRute(lokasi);
  const [admin, setAdmin] = useState(api.isLoggedIn());

  usePenandaKetik();

  // Ikuti perubahan status login (termasuk token kedaluwarsa saat request).
  useEffect(() => api.onAuthChange(setAdmin), []);

  // Verifikasi token tersimpan saat aplikasi dibuka.
  useEffect(() => {
    api.cekSesi().then((ok) => setAdmin(ok));
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = rute.nama === "dashboard" ? "FormKita" : `${rute.judul} · FormKita`;
  }, [lokasi]); // eslint-disable-line react-hooks/exhaustive-deps

  // Layar pengisian tidak menampilkan bilah tab supaya ruang layar lega.
  useEffect(() => {
    document.documentElement.classList.toggle("fk-tanpa-tab", Boolean(rute.fokus));
  }, [rute.fokus]);

  const keluar = () => {
    api.clearToken();
    navigate("/");
  };

  let halaman;
  switch (rute.nama) {
    case "dashboard":
      halaman = <Dashboard />;
      break;
    case "kk-list":
      halaman = <DaftarKertasKerja />;
      break;
    case "kk-baru":
      halaman = <BuatKertasKerja />;
      break;
    case "kk-detail":
      halaman = <DetailKertasKerja key={rute.id} id={rute.id} />;
      break;
    case "isi":
      halaman = <IsiData key={lokasi} kkId={rute.kkId} formulirId={rute.formulirId} />;
      break;
    case "ubah":
      halaman = <IsiData key={lokasi} kkId={rute.kkId} entriId={rute.entriId} />;
      break;
    case "petugas":
      halaman = <PetugasPage />;
      break;
    case "formulir":
      halaman = <FormulirPage admin={admin} onAuthChanged={() => setAdmin(api.isLoggedIn())} />;
      break;
    default:
      halaman = (
        <Empty
          action={
            <button type="button" className="fk-btn" onClick={() => navigate("/", { replace: true })}>
              Ke Dashboard
            </button>
          }
        >
          Halaman tidak ditemukan.
        </Empty>
      );
  }

  return (
    <div className={"fk-app" + (rute.fokus ? " is-fokus" : "")}>
      {/* ---------- desktop: sidebar ---------- */}
      <aside className="fk-side">
        <a className="fk-side-logo" href="/" onClick={klikTautan("/")}>
          <span className="fk-logo">
            <CheckIcon />
          </span>
          <span className="fk-word">FormKita</span>
        </a>

        <nav className="fk-nav" aria-label="Navigasi utama">
          {NAV.map(({ tab, path, label, Icon, admin: perluAdmin }) => (
            <a
              key={tab}
              href={path}
              onClick={klikTautan(path)}
              className={"fk-nav-item" + (rute.tab === tab ? " is-active" : "")}
              aria-current={rute.tab === tab ? "page" : undefined}
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
            </a>
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

      {/* ---------- HP: bilah atas kontekstual ---------- */}
      <header className="fk-appbar">
        {rute.kembali ? (
          <button type="button" className="fk-appbar-btn" onClick={() => kembali(rute.kembali)} aria-label="Kembali">
            <IconKembali />
          </button>
        ) : (
          <span className="fk-logo fk-appbar-logo" aria-hidden="true">
            <CheckIcon />
          </span>
        )}
        <h1 className="fk-appbar-judul">{rute.nama === "dashboard" ? "FormKita" : rute.judul}</h1>
        {admin && (
          <button type="button" className="fk-appbar-aksi" onClick={keluar}>
            Keluar
          </button>
        )}
      </header>

      <div className="fk-content">
        <main className="fk-main">{halaman}</main>
      </div>

      {/* ---------- HP: bilah tab bawah ---------- */}
      {!rute.fokus && (
        <nav className="fk-tabbar" aria-label="Navigasi utama">
          {NAV.map(({ tab, path, pendek, Icon, admin: perluAdmin }) => (
            <a
              key={tab}
              href={path}
              onClick={klikTautan(path)}
              className={"fk-tab" + (rute.tab === tab ? " is-active" : "")}
              aria-current={rute.tab === tab ? "page" : undefined}
            >
              <span className="fk-tab-ikon">
                <Icon />
              </span>
              <span>{pendek}</span>
              {perluAdmin && !admin && (
                <span className="fk-tab-kunci" aria-label="perlu login admin">
                  <IconLock />
                </span>
              )}
            </a>
          ))}
        </nav>
      )}
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

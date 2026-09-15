import { useEffect, useState } from "react";
import * as api from "./api.js";
import { ToastProvider } from "./components/Toast.jsx";
import { DialogProvider } from "./components/Dialog.jsx";
import { Empty } from "./components/Ui.jsx";
import { Lambang, IconKembali, IconGrid, IconDoc, IconUser, IconList, IconLock, IconUnduh } from "./components/Icons.jsx";
import LoginAdmin from "./components/LoginAdmin.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import { DaftarKertasKerja, BuatKertasKerja, DetailKertasKerja, IsiData } from "./pages/KertasKerjaPage.jsx";
import PetugasPage from "./pages/PetugasPage.jsx";
import FormulirPage from "./pages/FormulirPage.jsx";
import AkunPage from "./pages/AkunPage.jsx";
import EksporPage from "./pages/EksporPage.jsx";
import { AdminContext } from "./lib/admin.js";
import { useLokasi, navigate, kembali, cocokkanRute } from "./lib/router.js";

const NAV = [
  { tab: "dashboard", path: "/", label: "Dashboard", pendek: "Dashboard", Icon: IconGrid },
  { tab: "kk", path: "/kertas-kerja", label: "Kertas Kerja", pendek: "Kertas Kerja", Icon: IconDoc },
  { tab: "petugas", path: "/petugas", label: "Petugas", pendek: "Petugas", Icon: IconUser },
  { tab: "ekspor", path: "/ekspor", label: "Ekspor", pendek: "Ekspor", Icon: IconUnduh },
  { tab: "formulir", path: "/formulir", label: "Formulir", pendek: "Formulir", Icon: IconList, admin: true },
];

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
    document.title = rute.nama === "dashboard" ? "Sensus Pajak" : `${rute.judul} · Sensus Pajak`;
  }, [lokasi]); // eslint-disable-line react-hooks/exhaustive-deps

  // Layar pengisian tidak menampilkan bilah tab supaya ruang layar lega.
  useEffect(() => {
    document.documentElement.classList.toggle("fk-tanpa-tab", Boolean(rute.fokus));
  }, [rute.fokus]);

  const keluar = () => {
    api.clearToken();
    navigate("/");
  };

  const masuk = () => navigate("/masuk");

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
    case "ekspor":
      halaman = <EksporPage />;
      break;
    case "formulir":
      halaman = <FormulirPage admin={admin} onAuthChanged={() => setAdmin(api.isLoggedIn())} />;
      break;
    case "masuk":
      // Setelah berhasil masuk, kembali ke layar yang tadi ditinggalkan.
      halaman = <LoginAdmin onLoggedIn={() => kembali("/")} />;
      break;
    case "akun":
      // Belum login: tampilkan login di tempat; status admin berubah lewat onAuthChange.
      halaman = admin ? <AkunPage onKeluar={keluar} /> : <LoginAdmin onLoggedIn={() => {}} />;
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
          <Lambang />
          <span className="fk-word">Sensus Pajak</span>
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
              <span className="fk-side-aksi">
                <button type="button" className="fk-side-akun" onClick={() => navigate("/akun")}>
                  Akun
                </button>
                <button type="button" className="fk-logout" onClick={keluar}>
                  Keluar
                </button>
              </span>
            </div>
          ) : (
            <button type="button" className="fk-side-masuk" onClick={masuk}>
              <IconLock />
              <span>Masuk admin</span>
            </button>
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
          <Lambang className="fk-appbar-logo" />
        )}
        <h1 className="fk-appbar-judul">{rute.nama === "dashboard" ? "Sensus Pajak" : rute.judul}</h1>
        {admin ? (
          // Di HP, Keluar ada di halaman Akun supaya tidak tertekan tanpa sengaja.
          rute.nama !== "akun" && (
            <button type="button" className="fk-appbar-aksi" onClick={() => navigate("/akun")}>
              Akun
            </button>
          )
        ) : (
          rute.nama !== "masuk" && (
            <button type="button" className="fk-appbar-aksi" onClick={masuk}>
              Masuk
            </button>
          )
        )}
      </header>

      <div className="fk-content">
        <main className="fk-main">
          {/* Hanya halaman yang perlu tahu status admin; sidebar & bilah atas memakai `admin` langsung. */}
          <AdminContext.Provider value={admin}>{halaman}</AdminContext.Provider>
        </main>
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
      {/* DialogProvider juga memasang konfirmasi "isian belum disimpan" milik router. */}
      <DialogProvider>
        <Shell />
      </DialogProvider>
    </ToastProvider>
  );
}

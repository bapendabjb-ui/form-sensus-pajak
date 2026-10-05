import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
// Font disajikan dari server aplikasi sendiri, bukan Google Fonts: CSP tetap
// 'self', dan tampilan tidak bergantung pada koneksi ke Google. Hanya huruf
// Latin dan ketebalan yang dipakai styles.css.
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

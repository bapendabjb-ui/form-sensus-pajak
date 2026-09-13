import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Saat pengembangan, /api diteruskan ke server Express (default port 4000).
// Saat produksi, Express sendiri yang menyajikan hasil build ini.
const API_TARGET = process.env.VITE_API_TARGET || "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});

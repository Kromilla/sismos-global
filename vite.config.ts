import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50MB para soportar el .wasm de DuckDB
        globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"]
      },
      manifest: {
        name: "Sismos Global",
        short_name: "Sismos",
        description: "Catálogo sísmico mundial en tiempo real",
        theme_color: "#070b14",
      }
    })
  ],
});

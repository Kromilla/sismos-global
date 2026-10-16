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
      injectRegister: "auto",
      workbox: {
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
        // No pre-cachear el wasm de DuckDB — es muy grande y se carga bajo demanda
        globIgnores: ["**/duckdb-eh*.wasm", "**/duckdb-mvp*.wasm"],
        runtimeCaching: [
          {
            // Capa de caché para las APIs sísmicas (USGS, EMSC, etc.)
            urlPattern: /^https:\/\/(earthquake\.usgs\.gov|www\.seismicportal\.eu|webservices\.ingv\.it|service\.geonet\.org\.nz|earthquake\.ga\.gov\.au|geofon\.gfz-potsdam\.de)/,
            handler: "NetworkFirst",
            options: {
              cacheName: "seismic-api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 600 }, // 10 min
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
      manifest: {
        name: "Sismos Global",
        short_name: "Sismos",
        description:
          "Catálogo sísmico mundial en tiempo real. Análisis estadístico, pronóstico probabilístico y amenaza sísmica en el navegador, sin servidor.",
        theme_color: "#070b14",
        background_color: "#070b14",
        display: "standalone",
        orientation: "any",
        start_url: "./",
        scope: "./",
        lang: "es",
        categories: ["science", "education", "utilities"],
        icons: [
          {
            src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%23070b14'/%3E%3Ctext y='.9em' font-size='80' x='10'%3E%F0%9F%8C%8E%3C/text%3E%3C/svg%3E",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
        shortcuts: [
          {
            name: "Mapa en vivo",
            short_name: "Mapa",
            description: "Ver sismicidad de los últimos 7 días",
            url: "./#mapa",
            icons: [{ src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%97%BA%3C/text%3E%3C/svg%3E", sizes: "any" }],
          },
          {
            name: "Pronóstico",
            short_name: "Pronóstico",
            description: "Probabilidades ETAS y Poisson",
            url: "./#pronostico",
            icons: [{ src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%93%88%3C/text%3E%3C/svg%3E", sizes: "any" }],
          },
        ],
      },
    }),
  ],
});

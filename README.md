<div align="center">

<img src="./public/og-banner.svg" alt="Sismos Global — Computational Seismology, PSHA, ETAS & DuckDB-WASM Analytics" width="100%" />

<br />

# 🌍 Sismos Global (`Quakes Global`)

**Catálogo sísmico mundial multi-agencia, sismología computacional (Gutenberg–Richter, Weichert, Omori–Utsu, ETAS, PSHA + $V_{s30}$) y almacén analítico OLAP con DuckDB-WASM — 100 % en el navegador.**

*Browser-native computational seismology, probabilistic hazard & aftershock forecasting, and in-browser DuckDB-WASM analytics. Zero backend, zero monthly cost, MIT licensed.*

[![CI](https://github.com/Kromilla/sismos-global/actions/workflows/ci.yml/badge.svg)](https://github.com/Kromilla/sismos-global/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-38bdf8.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6.svg)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19-149eca.svg)](https://react.dev/)
[![DuckDB-WASM](https://img.shields.io/badge/DuckDB--WASM-OLAP%20%2B%20Parquet-facc15.svg)](https://duckdb.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-4ade80.svg)](https://github.com/Kromilla/sismos-global/pulls)

[**Explorar en Español**](#-qué-es-sismos-global) · [**English Overview**](#-english-summary--architecture-highlights) · [**Modelos Científicos**](#-modelos-científicos-y-matemáticos) · [**Arquitectura de Ingeniería**](#-arquitectura-de-ingeniería-destacados-técnicos) · [**Cómo Citar**](#-cómo-citar--citation)

</div>

---

## 🎯 ¿Qué es Sismos Global?

**Sismos Global** es una plataforma abierta de **sismología computacional e ingeniería de datos en el navegador**. Conecta en tiempo real **8 redes sísmicas internacionales vía FDSN** (**USGS**, **EMSC**, **GeoNet**, **INGV**, **GFZ**, **IPGP**, **Geoscience Australia**, **SSN México**) más el catálogo histórico integrado del **Servicio Geológico Colombiano (SGC desde 1610)**, cubriendo **49 zonas sismogénicas** y **98 ciudades de referencia** en todo el planeta.

> **Advertencia científica:** Esta aplicación **no predice terremotos deterministas** (nadie puede anticipar día, lugar y magnitud exactos de un sismo). Lo que implementa —siguiendo la metodología del USGS, GEM/OpenQuake y los servicios geológicos nacionales— es **pronóstico probabilístico operacional (OEF)** y **análisis probabilístico de amenaza sísmica (PSHA)** completamente auditable en código abierto.

---

## ✨ Módulos y Capacidades

| Módulo | Capacidades principales |
| :--- | :--- |
| **🗺️ Mapa Global + Time-Lapse** | Sismicidad en vivo (últimos 30 días, $M \ge 2.5$) o catálogo histórico desde 1610/1900. Superposición de **límites de placas tectónicas** con velocidades de convergencia ($\text{mm/año}$), mapa de calor ponderado por energía, **reproductor Time-Lapse** ($1\times, 5\times, 20\times$), proyección de **anillos de isosistas (MMI IV–VIII)** y geolocalización **«📍 Cerca de mí»**. |
| **📋 Eventos y Ficha Sísmica** | Catálogo tabulado con ordenamiento bidireccional, buscador instantáneo, filtros de tsunami e intensidad instrumental/ciudadana (`MMI`/`DYFI`), exportación a **CSV** y **GeoJSON**, y generador de **tarjetas infográficas PNG ($1200 \times 630$)** con Canvas 2D. |
| **📈 Análisis y Corte 2D** | Ajuste de **Gutenberg–Richter** ($b$ por máxima verosimilitud de Aki y error de Shi & Bolt), magnitud de completitud ($M_c$), actividad anual, histograma horario UTC para auditar sesgo diurno/nocturno y **perfil hipocentral en corte transversal 2D ($W\to E, S\to N, NW\to SE, SW\to NE$)** para visualizar la losa de subducción de **Wadati–Benioff**. |
| **🔮 Pronóstico (Web Worker)** | Pronóstico a corto plazo con **ETAS temporal (Ogata 1988)**, referencia estacionaria de **Poisson con corrección de Weichert (1980)**, secuencias de réplicas activas ajustadas con **Omori–Utsu** + **Ley de Båth**, validación retrospectiva (*backtesting* fuera de muestra) y ranking mundial de las **49 zonas sismogénicas** ejecutado en un **Web Worker** dedicado. |
| **🏗️ Amenaza e Intensidad (PSHA + $V_{s30}$)** | Motor **PSHA puntual (Cornell–McGuire)** en Web Worker para **98 ciudades o tus coordenadas GPS**: curva de amenaza, intensidad y PGA de diseño para **475 años** ($10\%$ en 50 años) y **2475 años** ($2\%$ en 50 años), desagregación magnitud–distancia, selector de **clase de suelo NEHRP ($V_{s30}$ desde roca firme $760\text{ m/s}$ hasta arcilla lacustre $150\text{ m/s}$)**, simulador interactivo con **acelerograma sintético SVG** y ventana de alerta temprana ($\Delta t_{S-P}$). |
| **🦆 Almacén OLAP (DuckDB-WASM)** | Motor analítico **DuckDB en WebAssembly** con **esquema estrella** (`fact_sismo` + 4 dimensiones + 3 vistas analíticas), consola SQL con historial persistente y exportación nativa a **Apache Parquet** y **CSV**. |
| **🔔 Alertas en Vivo, PWA e i18n** | Modo **En vivo** con auto-refresco, alertas sonoras sintetizadas con **Web Audio API** + notificaciones nativas del navegador, **paleta de comandos (`Ctrl+K` / `⌘K`)**, soporte **PWA offline** (Service Worker + IndexedDB) e interfaz bilingüe (**Español / English**) con estado sincronizado en la URL. |

---

## 🔬 Modelos Científicos y Matemáticos

Todos los algoritmos están implementados desde cero en TypeScript puro bajo `src/science/`, con pruebas unitarias automatizadas (`vitest`):

1. **Ley de Gutenberg–Richter (`src/science/gutenbergRichter.ts`)**
   - $\log_{10} N(M \ge m) = a - b\,m$.
   - Estimador de máxima verosimilitud de **Aki (1965)**:
     $$b = \frac{\log_{10} e}{\bar{M} - (M_c - \Delta M / 2)}$$
   - Incertidumbre estándar de **Shi & Bolt (1982)** y magnitud de completitud $M_c$ por máxima curvatura (**Wiemer & Wyss, 2000**).
2. **Completitud por Bandas y Método de Weichert (`src/science/completeness.ts`)**
   - Un catálogo histórico que mezcla registros desde 1610 con redes instrumentales modernas tiene ventanas de observación desiguales por banda de magnitud.
   - Resuelve por Newton–Raphson la verosimilitud de **Weichert (1980)** para periodos de exposición desiguales $t_i$: evita subestimar en más de un $60\%$ la tasa de sismos grandes.
3. **Desagrupamiento Espacio-Temporal (`src/science/declustering.ts`)**
   - Ventanas dinámicas de **Gardner & Knopoff (1974)** en distancia $R(M) = 10^{0.1238 M + 0.983}\text{ km}$ y tiempo $T(M)$ para separar sismicidad de fondo, eventos principales, premonitores y réplicas.
4. **Ley de Omori–Utsu y Reasenberg–Jones (`src/science/omori.ts`)**
   - Ajuste por máxima verosimilitud sobre el proceso puntual de la tasa de réplicas $n(t) = K\,(t + c)^{-p}$, con solución analítica de $K$ e integración exacta en el horizonte $[t_1, t_2]$.
5. **Modelo ETAS Temporal (`src/science/etas.ts`)**
   - **Epidemic-Type Aftershock Sequence (Ogata, 1988)**:
     $$\lambda(t) = \mu + \sum_{t_i < t} K_0\,10^{\alpha(M_i - M_c)}(t - t_i + c)^{-p}$$
   - Calibrado con la razón de ramificación observada del catálogo desagrupado y factor de cascada $1/(1 - n)$.
6. **Amenaza Sísmica Probabilística — PSHA (`src/science/psha.ts`)**
   - Integral de **Cornell–McGuire** sobre fuentes puntuales desagrupadas con distribución de Gutenberg–Richter truncada en $[M_c, M_{\max}]$ y propagación de la incertidumbre aleatoria $\sigma(R_{\text{hypo}})$ de la IPE.
   - Incluye ecuaciones de predicción de intensidad (**Allen, Wald & Worden, 2012** y **Atkinson & Wald, 2007**), conversión $\text{MMI} \leftrightarrow \text{PGA}$ (**Worden et al., 2012**), longitud de ruptura subsuperficial (**Wells & Coppersmith, 1994**), momento sísmico escalar $M_0 = 10^{1.5 M_w + 9.05}\text{ N}\cdot\text{m}$ (**Hanks & Kanamori, 1979**) y amplificación local por sitio $V_{s30}$ (**Borcherdt, 1994**).

---

## 🏗️ Arquitectura de Ingeniería (Destacados Técnicos)

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                        8 Redes FDSN + SGC (1610–hoy)                       │
│     USGS · EMSC · GeoNet · INGV · GFZ · IPGP · GA · SSN · SGC ArcGIS      │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │  Particionado adaptativo + Deduplicación
                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│              Capa de Ingesta y Caché Offline (IndexedDB + SW)              │
│   Parsers GeoJSON / SeismicPortal JSON / FDSN Text (|) · Manejo HTTP 204   │
└──────────┬───────────────────────────────────┬─────────────────────────────┘
           │                                   │
           ▼                                   ▼
┌──────────────────────────────────┐ ┌───────────────────────────────────────┐
│  Web Workers Científicos (60fps) │ │    Almacén OLAP en DuckDB-WASM        │
│  • forecast.worker.ts (49 zonas) │ │  • Esquema Estrella (fact + 4 dims)   │
│  • psha.worker.ts (Cornell PSHA) │ │  • Exportación nativa Parquet y CSV   │
└──────────┬───────────────────────┘ └───────────────────┬───────────────────┘
           │                                             │
           └──────────────────────┬──────────────────────┘
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                Interfaz React 19 + TypeScript + Tailwind 4                 │
│  Leaflet (Placas + Isosistas + Time-lapse) · Recharts (Corte 2D + Curvas)  │
│  Canvas 2D PNG Cards · Web Audio API Alerts · Paleta ⌘K · URL Deep-Links   │
└────────────────────────────────────────────────────────────────────────────┘
```

### Por qué destaca como proyecto de ingeniería:
- **Cero Backend, Escala Global:** Particionado automático de ventanas temporales para superar el límite de $20\,000$ eventos por consulta de las APIs FDSN, con fusión y deduplicación espacio-temporal ($\Delta t < 15\text{ s}$, $\Delta d < 50\text{ km}$) entre agencias.
- **Cómputo Paralelo en Web Workers:** Tanto el motor PSHA como la evaluación simultánea de ETAS/Omori/Weichert en las 49 zonas corren fuera del hilo principal.
- **Data Warehouse en el Navegador:** Levanta **DuckDB-WASM**, modela un esquema estrella dimensional completo (`fact_sismo`, `dim_zona`, `dim_tiempo`, `dim_magnitud`, `dim_profundidad`, más 3 vistas analíticas) y exporta directamente a **Apache Parquet** en memoria.
- **Calidad y CI:** Tipado estricto con TypeScript 6, linting ultrarrápido con `oxlint`, suite de tests unitarios con `vitest` y pipeline de integración continua en GitHub Actions (`.github/workflows/ci.yml`).

---

## 🚀 Instalación y Uso Local

```bash
# 1. Clonar el repositorio
git clone https://github.com/Kromilla/sismos-global.git
cd sismos-global

# 2. Instalar dependencias
npm install

# 3. Iniciar servidor de desarrollo (http://localhost:5173)
npm run dev

# 4. Ejecutar linter, pruebas unitarias y build de producción
npm run lint
npm test
npm run build
```

### Atajos de teclado rápidos
- `Ctrl + K` / `⌘ + K` — Abrir paleta de comandos (saltar a cualquier zona sísmica o pestaña).
- `1` a `7` — Cambiar entre las 7 pestañas principales.
- `P` — Mostrar / ocultar límites de placas tectónicas en el mapa.
- `L` — Alternar idioma (`ES` / `EN`).

---

## 🌐 English Summary & Architecture Highlights

**Quakes Global (`Sismos Global`)** is an open-source, 100% browser-native computational seismology and analytical data engineering platform built with **React 19, TypeScript, Web Workers, Leaflet, Recharts, and DuckDB-WASM**.

- **Multi-Agency FDSN Ingestion:** Connects directly to **USGS, EMSC, GeoNet, INGV, GFZ, IPGP, Geoscience Australia, SSN Mexico**, and **Colombia's SGC historical catalog (since 1610)** with automatic time-window chunking and spatio-temporal deduplication.
- **Rigorous Seismological Models:** Implements **Gutenberg–Richter** (Aki 1965 MLE & Weichert 1980 unequal observation periods), **Gardner–Knopoff (1974)** declustering, **Omori–Utsu** aftershock decay, **temporal ETAS (Ogata 1988)**, **Cornell–McGuire point-source PSHA** with **$V_{s30}$ NEHRP site amplification**, **2D Wadati–Benioff hypocentral cross-sections**, and **synthetic P/S wave accelerograms**.
- **In-Browser OLAP Warehouse:** Embeds **DuckDB-WASM** with a dimensional star schema and native **Apache Parquet** & **CSV** export.

---

## 📖 Cómo Citar / Citation

Este repositorio incluye metadatos estándar en [`CITATION.cff`](./CITATION.cff). Si utilizas este proyecto en docencia, investigación o como referencia de arquitectura:

```bibtex
@software{sismos_global_2026,
  author       = {Carlos},
  title        = {Sismos Global: Browser-Native Computational Seismology, PSHA, ETAS Forecasting & DuckDB-WASM Analytics},
  year         = {2026},
  version      = {1.0.0},
  license      = {MIT},
  url          = {https://github.com/Kromilla/sismos-global}
}
```

---

## 📄 Licencia

Distribuido bajo la licencia **MIT**. Consulta el archivo [`LICENSE`](./LICENSE) para más detalles.
Si este proyecto te resulta útil, **¡no olvides darle una estrella (★) en GitHub!**

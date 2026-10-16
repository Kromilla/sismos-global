/**
 * useQuakeStore — Store global de la aplicación (Zustand).
 *
 * Centraliza el estado reactivo de:
 *  - Navegación (pestañas)
 *  - Filtros sísmicos (magnitud, profundidad, zona, década, clases)
 *  - Fuentes y catálogos (USGS, EMSC, etc.)
 *  - Enfoque del mapa y sismo seleccionado
 *  - Sincronización automática con query params de la URL (?quake=, ?tab=, ?region=, ?mag=)
 *  - Modales y paneles (alertas, live feed, MMI)
 */

import { create } from "zustand";
import type { CatalogSource, Quake, Tab } from "../types";

export const MIN_MAG_MUNDO = 5;
export const MIN_MAG_ZONA = 4.5;

export interface MapFocus {
  lat: number;
  lon: number;
  zoom: number;
}

function parseUrlParams(): {
  tab: Tab;
  regionId: string;
  minMag: number;
  quakeId: string | null;
} {
  if (typeof window === "undefined") {
    return { tab: "mapa", regionId: "", minMag: 0, quakeId: null };
  }
  const sp = new URLSearchParams(window.location.search);
  const rawTab = sp.get("tab") as Tab | null;
  const validTabs: Tab[] = [
    "mapa",
    "eventos",
    "analisis",
    "pronostico",
    "intensidad",
    "almacen",
    "aprender",
  ];
  const tab = rawTab && validTabs.includes(rawTab) ? rawTab : "mapa";
  const regionId = sp.get("region") || "";
  const rawMag = sp.get("mag");
  const minMag = rawMag && !isNaN(Number(rawMag)) ? Number(rawMag) : 0;
  const quakeId = sp.get("quake") || null;
  return { tab, regionId, minMag, quakeId };
}

function writeUrlParams(params: {
  tab?: Tab;
  regionId?: string;
  minMag?: number;
  quakeId?: string | null;
}) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);

  if (params.tab !== undefined) {
    if (params.tab === "mapa") url.searchParams.delete("tab");
    else url.searchParams.set("tab", params.tab);
  }
  if (params.regionId !== undefined) {
    if (!params.regionId) url.searchParams.delete("region");
    else url.searchParams.set("region", params.regionId);
  }
  if (params.minMag !== undefined) {
    if (params.minMag <= 0) url.searchParams.delete("mag");
    else url.searchParams.set("mag", String(params.minMag));
  }
  if (params.quakeId !== undefined) {
    if (!params.quakeId) url.searchParams.delete("quake");
    else url.searchParams.set("quake", params.quakeId);
  }

  window.history.replaceState(null, "", url.toString());
}

interface QuakeState {
  // Navegación
  tab: Tab;
  setTab: (tab: Tab) => void;

  // Filtros
  source: "reciente" | "historico";
  setSource: (source: "reciente" | "historico") => void;

  minMag: number;
  setMinMag: (minMag: number) => void;

  maxDepth: number;
  setMaxDepth: (maxDepth: number) => void;

  regionId: string;
  setRegionId: (regionId: string) => void;

  colorBy: "mag" | "depth";
  setColorBy: (colorBy: "mag" | "depth") => void;

  showHeat: boolean;
  setShowHeat: (showHeat: boolean) => void;

  showRegions: boolean;
  setShowRegions: (showRegions: boolean) => void;

  histStartYear: number;
  setHistStartYear: (year: number) => void;

  histMinMag: number;
  setHistMinMag: (minMag: number) => void;

  catalogSource: CatalogSource;
  setCatalogSource: (source: CatalogSource) => void;

  clasesOcultas: number[];
  setClasesOcultas: (
    clases: number[] | ((prev: number[]) => number[]),
  ) => void;
  toggleClaseOculta: (clase: number) => void;

  decada: number | null;
  setDecada: (decada: number | null) => void;
  resetFiltros: () => void;

  // Enfoque y selección
  focus: MapFocus | null;
  setFocus: (focus: MapFocus | null) => void;

  selectedQuake: Quake | null;
  setSelectedQuake: (quake: Quake | null) => void;

  urlQuakeId: string | null;
  setUrlQuakeId: (id: string | null) => void;

  focusOn: (q: Quake) => void;

  // Modales y Paneles
  intensityQuake: Quake | null;
  setIntensityQuake: (quake: Quake | null) => void;

  showAlerts: boolean;
  setShowAlerts: (show: boolean) => void;

  showLiveFeed: boolean;
  setShowLiveFeed: (
    show: boolean | ((prev: boolean) => boolean),
  ) => void;

  // Sincronización URL
  syncFromUrl: () => void;
}

const initial = parseUrlParams();

export const useQuakeStore = create<QuakeState>((set) => ({
  // Navegación
  tab: initial.tab,
  setTab: (tab) => {
    set({ tab });
    writeUrlParams({ tab });
  },

  // Filtros
  source: "reciente",
  setSource: (source) => set({ source }),

  minMag: initial.minMag,
  setMinMag: (minMag) => {
    set({ minMag });
    writeUrlParams({ minMag });
  },

  maxDepth: 800,
  setMaxDepth: (maxDepth) => set({ maxDepth }),

  regionId: initial.regionId,
  setRegionId: (regionId) => {
    const histMinMag = regionId ? MIN_MAG_ZONA : MIN_MAG_MUNDO;
    set({ regionId, histMinMag });
    writeUrlParams({ regionId });
  },

  colorBy: "mag",
  setColorBy: (colorBy) => set({ colorBy }),

  showHeat: false,
  setShowHeat: (showHeat) => set({ showHeat }),

  showRegions: false,
  setShowRegions: (showRegions) => set({ showRegions }),

  histStartYear: 1990,
  setHistStartYear: (histStartYear) => set({ histStartYear }),

  histMinMag: initial.regionId ? MIN_MAG_ZONA : MIN_MAG_MUNDO,
  setHistMinMag: (histMinMag) => set({ histMinMag }),

  catalogSource: "USGS",
  setCatalogSource: (catalogSource) => set({ catalogSource }),

  clasesOcultas: [],
  setClasesOcultas: (clases) =>
    set((state) => ({
      clasesOcultas:
        typeof clases === "function" ? clases(state.clasesOcultas) : clases,
    })),
  toggleClaseOculta: (clase) =>
    set((state) => ({
      clasesOcultas: state.clasesOcultas.includes(clase)
        ? state.clasesOcultas.filter((x) => x !== clase)
        : [...state.clasesOcultas, clase],
    })),

  decada: null,
  setDecada: (decada) => set({ decada }),
  resetFiltros: () => set({ clasesOcultas: [], decada: null }),

  // Enfoque y selección
  focus: null,
  setFocus: (focus) => set({ focus }),

  selectedQuake: null,
  setSelectedQuake: (selectedQuake) => {
    const quakeId = selectedQuake ? selectedQuake.id : null;
    set({ selectedQuake, urlQuakeId: quakeId });
    writeUrlParams({ quakeId });
  },

  urlQuakeId: initial.quakeId,
  setUrlQuakeId: (urlQuakeId) => set({ urlQuakeId }),

  focusOn: (q) => {
    set({
      selectedQuake: q,
      urlQuakeId: q.id,
      focus: { lat: q.lat, lon: q.lon, zoom: 8 },
      tab: "mapa",
    });
    writeUrlParams({ tab: "mapa", quakeId: q.id });
  },

  // Modales y Paneles
  intensityQuake: null,
  setIntensityQuake: (intensityQuake) => set({ intensityQuake }),

  showAlerts: false,
  setShowAlerts: (showAlerts) => set({ showAlerts }),

  showLiveFeed: false,
  setShowLiveFeed: (show) =>
    set((state) => ({
      showLiveFeed:
        typeof show === "function" ? show(state.showLiveFeed) : show,
    })),

  // Sincronización externa desde popstate
  syncFromUrl: () => {
    const current = parseUrlParams();
    set({
      tab: current.tab,
      regionId: current.regionId,
      minMag: current.minMag,
      urlQuakeId: current.quakeId,
    });
  },
}));

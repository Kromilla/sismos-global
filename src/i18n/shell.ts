/** Textos del shell (cabecera, pestañas, filtros). Las pestañas internas siguen en ES por ahora. */

export type Lang = "es" | "en";

export const LANGS: Lang[] = ["es", "en"];

const STORAGE_KEY = "sismos-global-lang";

export function detectLang(): Lang {
  if (typeof window === "undefined") return "es";
  const fromUrl = new URLSearchParams(window.location.search).get("lang");
  if (fromUrl === "en" || fromUrl === "es") return fromUrl;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
  } catch {
    /* private mode */
  }
  const nav = navigator.language?.toLowerCase() ?? "es";
  return nav.startsWith("en") ? "en" : "es";
}

export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}

type TabId =
  | "mapa"
  | "eventos"
  | "analisis"
  | "pronostico"
  | "intensidad"
  | "almacen"
  | "aprender";

export interface ShellCopy {
  title: string;
  subtitle: string;
  lastEvent: string;
  strongest30d: string;
  refresh: string;
  share: string;
  shared: string;
  shareFailed: string;
  tabs: { id: TabId; label: string; hint: string }[];
  catalog: string;
  recent30: string;
  historicFrom: (year: number) => string;
  minMag: string;
  maxDepth: string;
  zone: string;
  wholePlanet: string;
  latinAmerica: string;
  restOfWorld: string;
  color: string;
  byMag: string;
  byDepth: string;
  heatMap: string;
  zones: string;
  catalogFrom: string;
  network: string;
  networkGroups: {
    global: string;
    europe: string;
    oceania: string;
    colombia: string;
    americas: string;
    other: string;
  };
  networkLabels: Record<string, string>;
  events: string;
  years: string;
  fromCache: string;
  downloading: (loaded: string, total: string) => string;
  querying: string;
  loadError: (err: string) => string;
  degraded: (nets: string) => string;
  decade: string;
  all: string;
  onScreen: (n: string) => string;
  clearFilters: string;
  clickToHide: string;
  showClass: string;
  hideClass: string;
  loadingModule: string;
  footer: string;
  langLabel: string;
}

const es: ShellCopy = {
  title: "Sismos",
  subtitle:
    "Catálogo mundial · USGS, EMSC, GeoNet, GA, INGV, GFZ, IPGP, SSN y SGC",
  lastEvent: "Último evento",
  strongest30d: "Mayor en 30 días",
  refresh: "Actualizar",
  share: "Compartir vista",
  shared: "Enlace copiado",
  shareFailed: "No se pudo copiar",
  tabs: [
    { id: "mapa", label: "Mapa", hint: "Sismicidad en tiempo casi real" },
    { id: "eventos", label: "Eventos", hint: "Catálogo tabulado" },
    { id: "analisis", label: "Análisis", hint: "Estadística del catálogo" },
    {
      id: "pronostico",
      label: "Pronóstico",
      hint: "Probabilidades ETAS y Poisson",
    },
    {
      id: "intensidad",
      label: "Intensidad",
      hint: "Amenaza y escenarios de daño",
    },
    { id: "almacen", label: "Almacén", hint: "Data warehouse SQL" },
    { id: "aprender", label: "Aprender", hint: "Cómo funciona todo esto" },
  ],
  catalog: "Catálogo",
  recent30: "Últimos 30 días (M≥2.5)",
  historicFrom: (year) => `Histórico desde ${year}`,
  minMag: "Magnitud mínima",
  maxDepth: "Profundidad máx",
  zone: "Zona",
  wholePlanet: "Todo el planeta",
  latinAmerica: "América Latina",
  restOfWorld: "Resto del mundo",
  color: "Color",
  byMag: "Por magnitud",
  byDepth: "Por profundidad",
  heatMap: "Mapa de calor",
  zones: "Zonas",
  catalogFrom: "Catálogo desde",
  network: "Red",
  networkGroups: {
    global: "— Global —",
    europe: "— Europa y Mediterráneo —",
    oceania: "— Oceanía y Pacífico —",
    colombia: "— Colombia (SGC) —",
    americas: "— Américas —",
    other: "— Otras redes FDSN —",
  },
  networkLabels: {
    USGS: "USGS — global (recomendado)",
    EMSC: "EMSC — SeismicPortal",
    "USGS+EMSC": "USGS + EMSC",
    INGV: "INGV — Italia",
    "USGS+INGV": "USGS + INGV",
    GFZ: "GFZ — GEOFON (Alemania)",
    "USGS+GFZ": "USGS + GFZ",
    IPGP: "IPGP — Francia",
    "USGS+IPGP": "USGS + IPGP",
    GEONET: "GeoNet — Nueva Zelanda",
    "USGS+GEONET": "USGS + GeoNet",
    GA: "Geoscience Australia",
    "USGS+GA": "USGS + GA",
    SSN: "SSN — México (UNAM)",
    "USGS+SSN": "USGS + SSN",
    ambos: "USGS + SGC — Colombia desde 1610",
    SGC: "Solo SGC — Colombia, 1610–hoy",
  },
  events: "eventos",
  years: "años",
  fromCache: "desde caché local",
  downloading: (loaded, total) =>
    `Descargando catálogo… ${loaded} de ~${total} eventos`,
  querying: "Consultando redes sísmicas…",
  loadError: (err) =>
    `No se pudo cargar el catálogo: ${err}. Revisa la conexión y pulsa Actualizar.`,
  degraded: (nets) =>
    `${nets} no respondió; se sigue con el resto de fuentes.`,
  decade: "Década",
  all: "Todas",
  onScreen: (n) => `${n} eventos en pantalla`,
  clearFilters: "Quitar filtros",
  clickToHide: "Pulsa una clase para ocultarla",
  showClass: "Mostrar esta clase",
  hideClass: "Ocultar esta clase",
  loadingModule: "Cargando módulo…",
  footer:
    "Datos: USGS Earthquake Hazards Program, redes FDSN y Servicio Geológico Colombiano (dominio público / datos abiertos). Los pronósticos son estimaciones estadísticas propias, no productos oficiales, y no predicen sismos individuales. Para decisiones de construcción o emergencia mandan las autoridades nacionales y la norma sismorresistente vigente.",
  langLabel: "Idioma",
};

const en: ShellCopy = {
  title: "Quakes",
  subtitle:
    "Global catalog · USGS, EMSC, GeoNet, GA, INGV, GFZ, IPGP, SSN & SGC",
  lastEvent: "Latest event",
  strongest30d: "Strongest in 30 days",
  refresh: "Refresh",
  share: "Share view",
  shared: "Link copied",
  shareFailed: "Could not copy",
  tabs: [
    { id: "mapa", label: "Map", hint: "Near-real-time seismicity" },
    { id: "eventos", label: "Events", hint: "Tabulated catalog" },
    { id: "analisis", label: "Analysis", hint: "Catalog statistics" },
    {
      id: "pronostico",
      label: "Forecast",
      hint: "ETAS and Poisson probabilities",
    },
    {
      id: "intensidad",
      label: "Intensity",
      hint: "Hazard and damage scenarios",
    },
    { id: "almacen", label: "Warehouse", hint: "In-browser SQL warehouse" },
    { id: "aprender", label: "Learn", hint: "How all of this works" },
  ],
  catalog: "Catalog",
  recent30: "Last 30 days (M≥2.5)",
  historicFrom: (year) => `Historical from ${year}`,
  minMag: "Minimum magnitude",
  maxDepth: "Max depth",
  zone: "Zone",
  wholePlanet: "Whole planet",
  latinAmerica: "Latin America",
  restOfWorld: "Rest of the world",
  color: "Color",
  byMag: "By magnitude",
  byDepth: "By depth",
  heatMap: "Heat map",
  zones: "Zones",
  catalogFrom: "Catalog from",
  network: "Network",
  networkGroups: {
    global: "— Global —",
    europe: "— Europe & Mediterranean —",
    oceania: "— Oceania & Pacific —",
    colombia: "— Colombia (SGC) —",
    americas: "— Americas —",
    other: "— Other FDSN networks —",
  },
  networkLabels: {
    USGS: "USGS — global (recommended)",
    EMSC: "EMSC — SeismicPortal",
    "USGS+EMSC": "USGS + EMSC",
    INGV: "INGV — Italy",
    "USGS+INGV": "USGS + INGV",
    GFZ: "GFZ — GEOFON (Germany)",
    "USGS+GFZ": "USGS + GFZ",
    IPGP: "IPGP — France",
    "USGS+IPGP": "USGS + IPGP",
    GEONET: "GeoNet — New Zealand",
    "USGS+GEONET": "USGS + GeoNet",
    GA: "Geoscience Australia",
    "USGS+GA": "USGS + GA",
    SSN: "SSN — Mexico (UNAM)",
    "USGS+SSN": "USGS + SSN",
    ambos: "USGS + SGC — Colombia since 1610",
    SGC: "SGC only — Colombia, 1610–present",
  },
  events: "events",
  years: "years",
  fromCache: "from local cache",
  downloading: (loaded, total) =>
    `Downloading catalog… ${loaded} of ~${total} events`,
  querying: "Querying seismic networks…",
  loadError: (err) =>
    `Could not load the catalog: ${err}. Check your connection and hit Refresh.`,
  degraded: (nets) =>
    `${nets} did not respond; continuing with the remaining sources.`,
  decade: "Decade",
  all: "All",
  onScreen: (n) => `${n} events on screen`,
  clearFilters: "Clear filters",
  clickToHide: "Click a class to hide it",
  showClass: "Show this class",
  hideClass: "Hide this class",
  loadingModule: "Loading module…",
  footer:
    "Data: USGS Earthquake Hazards Program, FDSN networks, and Colombia’s Geological Survey (public / open data). Forecasts are our own statistical estimates, not official products, and do not predict individual earthquakes. For building codes or emergencies, follow national authorities and the applicable seismic design standard.",
  langLabel: "Language",
};

export const SHELL: Record<Lang, ShellCopy> = { es, en };

export function localeFor(lang: Lang): string {
  return lang === "en" ? "en-US" : "es-CO";
}

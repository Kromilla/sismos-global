import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CatalogQuery, CatalogSource, Quake } from "./types";
import {
  ALL_REGIONS,
  REGIONS,
  WORLD_BBOX,
  WORLD_REGIONS,
  inBbox,
} from "./data/regions";
import { useCatalog } from "./hooks/useCatalog";
import { useShareableState } from "./hooks/useShareableState";
import MapView from "./components/MapView";
import EventsTable from "./components/EventsTable";
import QuakeIntensityPanel from "./components/QuakeIntensityPanel";
import { Badge, Note, Spinner, buttonClass, inputClass } from "./components/ui";
import { DAY_MS } from "./science/stats";
import {
  MAG_CLASSES,
  fmtAgo,
  fmtNum,
  magClass,
  magClassLabel,
  magColor,
} from "./ui/format";
import {
  SHELL,
  detectLang,
  localeFor,
  persistLang,
  type Lang,
} from "./i18n/shell";
import {
  downloadTextFile,
  quakesToCsv,
  quakesToGeoJson,
} from "./utils/exportCatalog";

const Analytics = lazy(() => import("./components/Analytics"));
const Forecast = lazy(() => import("./components/Forecast"));
const Hazard = lazy(() => import("./components/Hazard"));
const Warehouse = lazy(() => import("./components/Warehouse"));
const Learn = lazy(() => import("./components/Learn"));

type Tab =
  | "mapa"
  | "eventos"
  | "analisis"
  | "pronostico"
  | "intensidad"
  | "almacen"
  | "aprender";

const TAB_IDS = new Set<Tab>([
  "mapa",
  "eventos",
  "analisis",
  "pronostico",
  "intensidad",
  "almacen",
  "aprender",
]);

const CATALOG_SOURCES = new Set<CatalogSource>([
  "USGS",
  "SGC",
  "ambos",
  "EMSC",
  "GEONET",
  "GA",
  "INGV",
  "GFZ",
  "IPGP",
  "SSN",
  "USGS+EMSC",
  "USGS+GEONET",
  "USGS+GA",
  "USGS+INGV",
  "USGS+GFZ",
  "USGS+IPGP",
  "USGS+SSN",
]);

// 1610 y 1900 solo aportan datos con el catálogo del SGC activado.
const HIST_START_YEARS = [1610, 1900, 1950, 1970, 1990, 2000, 2010];

/**
 * Magnitud mínima por defecto según el alcance. El catálogo mundial completo
 * desde 1990 son 230.000 eventos con M≥4.5 y solo 62.000 con M≥5.0, así que
 * el umbral baja únicamente cuando se enfoca una zona y la consulta se recorta
 * a su recuadro.
 */
const MIN_MAG_MUNDO = 5;
const MIN_MAG_ZONA = 4.5;
const AUTO_REFRESH_MS = 2 * 60 * 1000;

export default function App() {
  // Instante de referencia: se actualiza cuando el modo en vivo está activo.
  const [now, setNow] = useState(() => Date.now());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const t = SHELL[lang];
  const locale = localeFor(lang);

  const [tab, setTab] = useState<Tab>("mapa");
  const [source, setSource] = useState<"reciente" | "historico">("reciente");
  const [minMag, setMinMag] = useState(2.5);
  const [maxDepth, setMaxDepth] = useState(800);
  const [regionId, setRegionId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyTsunami, setOnlyTsunami] = useState(false);
  const [onlyFelt, setOnlyFelt] = useState(false);
  const [colorBy, setColorBy] = useState<"mag" | "depth">("mag");
  const [showHeat, setShowHeat] = useState(false);
  const [showRegions, setShowRegions] = useState(false);
  const [histStartYear, setHistStartYear] = useState(1990);
  const [histMinMag, setHistMinMag] = useState(MIN_MAG_MUNDO);
  const [catalogSource, setCatalogSource] = useState<CatalogSource>("USGS");
  const [focus, setFocus] = useState<{
    lat: number;
    lon: number;
    zoom: number;
  } | null>(null);
  const [clasesOcultas, setClasesOcultas] = useState<number[]>([]);
  const [decada, setDecada] = useState<number | null>(null);
  const [intensityQuake, setIntensityQuake] = useState<Quake | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "ok" | "fail">(
    "idle",
  );

  useEffect(() => {
    persistLang(lang);
    document.title =
      lang === "en"
        ? "Quakes Global — catalog, analysis and seismic forecast"
        : "Sismos Global — catálogo, análisis y pronóstico sísmico mundial";
  }, [lang]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => setNow(Date.now()), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh]);

  const applyFromUrl = useCallback((params: URLSearchParams) => {
    const langParam = params.get("lang");
    if (langParam === "en" || langParam === "es") setLang(langParam);

    const tabParam = params.get("tab");
    if (tabParam && TAB_IDS.has(tabParam as Tab)) setTab(tabParam as Tab);

    const regionParam = params.get("region") ?? "";
    if (!regionParam || ALL_REGIONS.some((r) => r.id === regionParam)) {
      setRegionId(regionParam);
      setHistMinMag(regionParam ? MIN_MAG_ZONA : MIN_MAG_MUNDO);
    }

    const qParam = params.get("q");
    if (qParam) setSearchQuery(qParam);

    const src = params.get("source");
    if (src === "reciente" || src === "historico") setSource(src);

    const cat = params.get("catalog");
    if (cat && CATALOG_SOURCES.has(cat as CatalogSource)) {
      setCatalogSource(cat as CatalogSource);
    }

    const year = Number(params.get("from"));
    if (HIST_START_YEARS.includes(year)) setHistStartYear(year);

    const mag = Number(params.get("mag"));
    if (Number.isFinite(mag) && mag >= 2 && mag <= 7) setMinMag(mag);

    const color = params.get("color");
    if (color === "mag" || color === "depth") setColorBy(color);

    if (params.get("heat") === "1") setShowHeat(true);
    if (params.get("zones") === "1") setShowRegions(true);
    if (params.get("tsunami") === "1") setOnlyTsunami(true);
    if (params.get("felt") === "1") setOnlyFelt(true);
  }, []);

  const shareState = useMemo(
    () => ({
      lang,
      tab,
      region: regionId,
      q: searchQuery.trim(),
      source,
      catalog: catalogSource,
      from: String(histStartYear),
      mag: minMag === 2.5 ? "" : String(minMag),
      color: colorBy === "mag" ? "" : colorBy,
      heat: showHeat ? "1" : "",
      zones: showRegions ? "1" : "",
      tsunami: onlyTsunami ? "1" : "",
      felt: onlyFelt ? "1" : "",
    }),
    [
      lang,
      tab,
      regionId,
      searchQuery,
      source,
      catalogSource,
      histStartYear,
      minMag,
      colorBy,
      showHeat,
      showRegions,
      onlyTsunami,
      onlyFelt,
    ],
  );

  const { copyShareUrl } = useShareableState(shareState, applyFromUrl);

  const region = useMemo(
    () => ALL_REGIONS.find((r) => r.id === regionId) ?? null,
    [regionId],
  );

  const liveQuery: CatalogQuery = useMemo(
    () => ({
      startTime: now - 30 * DAY_MS,
      endTime: now,
      minMag: 2.5,
      bbox: WORLD_BBOX,
    }),
    [now],
  );
  // El pronóstico compara las 49 zonas entre sí y la amenaza busca fuentes
  // alrededor de una ciudad: ambos necesitan el catálogo mundial. El mapa, la
  // tabla y el análisis sí se recortan a la zona elegida, y solo entonces baja
  // el umbral de magnitud: pedir M≥4.5 del planeta entero son 230.000 eventos.
  const needsWorld =
    tab === "pronostico" || tab === "intensidad" || tab === "almacen";
  const scoped = region && !needsWorld;

  const histQuery: CatalogQuery = useMemo(
    () => ({
      startTime: Date.UTC(histStartYear, 0, 1),
      endTime: now,
      minMag: scoped ? histMinMag : Math.max(histMinMag, MIN_MAG_MUNDO),
      bbox: scoped ? region.bbox : WORLD_BBOX,
    }),
    [histStartYear, histMinMag, now, region, scoped],
  );

  const live = useCatalog(liveQuery, 10 * 60 * 1000, catalogSource);
  const hist = useCatalog(histQuery, 24 * 60 * 60 * 1000, catalogSource);

  const needsHistory = tab === "analisis" || needsWorld;
  const active = needsHistory ? hist : source === "reciente" ? live : hist;

  const filtered = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return active.quakes.filter((q) => {
      if (q.mag < minMag || q.depth > maxDepth) return false;
      if (region && !inBbox(q.lat, q.lon, region.bbox)) return false;
      if (onlyTsunami && !q.tsunami) return false;
      if (onlyFelt && q.mmi == null && q.cdi == null && (q.felt ?? 0) <= 0)
        return false;
      if (needle) {
        const hay = `${q.place} ${q.source ?? ""} ${q.id}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (clasesOcultas.includes(magClass(q.mag))) return false;
      if (decada !== null) {
        const año = new Date(q.time).getUTCFullYear();
        if (año < decada || año >= decada + 10) return false;
      }
      return true;
    });
  }, [
    active.quakes,
    minMag,
    maxDepth,
    region,
    onlyTsunami,
    onlyFelt,
    searchQuery,
    clasesOcultas,
    decada,
  ]);

  /** Décadas con eventos en el catálogo actual, de la más reciente a la más antigua. */
  const decadas = useMemo(() => {
    const cuenta = new Map<number, number>();
    for (const q of active.quakes) {
      const d = Math.floor(new Date(q.time).getUTCFullYear() / 10) * 10;
      cuenta.set(d, (cuenta.get(d) ?? 0) + 1);
    }
    return [...cuenta.entries()].sort((x, y) => y[0] - x[0]);
  }, [active.quakes]);

  const strongest = useMemo(
    () =>
      live.quakes.reduce<Quake | null>(
        (mx, q) => (!mx || q.mag > mx.mag ? q : mx),
        null,
      ),
    [live.quakes],
  );
  const latest = live.quakes[0] ?? null;

  const selectRegion = (id: string) => {
    setRegionId(id);
    setHistMinMag(id ? MIN_MAG_ZONA : MIN_MAG_MUNDO);
    if (!id) {
      setFocus({ lat: 15, lon: 0, zoom: 2 });
      return;
    }
    const r = ALL_REGIONS.find((x) => x.id === id);
    if (r) {
      const centerLat = (r.bbox.minLat + r.bbox.maxLat) / 2;
      const centerLon = (r.bbox.minLon + r.bbox.maxLon) / 2;
      const span = Math.max(
        r.bbox.maxLat - r.bbox.minLat,
        r.bbox.maxLon - r.bbox.minLon,
      );
      const zoom = span > 40 ? 4 : span > 15 ? 5 : 6;
      setFocus({ lat: centerLat, lon: centerLon, zoom });
    }
  };

  const focusOn = (q: Quake) => {
    setFocus({ lat: q.lat, lon: q.lon, zoom: 8 });
    setTab("mapa");
  };

  const onExportCsv = () => {
    downloadTextFile(
      `sismos-${source}-${filtered.length}.csv`,
      quakesToCsv(filtered),
      "text/csv;charset=utf-8",
    );
  };

  const onExportGeoJson = () => {
    downloadTextFile(
      `sismos-${source}-${filtered.length}.geojson`,
      quakesToGeoJson(filtered),
      "application/geo+json;charset=utf-8",
    );
  };

  const onShare = async () => {
    const ok = await copyShareUrl();
    setShareStatus(ok ? "ok" : "fail");
    window.setTimeout(() => setShareStatus("idle"), 2000);
  };

  const nl = (n: number) => n.toLocaleString(locale);

  return (
    <div className="mx-auto flex min-h-full max-w-[1400px] flex-col gap-4 px-4 py-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            {t.title} <span className="text-sky-400">Global</span>
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {latest && (
            <button
              type="button"
              onClick={() => focusOn(latest)}
              className="group text-left transition"
              title={latest.place}
            >
              <div className="text-[11px] uppercase tracking-wider text-slate-500 group-hover:text-sky-400">
                {t.lastEvent}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge color={magColor(latest.mag)}>
                  {latest.mag.toFixed(1)}
                </Badge>
                <span className="max-w-[220px] truncate text-slate-300 group-hover:text-white">
                  {latest.place}
                </span>
                <span className="text-slate-600">
                  {fmtAgo(latest.time, now, lang)}
                </span>
              </div>
            </button>
          )}
          {strongest && (
            <button
              type="button"
              onClick={() => focusOn(strongest)}
              className="group text-left transition"
              title={strongest.place}
            >
              <div className="text-[11px] uppercase tracking-wider text-slate-500 group-hover:text-sky-400">
                {t.strongest30d}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge color={magColor(strongest.mag)}>
                  {strongest.mag.toFixed(1)}
                </Badge>
                <span className="max-w-[200px] truncate text-slate-300 group-hover:text-white">
                  {strongest.place}
                </span>
              </div>
            </button>
          )}
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            title={t.autoRefreshHint}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              autoRefresh
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-ink-700 bg-ink-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                autoRefresh
                  ? "animate-pulse bg-emerald-400"
                  : "bg-slate-600"
              }`}
            />
            {t.autoRefresh}
          </button>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              {t.langLabel}
            </span>
            <select
              className={inputClass}
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              aria-label={t.langLabel}
            >
              <option value="es">ES</option>
              <option value="en">EN</option>
            </select>
          </label>
          <button className={buttonClass} onClick={() => void onShare()}>
            {shareStatus === "ok"
              ? t.shared
              : shareStatus === "fail"
                ? t.shareFailed
                : t.share}
          </button>
          <button
            className={buttonClass}
            onClick={() => {
              setNow(Date.now());
              active.reload(true);
            }}
          >
            {t.refresh}
          </button>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-ink-800 pb-px">
        {t.tabs.map((tabDef) => (
          <button
            key={tabDef.id}
            title={tabDef.hint}
            onClick={() => setTab(tabDef.id)}
            className={`rounded-t-lg border-b-2 px-3 py-2 text-sm transition ${
              tab === tabDef.id
                ? "border-sky-400 text-slate-100"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {tabDef.label}
          </button>
        ))}
      </nav>

      {(tab === "mapa" || tab === "eventos") && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-ink-800 bg-ink-900/50 p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              {t.catalog}
            </span>
            <select
              className={inputClass}
              value={source}
              onChange={(e) =>
                setSource(e.target.value as "reciente" | "historico")
              }
            >
              <option value="reciente">{t.recent30}</option>
              <option value="historico">{t.historicFrom(histStartYear)}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              {t.minMag}:{" "}
              <b className="font-mono text-slate-200">{minMag.toFixed(1)}</b>
            </span>
            <input
              type="range"
              min={2}
              max={7}
              step={0.1}
              value={minMag}
              onChange={(e) => setMinMag(Number(e.target.value))}
              className="w-40 accent-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              {t.maxDepth}:{" "}
              <b className="font-mono text-slate-200">{maxDepth} km</b>
            </span>
            <input
              type="range"
              min={20}
              max={800}
              step={10}
              value={maxDepth}
              onChange={(e) => setMaxDepth(Number(e.target.value))}
              className="w-40 accent-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              {t.zone}
            </span>
            <select
              className={inputClass}
              value={regionId}
              onChange={(e) => selectRegion(e.target.value)}
            >
              <option value="">{t.wholePlanet}</option>
              <optgroup label={t.latinAmerica}>
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.country}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t.restOfWorld}>
                {WORLD_REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.country}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              {lang === "en" ? "Search" : "Buscar"}
            </span>
            <div className="relative flex items-center">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className={`${inputClass} w-full pr-7`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  title={t.clearSearch}
                  aria-label={t.clearSearch}
                  className="absolute right-2 text-xs text-slate-500 hover:text-slate-200"
                >
                  ✕
                </button>
              )}
            </div>
          </label>
          <label className="flex items-center gap-2 pb-1.5 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={onlyTsunami}
              onChange={(e) => setOnlyTsunami(e.target.checked)}
              className="accent-sky-500"
            />
            {t.tsunamiOnly}
          </label>
          <label className="flex items-center gap-2 pb-1.5 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={onlyFelt}
              onChange={(e) => setOnlyFelt(e.target.checked)}
              className="accent-sky-500"
            />
            {t.feltOnly}
          </label>
          {tab === "mapa" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">
                  {t.color}
                </span>
                <select
                  className={inputClass}
                  value={colorBy}
                  onChange={(e) =>
                    setColorBy(e.target.value as "mag" | "depth")
                  }
                >
                  <option value="mag">{t.byMag}</option>
                  <option value="depth">{t.byDepth}</option>
                </select>
              </label>
              <label className="flex items-center gap-2 pb-1.5 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={showHeat}
                  onChange={(e) => setShowHeat(e.target.checked)}
                  className="accent-sky-500"
                />
                {t.heatMap}
              </label>
              <label className="flex items-center gap-2 pb-1.5 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={showRegions}
                  onChange={(e) => setShowRegions(e.target.checked)}
                  className="accent-sky-500"
                />
                {t.zones}
              </label>
            </>
          )}
          <div className="ml-auto flex items-center gap-1.5 pb-0.5">
            <button
              type="button"
              className={buttonClass}
              disabled={filtered.length === 0}
              onClick={onExportCsv}
              title="Descargar eventos filtrados en CSV"
            >
              ↓ {t.exportCsv}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={filtered.length === 0}
              onClick={onExportGeoJson}
              title="Descargar eventos filtrados en GeoJSON"
            >
              ↓ {t.exportGeoJson}
            </button>
          </div>
        </div>
      )}

      {needsHistory && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-ink-800 bg-ink-900/50 p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              {t.catalogFrom}
            </span>
            <select
              className={inputClass}
              value={histStartYear}
              onChange={(e) => setHistStartYear(Number(e.target.value))}
            >
              {HIST_START_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              {t.minMag}:{" "}
              <b className="font-mono text-slate-200">
                {histMinMag.toFixed(1)}
              </b>
            </span>
            <input
              type="range"
              min={3.5}
              max={6}
              step={0.5}
              value={histMinMag}
              onChange={(e) => setHistMinMag(Number(e.target.value))}
              className="w-48 accent-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              {t.network}
            </span>
            <select
              className={inputClass}
              value={catalogSource}
              onChange={(e) =>
                setCatalogSource(e.target.value as CatalogSource)
              }
            >
              <optgroup label={t.networkGroups.global}>
                <option value="USGS">{t.networkLabels.USGS}</option>
              </optgroup>
              <optgroup label={t.networkGroups.europe}>
                <option value="EMSC">{t.networkLabels.EMSC}</option>
                <option value="USGS+EMSC">{t.networkLabels["USGS+EMSC"]}</option>
                <option value="INGV">{t.networkLabels.INGV}</option>
                <option value="USGS+INGV">{t.networkLabels["USGS+INGV"]}</option>
                <option value="GFZ">{t.networkLabels.GFZ}</option>
                <option value="USGS+GFZ">{t.networkLabels["USGS+GFZ"]}</option>
                <option value="IPGP">{t.networkLabels.IPGP}</option>
                <option value="USGS+IPGP">{t.networkLabels["USGS+IPGP"]}</option>
              </optgroup>
              <optgroup label={t.networkGroups.oceania}>
                <option value="GEONET">{t.networkLabels.GEONET}</option>
                <option value="USGS+GEONET">
                  {t.networkLabels["USGS+GEONET"]}
                </option>
                <option value="GA">{t.networkLabels.GA}</option>
                <option value="USGS+GA">{t.networkLabels["USGS+GA"]}</option>
              </optgroup>
              <optgroup label={t.networkGroups.americas}>
                <option value="SSN">{t.networkLabels.SSN}</option>
                <option value="USGS+SSN">{t.networkLabels["USGS+SSN"]}</option>
                <option value="ambos">{t.networkLabels.ambos}</option>
                <option value="SGC">{t.networkLabels.SGC}</option>
              </optgroup>
            </select>
          </label>
          <p className="pb-1.5 text-xs text-slate-500">
            {scoped ? region.name : t.wholePlanet} · {nl(hist.quakes.length)}{" "}
            {t.events} ·{" "}
            {fmtNum((now - histQuery.startTime) / DAY_MS / 365.25, 0, locale)}{" "}
            {t.years}
            {Object.keys(hist.counts).length > 0 &&
              " · " +
                Object.entries(hist.counts)
                  .map(([net, n]) => `${nl(n)} ${net}`)
                  .join(" + ")}
            {hist.fromCache && ` · ${t.fromCache}`}
          </p>
        </div>
      )}

      {active.loading && (
        <div className="rounded-2xl border border-ink-800 bg-ink-900/50 p-4">
          <Spinner
            label={
              active.progress
                ? t.downloading(
                    nl(active.progress.loaded),
                    nl(active.progress.total),
                  )
                : t.querying
            }
          />
        </div>
      )}
      {active.error && <Note tone="warn">{t.loadError(active.error)}</Note>}
      {active.degraded.length > 0 && (
        <Note tone="warn">{t.degraded(active.degraded.join(" / "))}</Note>
      )}
      {active.warnings.map((w) => (
        <Note key={w} tone="warn">
          {w}
        </Note>
      ))}

      <main className="pb-8">
        {tab === "mapa" && (
          <div className="space-y-3">
            <MapView
              quakes={filtered}
              colorBy={colorBy}
              showHeat={showHeat}
              showRegions={showRegions}
              selectedRegionId={regionId || null}
              onSelectRegion={(id) => selectRegion(id ?? "")}
              onIntensity={setIntensityQuake}
              focus={focus}
              now={now}
              className="h-[calc(100vh-320px)] min-h-[420px]"
            />
            {decadas.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="mr-1 text-[11px] uppercase tracking-wider text-slate-500">
                  {t.decade}
                </span>
                <button
                  onClick={() => setDecada(null)}
                  className={`rounded-md border px-2 py-1 font-mono text-[11px] transition ${
                    decada === null
                      ? "border-sky-500/60 bg-sky-500/10 text-sky-300"
                      : "border-ink-700 text-slate-400 hover:border-ink-600 hover:text-slate-200"
                  }`}
                >
                  {t.all}
                </button>
                {decadas.map(([d, n]) => (
                  <button
                    key={d}
                    onClick={() => setDecada(decada === d ? null : d)}
                    title={`${nl(n)} ${t.events}`}
                    className={`rounded-md border px-2 py-1 font-mono text-[11px] transition ${
                      decada === d
                        ? "border-sky-500/60 bg-sky-500/10 text-sky-300"
                        : "border-ink-700 text-slate-400 hover:border-ink-600 hover:text-slate-200"
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span>{t.onScreen(nl(filtered.length))}</span>
              <span className="flex flex-wrap items-center gap-2">
                {colorBy === "mag"
                  ? MAG_CLASSES.map((m) => {
                      const oculta = clasesOcultas.includes(m);
                      return (
                        <button
                          key={m}
                          onClick={() =>
                            setClasesOcultas((prev) =>
                              prev.includes(m)
                                ? prev.filter((x) => x !== m)
                                : [...prev, m],
                            )
                          }
                          title={oculta ? t.showClass : t.hideClass}
                          className={`flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-ink-800 ${
                            oculta ? "opacity-35" : ""
                          }`}
                        >
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: magColor(m) }}
                          />
                          {magClassLabel(m)}
                        </button>
                      );
                    })
                  : (
                      [
                        ["#f87171", "0–30 km"],
                        ["#fb923c", "30–70"],
                        ["#facc15", "70–150"],
                        ["#4ade80", "150–300"],
                        ["#60a5fa", ">300"],
                      ] as const
                    ).map(([c, l]) => (
                      <span key={l} className="flex items-center gap-1">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: c }}
                        />
                        {l}
                      </span>
                    ))}
              </span>
              {(clasesOcultas.length > 0 ||
                decada !== null ||
                searchQuery.trim() !== "" ||
                onlyTsunami ||
                onlyFelt) && (
                <button
                  onClick={() => {
                    setClasesOcultas([]);
                    setDecada(null);
                    setSearchQuery("");
                    setOnlyTsunami(false);
                    setOnlyFelt(false);
                  }}
                  className="text-slate-400 underline underline-offset-2 hover:text-slate-200"
                >
                  {t.clearFilters}
                </button>
              )}
              {colorBy === "mag" && clasesOcultas.length === 0 && (
                <span className="text-slate-600">{t.clickToHide}</span>
              )}
            </div>
          </div>
        )}

        {tab === "eventos" && (
          <EventsTable
            quakes={filtered}
            onFocus={focusOn}
            onIntensity={setIntensityQuake}
            now={now}
          />
        )}

        <Suspense fallback={<Spinner label={t.loadingModule} />}>
          {tab === "analisis" && (
            <Analytics
              quakes={filtered}
              onFocus={focusOn}
              onIntensity={setIntensityQuake}
            />
          )}
          {tab === "pronostico" && <Forecast quakes={hist.quakes} now={now} />}
          {tab === "intensidad" && <Hazard quakes={hist.quakes} />}
          {tab === "almacen" && <Warehouse quakes={hist.quakes} />}
          {tab === "aprender" && <Learn />}
        </Suspense>
      </main>

      <footer className="border-t border-ink-800 pt-3 text-[11px] leading-relaxed text-slate-600">
        {t.footer}
      </footer>
      {intensityQuake && (
        <QuakeIntensityPanel
          quake={intensityQuake}
          onClose={() => setIntensityQuake(null)}
          onFocus={focusOn}
        />
      )}
    </div>
  );
}

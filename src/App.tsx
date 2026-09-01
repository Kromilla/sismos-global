import { Suspense, lazy, useMemo, useState } from "react";
import type { CatalogQuery, CatalogSource, Quake } from "./types";
import {
  ALL_REGIONS,
  REGIONS,
  WORLD_BBOX,
  WORLD_REGIONS,
  inBbox,
} from "./data/regions";
import { useCatalog } from "./hooks/useCatalog";
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

const TABS: { id: Tab; label: string; hint: string }[] = [
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
];

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

export default function App() {
  // Instante fijo del arranque: evita rehacer la consulta en cada render.
  const [now] = useState(() => Date.now());

  const [tab, setTab] = useState<Tab>("mapa");
  const [source, setSource] = useState<"reciente" | "historico">("reciente");
  const [minMag, setMinMag] = useState(2.5);
  const [maxDepth, setMaxDepth] = useState(800);
  const [regionId, setRegionId] = useState<string>("");
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

  const live = useCatalog(liveQuery, 10 * 60 * 1000);
  const hist = useCatalog(histQuery, 24 * 60 * 60 * 1000, catalogSource);

  const needsHistory = tab === "analisis" || needsWorld;
  const active = needsHistory ? hist : source === "reciente" ? live : hist;

  const filtered = useMemo(
    () =>
      active.quakes.filter((q) => {
        if (q.mag < minMag || q.depth > maxDepth) return false;
        if (region && !inBbox(q.lat, q.lon, region.bbox)) return false;
        if (clasesOcultas.includes(magClass(q.mag))) return false;
        if (decada !== null) {
          const año = new Date(q.time).getUTCFullYear();
          if (año < decada || año >= decada + 10) return false;
        }
        return true;
      }),
    [active.quakes, minMag, maxDepth, region, clasesOcultas, decada],
  );

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
  };

  const focusOn = (q: Quake) => {
    setFocus({ lat: q.lat, lon: q.lon, zoom: 8 });
    setTab("mapa");
  };

  return (
    <div className="mx-auto flex min-h-full max-w-[1400px] flex-col gap-4 px-4 py-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            Sismos <span className="text-sky-400">Global</span>
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Catálogo mundial · USGS, EMSC, GeoNet, Geoscience Australia, INGV y
            SGC
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {latest && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                Último evento
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge color={magColor(latest.mag)}>
                  {latest.mag.toFixed(1)}
                </Badge>
                <span className="max-w-[220px] truncate text-slate-300">
                  {latest.place}
                </span>
                <span className="text-slate-600">{fmtAgo(latest.time)}</span>
              </div>
            </div>
          )}
          {strongest && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                Mayor en 30 días
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge color={magColor(strongest.mag)}>
                  {strongest.mag.toFixed(1)}
                </Badge>
                <span className="max-w-[200px] truncate text-slate-300">
                  {strongest.place}
                </span>
              </div>
            </div>
          )}
          <button className={buttonClass} onClick={() => active.reload(true)}>
            Actualizar
          </button>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-ink-800 pb-px">
        {TABS.map((t) => (
          <button
            key={t.id}
            title={t.hint}
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg border-b-2 px-3 py-2 text-sm transition ${
              tab === t.id
                ? "border-sky-400 text-slate-100"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {(tab === "mapa" || tab === "eventos") && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-ink-800 bg-ink-900/50 p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              Catálogo
            </span>
            <select
              className={inputClass}
              value={source}
              onChange={(e) =>
                setSource(e.target.value as "reciente" | "historico")
              }
            >
              <option value="reciente">Últimos 30 días (M≥2.5)</option>
              <option value="historico">Histórico desde {histStartYear}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              Magnitud mínima:{" "}
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
              Profundidad máx:{" "}
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
              Zona
            </span>
            <select
              className={inputClass}
              value={regionId}
              onChange={(e) => selectRegion(e.target.value)}
            >
              <option value="">Todo el planeta</option>
              <optgroup label="América Latina">
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.country}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Resto del mundo">
                {WORLD_REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.country}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {tab === "mapa" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">
                  Color
                </span>
                <select
                  className={inputClass}
                  value={colorBy}
                  onChange={(e) =>
                    setColorBy(e.target.value as "mag" | "depth")
                  }
                >
                  <option value="mag">Por magnitud</option>
                  <option value="depth">Por profundidad</option>
                </select>
              </label>
              <label className="flex items-center gap-2 pb-1.5 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={showHeat}
                  onChange={(e) => setShowHeat(e.target.checked)}
                  className="accent-sky-500"
                />
                Mapa de calor
              </label>
              <label className="flex items-center gap-2 pb-1.5 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={showRegions}
                  onChange={(e) => setShowRegions(e.target.checked)}
                  className="accent-sky-500"
                />
                Zonas
              </label>
            </>
          )}
        </div>
      )}

      {needsHistory && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-ink-800 bg-ink-900/50 p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              Catálogo desde
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
              Magnitud mínima:{" "}
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
              Red
            </span>
            <select
              className={inputClass}
              value={catalogSource}
              onChange={(e) =>
                setCatalogSource(e.target.value as CatalogSource)
              }
            >
              <optgroup label="— Global —">
                <option value="USGS">USGS — global (recomendado)</option>
              </optgroup>
              <optgroup label="— Europa y Mediterráneo —">
                <option value="EMSC">EMSC — SeismicPortal</option>
                <option value="USGS+EMSC">USGS + EMSC</option>
                <option value="INGV">INGV — Italia</option>
                <option value="USGS+INGV">USGS + INGV</option>
              </optgroup>
              <optgroup label="— Oceanía y Pacífico —">
                <option value="GEONET">GeoNet — Nueva Zelanda</option>
                <option value="USGS+GEONET">USGS + GeoNet</option>
                <option value="GA">Geoscience Australia</option>
                <option value="USGS+GA">USGS + GA</option>
              </optgroup>
              <optgroup label="— Colombia (SGC) —">
                <option value="ambos">USGS + SGC — Colombia desde 1610</option>
                <option value="SGC">Solo SGC — Colombia, 1610–hoy</option>
              </optgroup>
            </select>
          </label>
          <p className="pb-1.5 text-xs text-slate-500">
            {scoped ? region.name : "Todo el planeta"} ·{" "}
            {hist.quakes.length.toLocaleString("es-CO")} eventos ·{" "}
            {fmtNum((now - histQuery.startTime) / DAY_MS / 365.25, 0)} años
            {Object.keys(hist.counts).length > 0 &&
              " · " +
                Object.entries(hist.counts)
                  .map(([net, n]) => `${n.toLocaleString("es-CO")} ${net}`)
                  .join(" + ")}
            {hist.fromCache && " · desde caché local"}
          </p>
        </div>
      )}

      {active.loading && (
        <div className="rounded-2xl border border-ink-800 bg-ink-900/50 p-4">
          <Spinner
            label={
              active.progress
                ? `Descargando catálogo… ${active.progress.loaded.toLocaleString("es-CO")} de ~${active.progress.total.toLocaleString("es-CO")} eventos`
                : "Consultando el USGS…"
            }
          />
        </div>
      )}
      {active.error && (
        <Note tone="warn">
          No se pudo cargar el catálogo: {active.error}. Revisa la conexión y
          pulsa Actualizar.
        </Note>
      )}
      {active.degraded.length > 0 && (
        <Note tone="warn">
          {active.degraded.join(" y ")} no respondió; se sigue con el resto de
          fuentes.
        </Note>
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
              focus={focus}
              className="h-[calc(100vh-320px)] min-h-[420px]"
            />
            {decadas.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="mr-1 text-[11px] uppercase tracking-wider text-slate-500">
                  Década
                </span>
                <button
                  onClick={() => setDecada(null)}
                  className={`rounded-md border px-2 py-1 font-mono text-[11px] transition ${
                    decada === null
                      ? "border-sky-500/60 bg-sky-500/10 text-sky-300"
                      : "border-ink-700 text-slate-400 hover:border-ink-600 hover:text-slate-200"
                  }`}
                >
                  Todas
                </button>
                {decadas.map(([d, n]) => (
                  <button
                    key={d}
                    onClick={() => setDecada(decada === d ? null : d)}
                    title={`${n.toLocaleString("es-CO")} eventos`}
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
              <span>
                {filtered.length.toLocaleString("es-CO")} eventos en pantalla
              </span>
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
                          title={
                            oculta ? "Mostrar esta clase" : "Ocultar esta clase"
                          }
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
              {(clasesOcultas.length > 0 || decada !== null) && (
                <button
                  onClick={() => {
                    setClasesOcultas([]);
                    setDecada(null);
                  }}
                  className="text-slate-400 underline underline-offset-2 hover:text-slate-200"
                >
                  Quitar filtros
                </button>
              )}
              {colorBy === "mag" && clasesOcultas.length === 0 && (
                <span className="text-slate-600">
                  Pulsa una clase para ocultarla
                </span>
              )}
            </div>
          </div>
        )}

        {tab === "eventos" && (
          <EventsTable
            quakes={filtered}
            onFocus={focusOn}
            onIntensity={setIntensityQuake}
          />
        )}

        <Suspense fallback={<Spinner label="Cargando módulo…" />}>
          {tab === "analisis" && <Analytics quakes={filtered} />}
          {tab === "pronostico" && <Forecast quakes={hist.quakes} />}
          {tab === "intensidad" && <Hazard quakes={hist.quakes} />}
          {tab === "almacen" && <Warehouse quakes={hist.quakes} />}
          {tab === "aprender" && <Learn />}
        </Suspense>
      </main>

      <footer className="border-t border-ink-800 pt-3 text-[11px] leading-relaxed text-slate-600">
        Datos: USGS Earthquake Hazards Program y Servicio Geológico Colombiano
        (dominio público). Los pronósticos son estimaciones estadísticas
        propias, no productos oficiales del USGS ni del SGC, y no predicen
        sismos individuales. Para decisiones de construcción o emergencia mandan
        las autoridades nacionales y la norma sismorresistente vigente.
      </footer>
      {intensityQuake && (
        <QuakeIntensityPanel
          quake={intensityQuake}
          onClose={() => setIntensityQuake(null)}
        />
      )}
    </div>
  );
}

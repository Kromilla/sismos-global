import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Quake } from "../types";
import {
  SAMPLE_QUERIES,
  buildWarehouse,
  exportCsv,
  exportParquet,
  runQuery,
  type QueryResult,
  type WarehouseStats,
} from "../warehouse/duckdb";
import { decluster } from "../science/declustering";
import { Card, Note, Spinner, Stat, buttonClass, inputClass } from "./ui";
import { fmtNum } from "../ui/format";
import { localeFor, type Lang } from "../i18n/shell";

const SCHEMA = [
  {
    table: "fact_sismo",
    kind: "hecho",
    cols: [
      "evento_id",
      "ocurrido_en",
      "magnitud",
      "profundidad_km",
      "lat / lon",
      "energia_j",
      "rol",
      "zona_id",
    ],
  },
  {
    table: "dim_zona",
    kind: "dimensión",
    cols: ["zona_id", "nombre", "pais", "bbox", "contexto"],
  },
  {
    table: "dim_tiempo",
    kind: "dimensión",
    cols: ["tiempo_id", "fecha", "anio", "mes", "trimestre", "anio_mes"],
  },
  {
    table: "dim_magnitud",
    kind: "dimensión",
    cols: ["magnitud_id", "etiqueta", "desde", "hasta"],
  },
  {
    table: "dim_profundidad",
    kind: "dimensión",
    cols: ["profundidad_id", "etiqueta", "desde_km", "hasta_km"],
  },
  {
    table: "vw_sismos",
    kind: "vista",
    cols: ["join completo de hecho + dimensiones"],
  },
  {
    table: "vw_resumen_zona",
    kind: "vista",
    cols: ["eventos, mag_media, mag_max, eventos_m6 por zona"],
  },
  {
    table: "vw_tasa_anual",
    kind: "vista",
    cols: ["eventos y energía por zona y año"],
  },
];

const SQL_HISTORY_KEY = "sismos-global-sql-history";

function loadSqlHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(SQL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string").slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

export default function Warehouse({
  quakes,
  lang = "es",
}: {
  quakes: Quake[];
  lang?: Lang;
}) {
  const en = lang === "en";
  const locale = localeFor(lang);
  // Guardamos contra qué catálogo se construyó: si cambia, el almacén queda obsoleto.
  const [built, setBuilt] = useState<{
    stats: WarehouseStats;
    source: Quake[];
  } | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [sql, setSql] = useState(SAMPLE_QUERIES[0].sql);
  const [history, setHistory] = useState<string[]>(() => loadSqlHistory());
  const [result, setResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [viewMode, setViewMode] = useState<"both" | "table" | "chart">("both");
  const [chartYCol, setChartYCol] = useState<string>("");

  const chartSpec = useMemo(() => {
    if (!result || result.rows.length < 2 || result.columns.length < 2) {
      return null;
    }
    const sample = result.rows[0];
    const numericCols = result.columns.filter(
      (c) => typeof sample[c] === "number",
    );
    if (numericCols.length === 0) return null;
    const nonNumCols = result.columns.filter(
      (c) => typeof sample[c] !== "number",
    );
    const xCol = nonNumCols[0] ?? result.columns[0];
    const yCandidates = numericCols.filter((c) => c !== xCol);
    const yCol =
      yCandidates.find((c) => c === chartYCol) ??
      yCandidates[0] ??
      numericCols[0];
    const data = result.rows.slice(0, 25).map((r) => ({
      x: String(r[xCol] ?? "—").slice(0, 24),
      y: Number(r[yCol] ?? 0),
    }));
    return { xCol, yCol, numericCols: yCandidates.length ? yCandidates : numericCols, data };
  }, [result, chartYCol]);

  const build = useCallback(async () => {
    if (!quakes.length) return;
    setBuilding(true);
    setBuildError(null);
    try {
      const roles = decluster(quakes).roles;
      const s = await buildWarehouse(quakes, roles);
      setBuilt({ stats: s, source: quakes });
    } catch (e) {
      setBuildError(
        e instanceof Error ? e.message : "Fallo al construir el almacén",
      );
    } finally {
      setBuilding(false);
    }
  }, [quakes]);

  const run = useCallback(async () => {
    setRunning(true);
    setQueryError(null);
    try {
      const res = await runQuery(sql);
      setResult(res);
      const trimmed = sql.trim();
      if (trimmed) {
        setHistory((prev) => {
          const next = [trimmed, ...prev.filter((q) => q !== trimmed)].slice(
            0,
            6,
          );
          try {
            window.localStorage.setItem(SQL_HISTORY_KEY, JSON.stringify(next));
          } catch {
            // Ignorar fallos de almacenamiento
          }
          return next;
        });
      }
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : "Error en la consulta");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [sql]);

  const stats = built && built.source === quakes ? built.stats : null;

  const download = useCallback(async () => {
    const csv = await exportCsv(sql);
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "consulta-sismos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [sql]);

  const downloadParquet = useCallback(async () => {
    const bytes = await exportParquet(sql);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const url = URL.createObjectURL(
      new Blob([copy], { type: "application/octet-stream" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "consulta-sismos.parquet";
    a.click();
    URL.revokeObjectURL(url);
  }, [sql]);

  return (
    <div className="space-y-4">
      <Note>
        DuckDB corre <strong>dentro del navegador</strong> (WebAssembly): el
        catálogo se carga en un esquema estrella y se consulta con SQL analítico
        real, sin servidor ni base de datos remota. Al recargar la página hay
        que reconstruirlo.
      </Note>

      <Card
        title="Almacén de datos"
        subtitle="Carga el catálogo en tablas de hecho y dimensiones"
        right={
          <button
            className={buttonClass}
            onClick={build}
            disabled={building || !quakes.length}
          >
            {stats ? "Reconstruir" : "Construir almacén"}
          </button>
        }
      >
        {building && <Spinner label="Ingestando catálogo en DuckDB…" />}
        {buildError && <p className="text-xs text-rose-400">{buildError}</p>}
        {stats && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={en ? "Rows in fact_sismo" : "Filas en fact_sismo"}
              value={stats.facts.toLocaleString(locale)}
              accent="#38bdf8"
            />
            <Stat
              label={en ? "Zones with data" : "Zonas con datos"}
              value={stats.zones}
            />
            <Stat
              label={en ? "Coverage" : "Cobertura"}
              value={`${stats.fromYear}–${stats.toYear}`}
            />
            <Stat
              label={en ? "Ingested volume" : "Volumen ingerido"}
              value={`${fmtNum(stats.sizeMb, 1, locale)} MB`}
            />
          </div>
        )}
        {!stats && !building && (
          <p className="text-xs text-slate-500">
            {quakes.length.toLocaleString(locale)}{" "}
            {en ? "events ready to ingest." : "eventos listos para ingerir."}
          </p>
        )}
      </Card>

      <Card
        title="Esquema estrella"
        subtitle="Un hecho, cuatro dimensiones, tres vistas"
      >
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          {SCHEMA.map((t) => (
            <div
              key={t.table}
              className={`rounded-xl border p-3 ${
                t.kind === "hecho"
                  ? "border-sky-500/40 bg-sky-500/5"
                  : t.kind === "vista"
                    ? "border-ink-800 bg-ink-950/40"
                    : "border-ink-700 bg-ink-900/60"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <code className="font-mono text-xs text-slate-200">
                  {t.table}
                </code>
                <span className="text-[10px] uppercase tracking-wider text-slate-600">
                  {t.kind}
                </span>
              </div>
              <ul className="mt-2 space-y-0.5">
                {t.cols.map((c) => (
                  <li
                    key={c}
                    className="truncate font-mono text-[11px] text-slate-500"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title={en ? "SQL Console" : "Consola SQL"}
        subtitle={
          en
            ? "Full DuckDB: aggregations, window functions, CTEs, date functions"
            : "DuckDB completo: agregaciones, ventanas, CTEs, funciones de fecha"
        }
        right={
          <div className="flex gap-2">
            <button
              className={buttonClass}
              onClick={run}
              disabled={running || !stats}
            >
              {running
                ? en
                  ? "Running…"
                  : "Ejecutando…"
                : en
                  ? "Run"
                  : "Ejecutar"}
            </button>
            <button
              className={buttonClass}
              onClick={download}
              disabled={!result}
            >
              CSV
            </button>
            <button
              className={buttonClass}
              onClick={downloadParquet}
              disabled={!result}
              title={
                en
                  ? "Export query result as Apache Parquet"
                  : "Exportar resultado en formato columnar Apache Parquet"
              }
            >
              Parquet
            </button>
          </div>
        }
      >
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SAMPLE_QUERIES.map((q) => (
            <button
              key={q.title}
              className="rounded-md border border-ink-700 px-2 py-1 text-[11px] text-slate-400 transition hover:border-sky-500/50 hover:text-slate-200"
              onClick={() => setSql(q.sql)}
            >
              {q.title}
            </button>
          ))}
        </div>
        {history.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-600">
              {en ? "Recent:" : "Recientes:"}
            </span>
            {history.map((h, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSql(h)}
                title={h}
                className="max-w-[200px] truncate rounded border border-ink-800 bg-ink-950/60 px-2 py-0.5 font-mono text-[10px] text-slate-500 hover:border-ink-700 hover:text-slate-300"
              >
                {h.replace(/\s+/g, " ")}
              </button>
            ))}
          </div>
        )}
        <textarea
          className={`${inputClass} h-32 w-full resize-y font-mono text-xs leading-relaxed`}
          value={sql}
          spellCheck={false}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void run();
          }}
        />
        <p className="mt-1 text-[11px] text-slate-600">
          Ctrl + Enter para ejecutar.
        </p>

        {queryError && (
          <pre className="mt-3 overflow-x-auto rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-300">
            {queryError}
          </pre>
        )}

        {result && stats && (
          <div className="mt-3 space-y-3">
            {chartSpec && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1 rounded-lg border border-ink-800 bg-ink-950/80 p-0.5 text-[11px]">
                  {(
                    [
                      ["both", en ? "Table + Chart" : "Tabla + Gráfico"],
                      ["table", en ? "Table only" : "Solo tabla"],
                      ["chart", en ? "Chart only" : "Solo gráfico"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setViewMode(id)}
                      className={`rounded-md px-2.5 py-1 font-medium transition ${
                        viewMode === id
                          ? "bg-sky-500/20 text-sky-300"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {viewMode !== "table" && chartSpec.numericCols.length > 1 && (
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span>{en ? "Metric (Y):" : "Métrica (Y):"}</span>
                    <select
                      value={chartSpec.yCol}
                      onChange={(e) => setChartYCol(e.target.value)}
                      className="rounded-lg border border-ink-700 bg-ink-900 px-2 py-1 font-mono text-xs text-slate-200"
                    >
                      {chartSpec.numericCols.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            {chartSpec && viewMode !== "table" && (
              <div className="rounded-xl border border-ink-800 bg-ink-950/50 p-3">
                <p className="mb-2 font-mono text-[11px] text-slate-400">
                  📊 {chartSpec.yCol} {en ? "by" : "por"} {chartSpec.xCol} (top{" "}
                  {chartSpec.data.length})
                </p>
                <div className="h-56">
                  <ResponsiveContainer>
                    <BarChart
                      data={chartSpec.data}
                      margin={{ top: 6, right: 12, bottom: 8, left: 0 }}
                    >
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="x"
                        stroke="#475569"
                        fontSize={10}
                        interval="preserveStartEnd"
                      />
                      <YAxis stroke="#475569" fontSize={10} />
                      <RTooltip
                        contentStyle={{
                          background: "#101a2c",
                          border: "1px solid #1f3050",
                          borderRadius: 10,
                          fontSize: 12,
                          color: "#e2e8f0",
                        }}
                        formatter={(v: unknown) => [
                          fmtNum(Number(v), 2, locale),
                          chartSpec.yCol,
                        ]}
                      />
                      <Bar dataKey="y" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {viewMode !== "chart" && (
              <div className="max-h-[420px] overflow-auto rounded-xl border border-ink-800">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 bg-ink-900">
                    <tr>
                      {result.columns.map((c) => (
                        <th
                          key={c}
                          className="whitespace-nowrap px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr
                        key={i}
                        className="border-t border-ink-800/70 hover:bg-ink-900/60"
                      >
                        {result.columns.map((c) => (
                          <td
                            key={c}
                            className="whitespace-nowrap px-3 py-1.5 font-mono text-slate-300"
                          >
                            {formatCell(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              {result.rows.length} filas en {result.ms.toFixed(0)} ms
              {result.truncated && " · resultado recortado a 500 filas"}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number")
    return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4)));
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace("T", " ");
  if (typeof v === "boolean") return v ? "sí" : "no";
  return String(v);
}

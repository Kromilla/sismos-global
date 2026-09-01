import { useCallback, useState } from "react";
import type { Quake } from "../types";
import {
  SAMPLE_QUERIES,
  buildWarehouse,
  exportCsv,
  runQuery,
  type QueryResult,
  type WarehouseStats,
} from "../warehouse/duckdb";
import { decluster } from "../science/declustering";
import { Card, Note, Spinner, Stat, buttonClass, inputClass } from "./ui";
import { fmtNum } from "../ui/format";

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

export default function Warehouse({ quakes }: { quakes: Quake[] }) {
  // Guardamos contra qué catálogo se construyó: si cambia, el almacén queda obsoleto.
  const [built, setBuilt] = useState<{
    stats: WarehouseStats;
    source: Quake[];
  } | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [sql, setSql] = useState(SAMPLE_QUERIES[0].sql);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

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
      setResult(await runQuery(sql));
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
              label="Filas en fact_sismo"
              value={stats.facts.toLocaleString("es-CO")}
              accent="#38bdf8"
            />
            <Stat label="Zonas con datos" value={stats.zones} />
            <Stat
              label="Cobertura"
              value={`${stats.fromYear}–${stats.toYear}`}
            />
            <Stat
              label="Volumen ingerido"
              value={`${fmtNum(stats.sizeMb, 1)} MB`}
            />
          </div>
        )}
        {!stats && !building && (
          <p className="text-xs text-slate-500">
            {quakes.length.toLocaleString("es-CO")} eventos listos para ingerir.
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
        title="Consola SQL"
        subtitle="DuckDB completo: agregaciones, ventanas, CTEs, funciones de fecha"
        right={
          <div className="flex gap-2">
            <button
              className={buttonClass}
              onClick={run}
              disabled={running || !stats}
            >
              {running ? "Ejecutando…" : "Ejecutar"}
            </button>
            <button
              className={buttonClass}
              onClick={download}
              disabled={!result}
            >
              CSV
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
          <div className="mt-3 space-y-2">
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

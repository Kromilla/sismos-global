/**
 * HeroStats — Panel de estadísticas globales en tiempo real para el header.
 *
 * Muestra de un vistazo:
 *  - Último evento (magnitud, lugar, hace cuánto)
 *  - Mayor evento de los últimos 7 días
 *  - Total de eventos en 24h y su delta vs la semana previa
 *  - Alertas de tsunami activas
 *
 * Diseño: todas las tarjetas tienen la misma altura y ancho mínimo para ser
 * visualmente uniformes, independientemente de su contenido.
 */

import type { Quake } from "../types";
import { fmtAgo, magColor } from "../ui/format";
import { Badge } from "./ui";

interface HeroStatsProps {
  liveQuakes: Quake[];
  now: number;
  onFocus?: (q: Quake) => void;
}

const DAY_MS = 86_400_000;

/** Tarjeta base uniforme — misma altura, bordes y padding para todas */
function StatCard({
  label,
  children,
  onClick,
  id,
  highlight,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  id?: string;
  highlight?: "amber";
}) {
  const base =
    "flex min-w-[160px] flex-1 flex-col gap-1 rounded-xl px-3 py-2.5 text-left";

  const colors =
    highlight === "amber"
      ? "border border-amber-500/30 bg-amber-500/5"
      : "border border-slate-800 bg-slate-900/50";

  const hover = onClick
    ? "cursor-pointer transition hover:border-slate-700 hover:bg-slate-800/60 group"
    : "";

  if (onClick) {
    return (
      <button id={id} onClick={onClick} className={`${base} ${colors} ${hover}`}>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {children}
      </button>
    );
  }

  return (
    <div id={id} className={`${base} ${colors}`}>
      <span
        className={`text-[10px] uppercase tracking-wider ${
          highlight === "amber" ? "text-amber-500/70" : "text-slate-500"
        }`}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

export default function HeroStats({ liveQuakes, now, onFocus }: HeroStatsProps) {
  if (liveQuakes.length === 0) return null;

  const latest = liveQuakes[0];
  const strongest = liveQuakes.reduce<Quake | null>(
    (mx, q) => (!mx || q.mag > mx.mag ? q : mx),
    null,
  );

  const last24h = liveQuakes.filter((q) => q.time > now - DAY_MS);
  const prev24h = liveQuakes.filter(
    (q) => q.time > now - 2 * DAY_MS && q.time <= now - DAY_MS,
  );
  const delta =
    prev24h.length > 0
      ? ((last24h.length - prev24h.length) / prev24h.length) * 100
      : null;

  const tsunamis = last24h.filter((q) => q.tsunami);

  return (
    <div className="flex flex-nowrap items-stretch gap-2">
      {/* Último evento */}
      {latest && (
        <StatCard
          id="hero-latest"
          label="Último evento"
          onClick={() => onFocus?.(latest)}
        >
          <div className="flex items-center gap-2">
            <Badge color={magColor(latest.mag)}>{latest.mag.toFixed(1)}</Badge>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-200 group-hover:text-white">
              {latest.place}
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            {fmtAgo(latest.time)} · {latest.depth.toFixed(0)} km
          </span>
        </StatCard>
      )}

      {/* Mayor en 7 días */}
      {strongest && strongest.id !== latest?.id && (
        <StatCard
          id="hero-strongest"
          label="Mayor · 7 días"
          onClick={() => onFocus?.(strongest)}
        >
          <div className="flex items-center gap-2">
            <Badge color={magColor(strongest.mag)}>
              {strongest.mag.toFixed(1)}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-200 group-hover:text-white">
              {strongest.place}
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            {fmtAgo(strongest.time)}
          </span>
        </StatCard>
      )}

      {/* Actividad 24h */}
      <StatCard id="hero-24h" label="Sismos · 24 h">
        <span className="font-mono text-lg font-bold leading-none text-slate-100">
          {last24h.length.toLocaleString("es-CO")}
        </span>
        {delta !== null ? (
          <span
            className={`text-[11px] font-medium ${
              delta > 0 ? "text-amber-400" : "text-emerald-400"
            }`}
          >
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% vs ayer
          </span>
        ) : (
          <span className="text-[11px] text-slate-600">sin datos previos</span>
        )}
      </StatCard>

      {/* Tsunamis activos (opcional) */}
      {tsunamis.length > 0 && (
        <StatCard id="hero-tsunami" label="⚠️ Alerta tsunami" highlight="amber">
          <span className="font-mono text-lg font-bold leading-none text-amber-400">
            {tsunamis.length}
          </span>
          <span className="text-[11px] text-amber-500/60">
            en las últimas 24 h
          </span>
        </StatCard>
      )}
    </div>
  );
}

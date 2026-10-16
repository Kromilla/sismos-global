/**
 * LiveFeed — Feed de eventos sísmicos recientes con animación de entrada.
 *
 * Muestra los N últimos eventos del catálogo en vivo, con:
 *  - Color codificado por magnitud
 *  - Tiempo transcurrido (vivo, se actualiza cada minuto)
 *  - Indicador de tsunami
 *  - Animación de entrada para eventos genuinamente nuevos
 *  - Click para enfocar en el mapa
 */

import { useEffect, useRef, useState } from "react";
import type { Quake } from "../types";
import { fmtAgo, magColor } from "../ui/format";
import { Badge } from "./ui";
import { buildQuakeShareUrl, copyTextToClipboard } from "../utils/share";

interface LiveFeedProps {
  quakes: Quake[];
  now: number;
  onFocus?: (q: Quake) => void;
  maxItems?: number;
  className?: string;
}

export default function LiveFeed({
  quakes,
  now,
  onFocus,
  maxItems = 12,
  className = "",
}: LiveFeedProps) {
  // IDs que ya existían en el render anterior — los nuevos reciben animación
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [animating, setAnimating] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const top = quakes.slice(0, maxItems);

  const handleCopy = async (e: React.MouseEvent, q: Quake) => {
    e.stopPropagation();
    const url = buildQuakeShareUrl(q.id);
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setCopiedId(q.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  useEffect(() => {
    const current = new Set(top.map((q) => q.id));
    const newIds = new Set<string>();
    for (const id of current) {
      if (!prevIdsRef.current.has(id) && prevIdsRef.current.size > 0) {
        newIds.add(id);
      }
    }
    prevIdsRef.current = current;

    if (newIds.size > 0) {
      const animTimer = setTimeout(() => {
        setAnimating(newIds);
      }, 0);
      const clearTimer = setTimeout(() => setAnimating(new Set()), 2000);
      return () => {
        clearTimeout(animTimer);
        clearTimeout(clearTimer);
      };
    }
  }, [top]);

  if (quakes.length === 0) {
    return (
      <div className={`rounded-2xl border border-slate-800 bg-slate-900/30 p-4 text-center text-xs text-slate-600 ${className}`}>
        Cargando catálogo en vivo…
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/20 ${className}`}>
      {/* Encabezado */}
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[11px] uppercase tracking-wider text-slate-500">
          En vivo · últimos {quakes.length.toLocaleString("es-CO")} eventos
        </span>
      </div>

      {/* Lista */}
      <div className="divide-y divide-slate-800/60">
        {top.map((q) => {
          const isNew = animating.has(q.id);
          return (
            <div
              key={q.id}
              id={`live-feed-${q.id}`}
              role="button"
              tabIndex={0}
              onClick={() => onFocus?.(q)}
              onKeyDown={(e) => e.key === "Enter" && onFocus?.(q)}
              className={`flex w-full cursor-pointer items-start gap-2.5 px-3 py-2 text-left transition hover:bg-slate-800/40 ${
                isNew ? "bg-emerald-500/5" : ""
              }`}
              style={
                isNew
                  ? { animation: "feedSlideIn 0.4s ease" }
                  : undefined
              }
            >
              {/* Magnitud */}
              <div className="mt-0.5 shrink-0">
                <Badge color={magColor(q.mag)}>
                  {q.mag.toFixed(1)}
                </Badge>
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-slate-200">{q.place}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                  <span>{q.depth.toFixed(0)} km</span>
                  <span className="text-slate-700">·</span>
                  <span>{fmtAgo(q.time, now)}</span>
                  {q.tsunami && (
                    <>
                      <span className="text-slate-700">·</span>
                      <span className="font-medium text-amber-400">⚠️ tsunami</span>
                    </>
                  )}
                </p>
              </div>

              {/* Red y botón compartir */}
              <div className="mt-0.5 flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => handleCopy(e, q)}
                  className={`rounded border px-1 py-0.5 font-mono text-[10px] transition ${
                    copiedId === q.id
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                      : "border-slate-700 text-slate-400 hover:border-sky-500 hover:text-sky-300"
                  }`}
                  title="Copiar enlace para compartir este sismo"
                >
                  {copiedId === q.id ? "✓" : "🔗"}
                </button>
                <span className="rounded border border-slate-700 px-1 py-0.5 font-mono text-[10px] text-slate-500">
                  {q.source}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes feedSlideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

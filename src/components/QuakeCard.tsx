/**
 * QuakeCard — Tarjeta flotante interactiva de detalle de un sismo seleccionado.
 *
 * Ofrece:
 *  - Ficha técnica completa del sismo (magnitud, profundidad, hora, tsunami, coordenadas)
 *  - Botón nativo / portapapeles para compartir con URL directa (?quake=id)
 *  - Acceso directo al análisis de Intensidad Macrosísmica (MMI)
 *  - Enlace oficial a la ficha USGS / EMSC
 *  - Cierre para deseleccionar y limpiar la URL
 */

import { useState } from "react";
import type { Quake } from "../types";
import {
  depthColor,
  depthLabel,
  fmtAgo,
  fmtDateTime,
  magColor,
} from "../ui/format";
import {
  DEFAULT_IPE,
  IPE_MODELS,
  hypocentralKm,
  mmiLevel,
  mmiRoman,
} from "../science/intensity";
import {
  buildQuakeShareText,
  buildQuakeShareUrl,
  copyTextToClipboard,
  getTelegramShareUrl,
  getTwitterShareUrl,
  getWhatsAppShareUrl,
} from "../utils/share";

interface QuakeCardProps {
  quake: Quake;
  onClose: () => void;
  onOpenIntensity?: (q: Quake) => void;
  onRecenter?: (q: Quake) => void;
  className?: string;
}

export default function QuakeCard({
  quake,
  onClose,
  onOpenIntensity,
  onRecenter,
  className = "",
}: QuakeCardProps) {
  const [copied, setCopied] = useState(false);

  const ipe = IPE_MODELS[DEFAULT_IPE];
  const epicentralRhypo = hypocentralKm(0, quake.depth);
  const epicentralMmi = ipe.mmi(quake.mag, epicentralRhypo);
  const epicentralRoman = mmiRoman(epicentralMmi);
  const epicentralLabel = mmiLevel(epicentralMmi).label;

  const shareUrl = buildQuakeShareUrl(quake.id);
  const shareText = buildQuakeShareText(quake);

  const handleCopyLink = async () => {
    const ok = await copyTextToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `Sismo M ${quake.mag.toFixed(1)} — ${quake.place}`,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // En caso de cancelación o fallo, copiar al portapapeles
      }
    }
    await handleCopyLink();
  };

  return (
    <div
      className={`relative w-full max-w-sm rounded-2xl border border-slate-700/80 bg-ink-950/90 p-4 shadow-2xl backdrop-blur-xl transition-all ${className}`}
      style={{
        boxShadow: `0 20px 45px -10px rgba(0,0,0,0.7), 0 0 25px -5px ${magColor(quake.mag)}33`,
      }}
    >
      {/* Botón cerrar */}
      <button
        onClick={onClose}
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
        title="Cerrar ficha"
        aria-label="Cerrar ficha"
      >
        ✕
      </button>

      {/* Header: Magnitud + Lugar */}
      <div className="flex items-start gap-3 pr-6">
        <div className="shrink-0 pt-0.5">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl font-mono text-lg font-black text-ink-950 shadow-md"
            style={{ backgroundColor: magColor(quake.mag) }}
          >
            {quake.mag.toFixed(1)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-slate-400">
              M{quake.magType}
            </span>
            <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[10px] font-mono text-slate-400">
              {quake.source}
            </span>
            {quake.tsunami && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-amber-300">
                ⚠️ TSUNAMI
              </span>
            )}
          </div>
          <h3 className="mt-0.5 truncate text-sm font-semibold text-white" title={quake.place}>
            {quake.place}
          </h3>
          <p className="text-xs text-slate-400">
            {fmtAgo(quake.time)} · {fmtDateTime(quake.time)}
          </p>
        </div>
      </div>

      {/* Grid de métricas clave */}
      <div className="mt-3.5 grid grid-cols-2 gap-2 rounded-xl bg-ink-900/60 p-2.5 text-xs border border-ink-800/80">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            Profundidad
          </span>
          <p className="font-mono font-medium text-slate-200">
            {quake.depth.toFixed(0)} km{" "}
            <span
              className="text-[10px]"
              style={{ color: depthColor(quake.depth) }}
            >
              ({depthLabel(quake.depth)})
            </span>
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            Coordenadas
          </span>
          <p className="font-mono text-slate-200">
            {quake.lat.toFixed(2)}°, {quake.lon.toFixed(2)}°
          </p>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <button
          onClick={handleCopyLink}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
            copied
              ? "border border-emerald-500/60 bg-emerald-500/20 text-emerald-300 shadow-lg shadow-emerald-500/20"
              : "bg-sky-500 text-ink-950 shadow-lg shadow-sky-500/20 hover:bg-sky-400 active:scale-[0.98]"
          }`}
          title="Copiar enlace directo al portapapeles"
        >
          {copied ? (
            <>
              <span className="font-bold">✓</span>
              <span>¡Enlace copiado!</span>
            </>
          ) : (
            <>
              <span>📋</span>
              <span>Copiar enlace</span>
            </>
          )}
        </button>

        {onOpenIntensity && (
          <button
            onClick={() => onOpenIntensity(quake)}
            className="flex items-center gap-1.5 rounded-xl border border-ink-700 bg-ink-800/80 px-2.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-ink-700 hover:text-white active:scale-[0.98]"
            title={`Calcular impacto en ciudades (intensidad en epicentro: MMI ${epicentralRoman} · ${epicentralLabel})`}
          >
            <span>📊</span>
            <span>MMI {epicentralRoman}</span>
          </button>
        )}

        {onRecenter && (
          <button
            onClick={() => onRecenter(quake)}
            className="flex items-center gap-1 rounded-xl border border-ink-700 bg-ink-800/80 px-2.5 py-2 text-xs text-slate-300 transition hover:bg-ink-700 hover:text-white"
            title="Centrar mapa en este evento"
          >
            <span>🎯</span>
          </button>
        )}

        {quake.url && (
          <a
            href={quake.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-xl border border-ink-700 bg-ink-800/80 px-2.5 py-2 text-xs text-slate-400 transition hover:bg-ink-700 hover:text-sky-300"
            title={`Abrir ficha oficial en ${quake.source}`}
          >
            ↗
          </a>
        )}
      </div>

      {/* Barra de compartir en redes sociales */}
      <div className="mt-2.5 flex items-center justify-between gap-1.5 rounded-xl border border-slate-800/80 bg-ink-900/60 px-2.5 py-1.5 text-xs">
        <span className="text-[10px] font-medium text-slate-400">
          Compartir:
        </span>
        <div className="flex items-center gap-1.5">
          <a
            href={getWhatsAppShareUrl(shareText, shareUrl)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-2 py-0.5 text-[11px] font-medium text-emerald-400 transition hover:bg-emerald-900/60 hover:text-emerald-200"
            title="Compartir por WhatsApp"
          >
            <span>💬</span>
            <span>WhatsApp</span>
          </a>
          <a
            href={getTwitterShareUrl(shareText, shareUrl)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 px-2 py-0.5 text-[11px] font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
            title="Publicar en X (Twitter)"
          >
            <span>𝕏</span>
          </a>
          <a
            href={getTelegramShareUrl(shareText, shareUrl)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-lg border border-sky-900/60 bg-sky-950/40 px-2 py-0.5 text-[11px] font-medium text-sky-400 transition hover:bg-sky-900/60 hover:text-sky-200"
            title="Compartir en Telegram"
          >
            <span>✈️</span>
          </a>
          {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
            <button
              onClick={handleNativeShare}
              className="flex items-center rounded-lg border border-slate-800 bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              title="Más aplicaciones (Compartir nativo del sistema)"
            >
              ⋯
            </button>
          )}
        </div>
      </div>

      {copied && (
        <div className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-center text-[11px] text-emerald-300 animate-fadeIn">
          ✓ Enlace copiado al portapapeles. Listo para pegar en chats o redes.
        </div>
      )}

      {/* Indicador de URL activa */}
      <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-500">
        <span className="truncate font-mono">ID: {quake.id}</span>
        <span className="shrink-0 text-slate-600">Sincronizado con URL</span>
      </div>
    </div>
  );
}

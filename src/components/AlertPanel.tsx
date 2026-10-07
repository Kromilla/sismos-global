/**
 * AlertPanel — Panel de configuración y historial de alertas sísmicas.
 *
 * Se muestra como un slide-over desde la derecha. Permite al usuario:
 *  - Activar/desactivar alertas
 *  - Elegir la magnitud mínima
 *  - Solicitar permiso de notificación
 *  - Ver el historial de alertas recibidas
 */

import { useEffect, useRef } from "react";
import type { UseAlertsReturn } from "../hooks/useAlerts";
import type { Quake } from "../types";
import { fmtAgo, magColor } from "../ui/format";
import { Badge } from "./ui";

interface AlertPanelProps {
  alerts: UseAlertsReturn;
  onClose: () => void;
  onFocus?: (q: Quake) => void;
}

const MAG_OPTIONS = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0];

export default function AlertPanel({ alerts, onClose, onFocus }: AlertPanelProps) {
  const { prefs, setPrefs, permission, requestPermission, recent, clearRecent } =
    alerts;

  const panelRef = useRef<HTMLDivElement>(null);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus trap: cerrar al hacer clic fuera
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Pequeño delay para no capturar el clic que abrió el panel
    const t = setTimeout(() => document.addEventListener("click", onClick), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", onClick);
    };
  }, [onClose]);

  const permissionLabel: Record<string, string> = {
    granted: "✅ Permitido",
    denied: "🚫 Bloqueado",
    default: "Sin permiso aún",
    unsupported: "No soportado",
  };

  return (
    <>
      {/* Overlay difuminado */}
      <div className="fixed inset-0 z-[1999] bg-black/40 backdrop-blur-sm" />

      {/* Panel lateral */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 z-[2000] flex h-full w-full max-w-sm flex-col gap-0 overflow-hidden border-l border-slate-800 bg-[#070b14] shadow-2xl"
        style={{ animation: "slideInRight 0.25s ease" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              🔔 Alertas sísmicas
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Notificación push cuando ocurra un sismo
            </p>
          </div>
          <button
            id="alert-panel-close"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* Permiso de notificaciones */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Permiso del navegador
              </span>
              <span className="text-xs font-mono text-slate-300">
                {permissionLabel[permission] ?? permission}
              </span>
            </div>
            {permission !== "granted" && permission !== "denied" && permission !== "unsupported" && (
              <button
                id="alert-request-permission"
                onClick={requestPermission}
                className="mt-2 w-full rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500 active:bg-sky-700"
              >
                Permitir notificaciones
              </button>
            )}
            {permission === "denied" && (
              <p className="mt-2 text-[11px] text-amber-400">
                Las notificaciones están bloqueadas. Ve a la configuración del
                navegador para habilitarlas.
              </p>
            )}
          </section>

          {/* Configuración */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-3">
            {/* Toggle activar */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-slate-300">Activar alertas</span>
              <button
                id="alert-toggle"
                role="switch"
                aria-checked={prefs.enabled}
                onClick={() => setPrefs({ enabled: !prefs.enabled })}
                disabled={permission !== "granted"}
                className={`relative h-5 w-9 rounded-full border transition-colors ${
                  prefs.enabled && permission === "granted"
                    ? "border-sky-500 bg-sky-500/30"
                    : "border-slate-700 bg-slate-800"
                } disabled:opacity-40`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                    prefs.enabled && permission === "granted"
                      ? "left-4"
                      : "left-0.5"
                  }`}
                />
              </button>
            </label>

            {/* Magnitud mínima */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-slate-400">Magnitud mínima</span>
                <span
                  className="font-mono text-sm font-bold"
                  style={{ color: magColor(prefs.minMag) }}
                >
                  M{prefs.minMag.toFixed(1)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {MAG_OPTIONS.map((m) => (
                  <button
                    key={m}
                    id={`alert-mag-${m}`}
                    onClick={() => setPrefs({ minMag: m })}
                    className={`rounded-md border px-2 py-0.5 font-mono text-xs transition ${
                      prefs.minMag === m
                        ? "border-sky-500/60 bg-sky-500/10 text-sky-300"
                        : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                    }`}
                  >
                    {m.toFixed(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Sonido */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-slate-400">Sonido de alerta</span>
              <input
                type="checkbox"
                id="alert-sound"
                checked={prefs.sound}
                onChange={(e) => setPrefs({ sound: e.target.checked })}
                className="accent-sky-500"
              />
            </label>
          </section>

          {/* Historial de alertas recientes */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">
                Alertas recibidas
              </span>
              {recent.length > 0 && (
                <button
                  id="alert-clear"
                  onClick={clearRecent}
                  className="text-[11px] text-slate-500 underline underline-offset-2 hover:text-slate-300"
                >
                  Limpiar
                </button>
              )}
            </div>

            {recent.length === 0 ? (
              <p className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-6 text-center text-xs text-slate-600">
                {prefs.enabled && permission === "granted"
                  ? "Sin alertas recientes. Esperando nuevos sismos…"
                  : "Activa las alertas para recibir notificaciones aquí."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {recent.map(({ quake, seenAt }) => (
                  <button
                    key={quake.id}
                    type="button"
                    onClick={() => {
                      onFocus?.(quake);
                      onClose();
                    }}
                    className="flex w-full text-left items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 transition hover:bg-slate-800/60"
                  >
                    <Badge color={magColor(quake.mag)}>
                      {quake.mag.toFixed(1)}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-slate-200">
                        {quake.place}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {quake.depth.toFixed(0)} km ·{" "}
                        {new Date(seenAt).toLocaleTimeString("es-CO", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" · "}
                        {fmtAgo(quake.time)}
                        {quake.tsunami && (
                          <span className="ml-1 text-amber-400">
                            ⚠️ Tsunami
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-sky-400 font-medium">
                      Ver ↗
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Nota informativa */}
          <p className="text-[11px] leading-relaxed text-slate-600">
            Las alertas se detectan comparando el catálogo en vivo con los
            eventos ya vistos. El catálogo se actualiza cada 2 minutos.
            No hay servidor involucrado: todo ocurre en tu navegador.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

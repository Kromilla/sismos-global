import { useMemo } from "react";
import type { Quake } from "../types";
import { CITIES } from "../data/cities";
import {
  DEFAULT_IPE,
  IPE_MODELS,
  hypocentralKm,
  mmiColor,
  mmiLevel,
  mmiRoman,
  radiusForMmi,
  wellsCoppersmithLength,
} from "../science/intensity";
import { haversineKm } from "../science/stats";
import { fmtDateTime, magColor } from "../ui/format";

interface ImpactRow {
  city: (typeof CITIES)[number];
  distKm: number;
  rhypoKm: number;
  mmi: number;
  label: string;
  nearRupture: boolean;
}

interface Props {
  quake: Quake;
  onClose: () => void;
}

export default function QuakeIntensityPanel({ quake, onClose }: Props) {
  const ipe = IPE_MODELS[DEFAULT_IPE];

  const rows = useMemo<ImpactRow[]>(() => {
    const srl = wellsCoppersmithLength(quake.mag);
    return CITIES.map((city) => {
      const distKm = haversineKm(quake.lat, quake.lon, city.lat, city.lon);
      const rhypoKm = hypocentralKm(distKm, quake.depth);
      const mmi = ipe.mmi(quake.mag, rhypoKm);
      const nearRupture = quake.mag >= 7.0 && distKm < srl / 2;
      return {
        city,
        distKm,
        rhypoKm,
        mmi,
        label: mmiLevel(mmi).label,
        nearRupture,
      };
    })
      .filter((r) => r.mmi >= 2)
      .sort((a, b) => b.mmi - a.mmi);
  }, [quake, ipe]);

  /** Radios de isosistas para mostrar en el subtítulo. */
  const iso6km = radiusForMmi(quake.mag, 6, quake.depth, ipe.mmi);
  const iso5km = radiusForMmi(quake.mag, 5, quake.depth, ipe.mmi);

  const maxMmi = rows[0]?.mmi ?? 0;

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onClick={onClose}
    >
      {/* Fondo difuminado */}
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-700/60 bg-slate-900 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-start gap-4 border-b border-slate-800 p-5">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-slate-950"
            style={{ background: magColor(quake.mag) }}
          >
            {quake.mag.toFixed(1)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-slate-100">
              {quake.place}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {fmtDateTime(quake.time)} · Prof. {quake.depth.toFixed(0)} km ·{" "}
              {quake.lat.toFixed(2)}°, {quake.lon.toFixed(2)}°
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
              <span>
                Intensidad máxima estimada:{" "}
                <b
                  className="rounded px-1.5 py-0.5 text-slate-950"
                  style={{ background: mmiColor(maxMmi) }}
                >
                  MMI {mmiRoman(maxMmi)}
                </b>
              </span>
              {iso6km > 2 && (
                <span>
                  Radio MMI VI ≈{" "}
                  <b className="text-slate-200">{iso6km.toFixed(0)} km</b>
                </span>
              )}
              {iso5km > 2 && (
                <span>
                  Radio MMI V ≈{" "}
                  <b className="text-slate-200">{iso5km.toFixed(0)} km</b>
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200 transition"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Modelo usado */}
        <div className="border-b border-slate-800 bg-slate-950/40 px-5 py-2 text-[10px] text-slate-500">
          IPE: {ipe.name} · {ipe.scope}
        </div>

        {/* Tabla de ciudades */}
        <div className="overflow-y-auto">
          {rows.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">
              Ninguna ciudad alcanza MMI II. El sismo es muy débil o muy
              profundo.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-slate-900/95 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Ciudad</th>
                  <th className="px-4 py-2 text-right">Distancia</th>
                  <th className="px-4 py-2 text-center">MMI</th>
                  <th className="px-4 py-2 text-left">Percepción</th>
                  <th className="px-4 py-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = Math.min(100, ((r.mmi - 1) / 11) * 100);
                  return (
                    <tr
                      key={r.city.id}
                      className="border-t border-slate-800/60 hover:bg-slate-800/30 transition"
                    >
                      <td className="px-4 py-2">
                        <span className="text-slate-200">{r.city.name}</span>
                        <span className="ml-1.5 text-[11px] text-slate-500">
                          {r.city.country}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-slate-400">
                        {r.distKm.toFixed(0)} km
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span
                          className="inline-block w-10 rounded-md py-0.5 text-center font-mono text-xs font-bold text-slate-950"
                          style={{ background: mmiColor(r.mmi) }}
                        >
                          {mmiRoman(r.mmi)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {r.label}
                        {r.nearRupture && (
                          <div
                            className="mt-1 text-[10px] font-medium text-amber-500"
                            title="Modelo de falla puntual subestima daños cerca de la ruptura (Wells & Coppersmith)"
                          >
                            ⚠️ Cerca de la ruptura
                          </div>
                        )}
                      </td>
                      {/* Barra visual de intensidad */}
                      <td className="px-4 py-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: mmiColor(r.mmi),
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Observado vs predicho (si viene del USGS) */}
        {(quake.mmi != null || quake.cdi != null) && (
          <div className="border-t border-slate-800 bg-slate-950/40 px-5 py-3 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">
              Observado por el USGS:{" "}
            </span>
            {quake.mmi != null && (
              <span className="mr-3">
                ShakeMap{" "}
                <b
                  className="rounded px-1 text-slate-950"
                  style={{ background: mmiColor(quake.mmi) }}
                >
                  MMI {mmiRoman(quake.mmi)}
                </b>
              </span>
            )}
            {quake.cdi != null && (
              <span>
                DYFI{" "}
                <b
                  className="rounded px-1 text-slate-950"
                  style={{ background: mmiColor(quake.cdi) }}
                >
                  CDI {mmiRoman(quake.cdi)}
                </b>
                {quake.felt != null &&
                  ` · ${quake.felt.toLocaleString("es-CO")} reportes`}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-800 px-5 py-3 text-[10px] text-slate-600">
          Intensidad estimada en el epicentro. No considera efecto de sitio
          (suelo blando amplifica). Solo ciudades de la lista interna (
          {CITIES.length} en total).
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import type { Quake } from "../types";
import { CITIES } from "../data/cities";
import {
  DEFAULT_IPE,
  IPE_MODELS,
  hypocentralKm,
  mmiColor,
  mmiLevel,
  mmiRoman,
  mmiToPga,
  pgaToG,
  radiusForMmi,
  wellsCoppersmithLength,
} from "../science/intensity";
import { haversineKm } from "../science/stats";
import { fmtDateTime, magColor } from "../ui/format";

export interface ImpactRow {
  city: (typeof CITIES)[number];
  distKm: number;
  rhypoKm: number;
  mmi: number;
  pga: number;
  gFraction: number;
  label: string;
  perception: string;
  damage: string;
  nearRupture: boolean;
}

interface Props {
  quake: Quake;
  onClose: () => void;
}

export default function QuakeIntensityPanel({ quake, onClose }: Props) {
  const ipe = IPE_MODELS[DEFAULT_IPE];

  // Distancia interactiva para simulación en vivo (inicia en distancia típica 30 km o epicentro)
  const [customDistKm, setCustomDistKm] = useState<number>(30);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

  // Intensidad física real estimada en el epicentro
  const epicentralRhypo = hypocentralKm(0, quake.depth);
  const epicentralMmi = ipe.mmi(quake.mag, epicentralRhypo);
  const epicentralPga = mmiToPga(epicentralMmi);
  const epicentralG = pgaToG(epicentralPga);

  // Energía liberada equivalente (Gutenberg-Richter 1956: log10(E) = 4.8 + 1.5 * M)
  const energyJoules = 10 ** (4.8 + 1.5 * quake.mag);
  const tonsTnt = energyJoules / 4.184e9;

  // Ruptura de falla
  const srl = wellsCoppersmithLength(quake.mag);

  const { displayRows, isAttenuated } = useMemo(() => {
    const all = CITIES.map((city) => {
      const distKm = haversineKm(quake.lat, quake.lon, city.lat, city.lon);
      const rhypoKm = hypocentralKm(distKm, quake.depth);
      const mmi = ipe.mmi(quake.mag, rhypoKm);
      const pga = mmiToPga(mmi);
      const gFraction = pgaToG(pga);
      const nearRupture = quake.mag >= 7.0 && distKm < srl / 2;
      const level = mmiLevel(mmi);
      return {
        city,
        distKm,
        rhypoKm,
        mmi,
        pga,
        gFraction,
        label: level.label,
        perception: level.perception,
        damage: level.damage,
        nearRupture,
      };
    });

    const felt = all.filter((r) => r.mmi >= 1.5).sort((a, b) => b.mmi - a.mmi);
    if (felt.length > 0) {
      return { displayRows: felt, isAttenuated: false };
    }
    // Si no alcanza MMI II en ciudades, mostrar las 5 más cercanas para mostrar la atenuación
    const nearest = [...all].sort((a, b) => a.distKm - b.distKm).slice(0, 5);
    return { displayRows: nearest, isAttenuated: true };
  }, [quake, ipe, srl]);

  /** Radios de isosistas para mostrar en el encabezado */
  const iso6km = radiusForMmi(quake.mag, 6, quake.depth, ipe.mmi);
  const iso5km = radiusForMmi(quake.mag, 5, quake.depth, ipe.mmi);
  const iso4km = radiusForMmi(quake.mag, 4, quake.depth, ipe.mmi);
  const iso3km = radiusForMmi(quake.mag, 3, quake.depth, ipe.mmi);

  // Cálculo interactivo en tiempo real para la distancia personalizada
  const customRhypo = hypocentralKm(customDistKm, quake.depth);
  const customMmi = ipe.mmi(quake.mag, customRhypo);
  const customSigma = ipe.sigma(customRhypo);
  const customPga = mmiToPga(customMmi);
  const customG = pgaToG(customPga);
  const customLevel = mmiLevel(customMmi);

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center sm:items-center p-0 sm:p-4"
      onClick={onClose}
    >
      {/* Fondo difuminado */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" />

      {/* Panel */}
      <div
        className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-y-auto rounded-t-2xl border border-slate-700/80 bg-slate-900 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-start gap-4 border-b border-slate-800 p-4 sm:p-5">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl font-mono text-xl font-black text-slate-950 shadow-lg"
            style={{ background: magColor(quake.mag) }}
          >
            {quake.mag.toFixed(1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-sky-400 border border-sky-500/20">
                M{quake.magType} · {quake.source}
              </span>
              <p className="truncate text-base font-semibold text-slate-100">
                {quake.place}
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {fmtDateTime(quake.time)} · Profundidad {quake.depth.toFixed(0)} km ·{" "}
              {quake.lat.toFixed(2)}°, {quake.lon.toFixed(2)}°
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="text-slate-400">Epicentro:</span>
                <b
                  className="rounded px-2 py-0.5 font-mono text-xs font-bold text-slate-950 shadow-sm"
                  style={{ background: mmiColor(epicentralMmi) }}
                >
                  MMI {mmiRoman(epicentralMmi)} ({epicentralMmi.toFixed(1)}) · {mmiLevel(epicentralMmi).label}
                </b>
              </span>
              <span className="rounded border border-slate-800 bg-slate-950/70 px-2 py-0.5 font-mono text-slate-300">
                PGA {epicentralPga.toFixed(1)} cm/s² ({(epicentralG * 100).toFixed(2)}% g)
              </span>
              {epicentralMmi >= 6 && iso6km > 2 && (
                <span className="text-slate-400">
                  Radio VI ≈ <b className="text-slate-200">{iso6km.toFixed(0)} km</b>
                </span>
              )}
              {epicentralMmi >= 5 && iso5km > 2 && (
                <span className="text-slate-400">
                  Radio V ≈ <b className="text-slate-200">{iso5km.toFixed(0)} km</b>
                </span>
              )}
              {epicentralMmi >= 4 && iso4km > 2 && (
                <span className="text-slate-400">
                  Radio IV ≈ <b className="text-slate-200">{iso4km.toFixed(0)} km</b>
                </span>
              )}
              {epicentralMmi >= 3 && iso3km > 2 && (
                <span className="text-slate-400">
                  Percepción ≈ <b className="text-slate-200">{iso3km.toFixed(0)} km</b>
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            aria-label="Cerrar ventana"
          >
            ✕
          </button>
        </div>

        {/* Modelo científico y atenuación */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-950/50 px-5 py-2 text-[11px] text-slate-400 gap-1">
          <span>Modelo IPE: <strong className="text-slate-300">{ipe.name}</strong></span>
          <span className="text-slate-500">{ipe.scope}</span>
        </div>

        {/* Calculadora interactiva por distancia */}
        <div className="border-b border-slate-800 bg-slate-950/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <span>⚡</span>
              <span>Calculadora de sacudida por distancia</span>
            </span>
            <span className="text-[11px] text-slate-400">
              Desliza para calcular aceleración y percepción en cualquier punto
            </span>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="font-mono text-[11px] text-slate-500">1 km</span>
            <input
              type="range"
              min="1"
              max="250"
              value={customDistKm}
              onChange={(e) => setCustomDistKm(Number(e.target.value))}
              className="flex-1 accent-sky-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <span className="font-mono text-[11px] text-slate-500">250 km</span>
            <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs">
              <span className="text-slate-400">Dist:</span>
              <span className="font-mono font-bold text-sky-300">{customDistKm} km</span>
            </div>
          </div>

          {/* 4 Métricas clave con todos los números del cálculo */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Intensidad</span>
              <p className="mt-1 font-mono font-bold" style={{ color: mmiColor(customMmi) }}>
                MMI {mmiRoman(customMmi)} ({customMmi.toFixed(2)})
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400 font-mono">
                ±{customSigma.toFixed(2)}σ ({Math.max(1, customMmi - customSigma).toFixed(1)}–{Math.min(12, customMmi + customSigma).toFixed(1)})
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Aceleración PGA</span>
              <p className="mt-1 font-mono font-bold text-slate-200">
                {customPga.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">cm/s²</span>
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                Worden et al. (2012)
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Fuerza Gravitatoria</span>
              <p className="mt-1 font-mono font-bold text-slate-200">
                {(customG * 100).toFixed(2)}% <span className="text-[10px] text-slate-400 font-normal">g</span>
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                {customG >= 0.05 ? "Sacudida fuerte" : customG >= 0.01 ? "Fácilmente perceptible" : "Imperceptible/leve"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Distancia al Foco</span>
              <p className="mt-1 font-mono font-bold text-sky-300">
                {customRhypo.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">km Rhypo</span>
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400 font-mono">
                d={customDistKm}km · prof={quake.depth.toFixed(0)}km
              </p>
            </div>
          </div>

          {/* Efecto percibido y daño estructural completo sin truncar */}
          <div className="mt-2.5 rounded-xl border border-slate-800/90 bg-slate-900/70 p-3 text-xs leading-relaxed space-y-1.5">
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
              <span className="font-semibold text-sky-400 shrink-0">Percepción en personas:</span>
              <span className="text-slate-200">{customLevel.perception}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 border-t border-slate-800/80 pt-1.5">
              <span className="font-semibold text-amber-400 shrink-0">Daño estructural esperado:</span>
              <span className="text-slate-300">{customLevel.damage}</span>
            </div>
          </div>
        </div>

        {/* Tabla de ciudades calculadas con todas las métricas */}
        <div className="flex-1 overflow-y-auto min-h-[160px] max-h-64">
          {isAttenuated && (
            <div className="bg-amber-950/30 border-b border-amber-800/40 px-4 py-2 text-xs text-amber-300">
              ℹ️ Ninguna ciudad supera MMI II por atenuación geométrica. Se muestran las 5 ciudades más cercanas.
            </div>
          )}
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800 shadow-sm">
              <tr>
                <th className="px-3.5 py-2.5 text-left font-semibold">Ciudad</th>
                <th className="px-3.5 py-2.5 text-right font-semibold">Distancia</th>
                <th className="px-3.5 py-2.5 text-center font-semibold">MMI</th>
                <th className="px-3.5 py-2.5 text-right font-semibold">Aceleración (PGA)</th>
                <th className="px-3.5 py-2.5 text-left font-semibold">Efecto estimado</th>
                <th className="px-3.5 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r) => {
                const pct = Math.min(100, Math.max(8, ((r.mmi - 1) / 11) * 100));
                return (
                  <tr
                    key={r.city.id}
                    className="border-t border-slate-800/60 hover:bg-slate-800/40 transition"
                  >
                    <td className="px-3.5 py-2">
                      <div className="font-medium text-slate-200">{r.city.name}</div>
                      <div className="text-[10px] text-slate-500">{r.city.country}</div>
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono">
                      <div className="text-slate-300 font-semibold">{r.distKm.toFixed(0)} km</div>
                      <div className="text-[10px] text-slate-500">Rhypo {r.rhypoKm.toFixed(0)} km</div>
                    </td>
                    <td className="px-3.5 py-2 text-center">
                      <span
                        className="inline-block rounded-md px-2 py-0.5 font-mono text-xs font-bold text-slate-950 shadow-sm"
                        style={{ background: mmiColor(r.mmi) }}
                      >
                        {mmiRoman(r.mmi)}
                        <span className="ml-1 text-[10px] opacity-75 font-normal">
                          {r.mmi.toFixed(1)}
                        </span>
                      </span>
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono">
                      <div className="text-slate-200 font-medium">{r.pga.toFixed(1)} cm/s²</div>
                      <div className="text-[10px] text-slate-400">{(r.gFraction * 100).toFixed(2)}% g</div>
                    </td>
                    <td className="px-3.5 py-2">
                      <span className="text-slate-300 font-medium">{r.label}</span>
                      {r.nearRupture && (
                        <div
                          className="mt-0.5 text-[10px] font-medium text-amber-400"
                          title="Modelo de falla puntual subestima daños cerca de la ruptura (Wells & Coppersmith)"
                        >
                          ⚠️ Ruptura cercana
                        </div>
                      )}
                    </td>
                    {/* Barra visual de intensidad */}
                    <td className="px-3.5 py-2">
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
        </div>

        {/* Parámetros y fórmulas completas desplegables */}
        <div className="border-t border-slate-800 bg-slate-950/60 px-4 py-2">
          <button
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-sky-400 hover:text-sky-300 transition"
          >
            <span>{showTechnicalDetails ? "▼" : "▶"}</span>
            <span>{showTechnicalDetails ? "Ocultar fórmulas y parámetros físicos" : "Ver fórmulas y desglose técnico del cálculo"}</span>
          </button>

          {showTechnicalDetails && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400 border-t border-slate-800/80 pt-2 font-mono">
              <div className="rounded-lg bg-slate-900/80 p-2.5 border border-slate-800">
                <span className="font-semibold text-slate-300 block mb-1">Ecuación IPE ({ipe.name}):</span>
                <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                  MMI = c₀ + c₁·M + c₂·ln(√(R² + R_m²)) + c₄·ln(R/50)
                </p>
                <p className="mt-1 text-[10px] text-slate-500 font-sans">
                  Incertidumbre epistémica: σ = ±{customSigma.toFixed(2)} MMI. Rango actual: MMI {Math.max(1, customMmi - customSigma).toFixed(1)} a {Math.min(12, customMmi + customSigma).toFixed(1)}.
                </p>
              </div>
              <div className="rounded-lg bg-slate-900/80 p-2.5 border border-slate-800">
                <span className="font-semibold text-slate-300 block mb-1">Energía y Ruptura (Gutenberg-Richter):</span>
                <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                  Energía sísmica radiada: <strong>{energyJoules.toExponential(2)} J</strong> (~{tonsTnt < 1000 ? `${tonsTnt.toFixed(1)} t TNT` : `${(tonsTnt / 1000).toFixed(1)} kt TNT`}).
                </p>
                <p className="mt-1 text-[10px] text-slate-500 font-sans">
                  {srl > 0 ? `Longitud de ruptura de falla (SRL): ${srl.toFixed(1)} km.` : "Ruptura puntual subsuperficial (M < 5.0)."}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Observado vs predicho (si viene del USGS ShakeMap o DYFI) */}
        {(quake.mmi != null || quake.cdi != null) && (
          <div className="border-t border-slate-800 bg-slate-950/40 px-5 py-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">
              Observado oficial (USGS):{" "}
            </span>
            {quake.mmi != null && (
              <span className="mr-3">
                ShakeMap{" "}
                <b
                  className="rounded px-1.5 py-0.2 text-slate-950 font-mono text-xs"
                  style={{ background: mmiColor(quake.mmi) }}
                >
                  MMI {mmiRoman(quake.mmi)} ({quake.mmi.toFixed(1)})
                </b>
              </span>
            )}
            {quake.cdi != null && (
              <span>
                Reportado por la población (DYFI){" "}
                <b
                  className="rounded px-1.5 py-0.2 text-slate-950 font-mono text-xs"
                  style={{ background: mmiColor(quake.cdi) }}
                >
                  CDI {mmiRoman(quake.cdi)} ({quake.cdi.toFixed(1)})
                </b>
                {quake.felt != null &&
                  ` · ${quake.felt.toLocaleString("es-CO")} personas`}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-800 px-5 py-2 text-[10px] text-slate-500">
          Cálculo teórico basado en ley de atenuación geométrica y anelástica. No incluye amplificación de sitio local ni topografía.
        </div>
      </div>
    </div>
  );
}

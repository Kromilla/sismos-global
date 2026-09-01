import { YEAR_DAYS, DAY_MS, mean } from "./stats";
import type { Quake } from "../types";

export interface FmdBin {
  mag: number;
  /** Eventos en el bin [mag, mag+dM). */
  count: number;
  /** Eventos con magnitud >= mag. */
  cumulative: number;
}

export interface GrFit {
  /** Magnitud de completitud estimada (máxima curvatura + corrección). */
  mc: number;
  /** Pendiente b de Gutenberg–Richter. */
  b: number;
  /** Error estándar de b (Shi & Bolt 1982). */
  bErr: number;
  /** Intercepto a para el catálogo completo. */
  a: number;
  /** Intercepto a normalizado a eventos por año. */
  aAnnual: number;
  /** Eventos usados (M >= Mc). */
  n: number;
  /** Duración del catálogo en años. */
  years: number;
}

/** Distribución frecuencia–magnitud, en bins de `dM`. */
export function fmd(mags: number[], dM = 0.1): FmdBin[] {
  if (!mags.length) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const m of mags) {
    if (m < lo) lo = m;
    if (m > hi) hi = m;
  }
  const min = Math.floor(lo / dM) * dM;
  const max = Math.ceil(hi / dM) * dM;
  const nBins = Math.max(1, Math.round((max - min) / dM) + 1);
  const counts = new Array<number>(nBins).fill(0);
  for (const m of mags) {
    const i = Math.round((m - min) / dM);
    if (i >= 0 && i < nBins) counts[i]++;
  }
  const bins: FmdBin[] = [];
  let cum = mags.length;
  for (let i = 0; i < nBins; i++) {
    bins.push({
      mag: +(min + i * dM).toFixed(2),
      count: counts[i],
      cumulative: cum,
    });
    cum -= counts[i];
  }
  return bins;
}

/**
 * Magnitud de completitud por máxima curvatura (Wiemer & Wyss 2000):
 * el bin más poblado marca el quiebre; se suma 0.2 como corrección empírica.
 */
export function magnitudeOfCompleteness(mags: number[], dM = 0.1): number {
  const bins = fmd(mags, dM);
  if (!bins.length) return NaN;
  let best = bins[0];
  for (const bin of bins) if (bin.count > best.count) best = bin;
  return +(best.mag + 0.2).toFixed(2);
}

/**
 * Ajuste de Gutenberg–Richter: b por máxima verosimilitud (Aki 1965) y
 * a derivado de la tasa observada por encima de Mc.
 */
export function fitGutenbergRichter(
  quakes: Quake[],
  opts: { mc?: number; dM?: number } = {},
): GrFit | null {
  if (quakes.length < 20) return null;
  const dM = opts.dM ?? 0.1;
  const allMags = quakes.map((q) => q.mag);
  const mc = opts.mc ?? magnitudeOfCompleteness(allMags, dM);
  if (!Number.isFinite(mc)) return null;

  const sel = quakes.filter((q) => q.mag >= mc - 1e-9);
  const n = sel.length;
  if (n < 15) return null;

  const mags = sel.map((q) => q.mag);
  const mBar = mean(mags);
  const denom = mBar - (mc - dM / 2);
  if (!(denom > 0)) return null;
  const b = Math.LOG10E / denom;

  let sq = 0;
  for (const m of mags) sq += (m - mBar) ** 2;
  const bErr = 2.3 * b * b * Math.sqrt(sq / (n * (n - 1)));

  let tMin = Infinity;
  let tMax = -Infinity;
  for (const q of sel) {
    if (q.time < tMin) tMin = q.time;
    if (q.time > tMax) tMax = q.time;
  }
  const spanDays = (tMax - tMin) / DAY_MS;
  const years = Math.max(spanDays / YEAR_DAYS, 1 / YEAR_DAYS);

  return {
    mc,
    b,
    bErr,
    a: Math.log10(n) + b * mc,
    aAnnual: Math.log10(n / years) + b * mc,
    n,
    years,
  };
}

/** Tasa anual esperada de eventos con M >= m. */
export function annualRate(fit: GrFit, m: number): number {
  return 10 ** (fit.aAnnual - fit.b * m);
}

/** Periodo de retorno en años para M >= m. */
export function returnPeriod(fit: GrFit, m: number): number {
  const r = annualRate(fit, m);
  return r > 0 ? 1 / r : Infinity;
}

/** Magnitud cuyo periodo de retorno es `years` años. */
export function magnitudeForReturnPeriod(fit: GrFit, years: number): number {
  return (fit.aAnnual + Math.log10(years)) / fit.b;
}

/**
 * Interpretación cualitativa de b. b~1 es lo normal en corteza;
 * b bajo indica esfuerzo diferencial alto (más peso de magnitudes grandes).
 */
export function interpretB(b: number): {
  label: string;
  tone: "alto" | "normal" | "bajo";
} {
  if (b < 0.8)
    return {
      label: "b bajo: mayor peso relativo de sismos grandes",
      tone: "bajo",
    };
  if (b > 1.2)
    return {
      label: "b alto: dominan los sismos pequeños (enjambre/volcánico)",
      tone: "alto",
    };
  return { label: "b típico de corteza tectónica", tone: "normal" };
}

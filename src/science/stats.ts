export const DAY_MS = 86_400_000;
export const YEAR_DAYS = 365.25;

export function mean(xs: number[]): number {
  if (!xs.length) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Distancia en km sobre la esfera (radio medio 6371 km). */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** P(al menos un evento) para un proceso de Poisson de tasa·ventana = lambda. */
export function poissonAtLeastOne(lambda: number): number {
  if (!Number.isFinite(lambda) || lambda <= 0) return 0;
  return 1 - Math.exp(-lambda);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function logspace(a: number, b: number, n: number): number[] {
  const la = Math.log(a);
  const lb = Math.log(b);
  return Array.from({ length: n }, (_, i) =>
    Math.exp(la + ((lb - la) * i) / (n - 1)),
  );
}

export function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

/** Energía liberada en julios (Gutenberg–Richter 1956). */
export function energyJoules(mag: number): number {
  return 10 ** (1.5 * mag + 4.8);
}

/** Equivalente en toneladas de TNT (1 t TNT = 4.184e9 J). */
export function tntTons(mag: number): number {
  return energyJoules(mag) / 4.184e9;
}

/** Energía en un texto legible: toneladas, kilotones o megatones de TNT. */
export function fmtEnergy(mag: number): string {
  const t = tntTons(mag);
  if (t < 1000)
    return `${t.toLocaleString("es-CO", { maximumFractionDigits: 0 })} t TNT`;
  if (t < 1e6)
    return `${(t / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} kt TNT`;
  return `${(t / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} Mt TNT`;
}

/**
 * Deformación sísmica de Benioff (Benioff, 1951): proporcional a la raíz
 * cuadrada de la energía sísmica radiada √E = 10^(0.75·M + 2.4) [J^(1/2)].
 */
export function benioffStrain(mag: number): number {
  return 10 ** (0.75 * mag + 2.4);
}

export interface BenioffPoint {
  time: number;
  label: string;
  cumStrainG: number;
  steadyG: number;
  maxMag: number;
}

/**
 * Construye la curva acumulada de liberación de deformación de Benioff (∑√E,
 * expresada en 10^7 J^(1/2)) junto con la recta de tasa estacionaria media.
 */
export function buildBenioffCurve(
  quakes: ReadonlyArray<{ time: number; mag: number }>,
  bins = 60,
): BenioffPoint[] {
  if (quakes.length < 2) return [];
  const sorted = [...quakes].sort((a, b) => a.time - b.time);
  const tMin = sorted[0].time;
  const tMax = sorted[sorted.length - 1].time;
  const span = Math.max(1, tMax - tMin);
  const nBins = Math.max(10, Math.min(bins, sorted.length));
  const step = span / nBins;
  const multiYear = span > 2 * YEAR_DAYS * DAY_MS;

  let totalStrain = 0;
  for (const q of sorted) totalStrain += benioffStrain(q.mag);
  const totalG = totalStrain / 1e7;

  const out: BenioffPoint[] = [];
  let idx = 0;
  let running = 0;

  for (let b = 0; b <= nBins; b++) {
    const tEdge = b === nBins ? tMax : Math.round(tMin + b * step);
    let binMaxMag = 0;
    while (idx < sorted.length && sorted[idx].time <= tEdge) {
      running += benioffStrain(sorted[idx].mag);
      if (sorted[idx].mag > binMaxMag) binMaxMag = sorted[idx].mag;
      idx++;
    }
    const d = new Date(tEdge);
    const label = multiYear
      ? String(d.getUTCFullYear())
      : d.toISOString().slice(0, 10);
    const frac = (tEdge - tMin) / span;
    out.push({
      time: tEdge,
      label,
      cumStrainG: Number((running / 1e7).toFixed(2)),
      steadyG: Number((totalG * frac).toFixed(2)),
      maxMag: binMaxMag,
    });
  }

  return out;
}

export const DAY_MS = 86_400_000
export const YEAR_DAYS = 365.25

export function mean(xs: number[]): number {
  if (!xs.length) return NaN
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  let s = 0
  for (const x of xs) s += (x - m) ** 2
  return Math.sqrt(s / (xs.length - 1))
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** Distancia en km sobre la esfera (radio medio 6371 km). */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** P(al menos un evento) para un proceso de Poisson de tasa·ventana = lambda. */
export function poissonAtLeastOne(lambda: number): number {
  if (!Number.isFinite(lambda) || lambda <= 0) return 0
  return 1 - Math.exp(-lambda)
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

export function logspace(a: number, b: number, n: number): number[] {
  const la = Math.log(a)
  const lb = Math.log(b)
  return Array.from({ length: n }, (_, i) => Math.exp(la + ((lb - la) * i) / (n - 1)))
}

export function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1))
}

/** Energía liberada en julios (Gutenberg–Richter 1956). */
export function energyJoules(mag: number): number {
  return 10 ** (1.5 * mag + 4.8)
}

/** Equivalente en toneladas de TNT (1 t TNT = 4.184e9 J). */
export function tntTons(mag: number): number {
  return energyJoules(mag) / 4.184e9
}

/** Energía en un texto legible: toneladas, kilotones o megatones de TNT. */
export function fmtEnergy(mag: number): string {
  const t = tntTons(mag)
  if (t < 1000) return `${t.toLocaleString('es-CO', { maximumFractionDigits: 0 })} t TNT`
  if (t < 1e6) return `${(t / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} kt TNT`
  return `${(t / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} Mt TNT`
}

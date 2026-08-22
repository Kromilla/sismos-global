import type { Quake } from '../types'

/**
 * Completitud del catálogo y ajuste de Gutenberg–Richter con periodos desiguales.
 *
 * Un catálogo largo no es homogéneo: de 1610 solo sobreviven los sismos que
 * dejaron daño documentado, mientras que las magnitudes pequeñas solo aparecen
 * desde que hay red instrumental. Dividir todos los eventos entre el lapso total
 * hunde las tasas y hace parecer segura una zona que no lo es.
 *
 * La solución estándar es dar a cada banda de magnitud su propio periodo de
 * observación y estimar b con el método de Weichert (1980), que es la
 * generalización de Aki para periodos desiguales.
 */

export interface CompletenessBand {
  /** Magnitud a partir de la cual aplica esta banda. */
  minMag: number
  /** Año desde el que el catálogo se considera completo para esa magnitud. */
  sinceYear: number
}

/**
 * Tabla por defecto para Latinoamérica. Es una hipótesis razonable, no una
 * medición: `estimateCompleteness` la reemplaza cuando hay datos suficientes.
 */
export const DEFAULT_COMPLETENESS: CompletenessBand[] = [
  { minMag: 7.5, sinceYear: 1900 },
  { minMag: 7.0, sinceYear: 1920 },
  { minMag: 6.5, sinceYear: 1950 },
  { minMag: 6.0, sinceYear: 1965 },
  { minMag: 5.5, sinceYear: 1973 },
  { minMag: 5.0, sinceYear: 1980 },
  { minMag: 4.5, sinceYear: 1990 },
  { minMag: 4.0, sinceYear: 2000 },
]

const BANDS = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5]

/**
 * Estima desde qué año es completo el catálogo para cada banda de magnitud.
 *
 * Método: se compara la tasa por década contra la de las tres últimas décadas.
 * Se retrocede mientras la tasa antigua se mantenga por encima de una fracción
 * de la moderna; en cuanto cae por debajo, el catálogo empezó a perder eventos.
 * Es la idea del análisis de Stepp en su forma más simple.
 */
export function estimateCompleteness(
  quakes: Quake[],
  opts: { ratioFloor?: number; nowYear?: number } = {},
): CompletenessBand[] {
  const ratioFloor = opts.ratioFloor ?? 0.55
  const nowYear = opts.nowYear ?? new Date().getUTCFullYear()
  if (quakes.length < 200) return DEFAULT_COMPLETENESS

  let firstYear = Infinity
  for (const q of quakes) {
    const y = new Date(q.time).getUTCFullYear()
    if (y < firstYear) firstYear = y
  }
  const firstDecade = Math.floor(firstYear / 10) * 10
  const lastDecade = Math.floor(nowYear / 10) * 10

  const out: CompletenessBand[] = []
  for (const minMag of BANDS) {
    const perDecade = new Map<number, number>()
    for (const q of quakes) {
      if (q.mag < minMag) continue
      const d = Math.floor(new Date(q.time).getUTCFullYear() / 10) * 10
      perDecade.set(d, (perDecade.get(d) ?? 0) + 1)
    }

    // Referencia moderna: media de las tres últimas décadas completas.
    const recent = [lastDecade - 30, lastDecade - 20, lastDecade - 10]
      .map((d) => perDecade.get(d) ?? 0)
      .filter((n) => n > 0)
    if (!recent.length) continue
    const reference = recent.reduce((a, b) => a + b, 0) / recent.length
    if (reference < 3) continue

    let since = lastDecade - 30
    for (let d = lastDecade - 30; d >= firstDecade; d -= 10) {
      const n = perDecade.get(d) ?? 0
      if (n < reference * ratioFloor) break
      since = d
    }
    out.push({ minMag, sinceYear: since })
  }

  if (out.length < 3) return DEFAULT_COMPLETENESS
  // El año de completitud nunca puede ser posterior al de una banda mayor.
  out.sort((a, b) => b.minMag - a.minMag)
  for (let i = 1; i < out.length; i++) {
    out[i].sinceYear = Math.max(out[i].sinceYear, out[i - 1].sinceYear)
  }
  return out
}

/** Año desde el que el catálogo es completo para una magnitud dada. */
export function completeSince(mag: number, bands: CompletenessBand[]): number {
  let best = bands[bands.length - 1]?.sinceYear ?? 1990
  for (const band of [...bands].sort((a, b) => a.minMag - b.minMag)) {
    if (mag >= band.minMag) best = band.sinceYear
  }
  return best
}

/** Años de observación efectiva de una magnitud, dentro de la ventana del catálogo. */
export function observationYears(
  mag: number,
  bands: CompletenessBand[],
  catalogStartYear: number,
  catalogEndYear: number,
): number {
  const since = Math.max(completeSince(mag, bands), catalogStartYear)
  return Math.max(catalogEndYear - since, 0.5)
}

export interface WeichertFit {
  /** Pendiente b de Gutenberg–Richter. */
  b: number
  bErr: number
  /** Tasa anual de eventos con M >= mMin. */
  rate: number
  /** Magnitud mínima del ajuste. */
  mMin: number
  /** Eventos usados. */
  n: number
  /** Intercepto equivalente, en eventos por año. */
  aAnnual: number
  bands: CompletenessBand[]
  /** Cuántos años de observación tuvo cada bin, para poder auditarlo. */
  bins: { mag: number; count: number; years: number }[]
}

/**
 * Ajuste de Weichert (1980): máxima verosimilitud de b cuando cada bin de
 * magnitud se observó durante un tiempo distinto. Con periodos iguales
 * converge al estimador clásico de Aki.
 */
export function fitWeichert(
  quakes: Quake[],
  mMin: number,
  bands: CompletenessBand[],
  opts: { dM?: number } = {},
): WeichertFit | null {
  const dM = opts.dM ?? 0.1
  if (!quakes.length) return null

  let tMin = Infinity
  let tMax = -Infinity
  for (const q of quakes) {
    if (q.time < tMin) tMin = q.time
    if (q.time > tMax) tMax = q.time
  }
  const startYear = new Date(tMin).getUTCFullYear()
  const endYear = new Date(tMax).getUTCFullYear()

  const bins = new Map<number, number>()
  for (const q of quakes) {
    if (q.mag < mMin - 1e-9) continue
    const year = new Date(q.time).getUTCFullYear()
    // Solo cuenta si cae dentro del periodo completo de su propia magnitud.
    if (year < completeSince(q.mag, bands)) continue
    const bin = Math.round((q.mag - mMin) / dM) * dM + mMin
    bins.set(bin, (bins.get(bin) ?? 0) + 1)
  }

  const rows = [...bins.entries()]
    .map(([mag, count]) => ({
      mag,
      count,
      years: observationYears(mag, bands, startYear, endYear),
    }))
    .filter((r) => r.years > 0)
    .sort((a, b) => a.mag - b.mag)

  const n = rows.reduce((s, r) => s + r.count, 0)
  if (rows.length < 3 || n < 20) return null

  const magMean = rows.reduce((s, r) => s + r.mag * r.count, 0) / n

  // Punto fijo sobre beta: la media ponderada por exposición debe igualar la observada.
  let beta = Math.LN10
  for (let iter = 0; iter < 200; iter++) {
    let num = 0
    let den = 0
    for (const r of rows) {
      const w = r.years * Math.exp(-beta * r.mag)
      num += w * r.mag
      den += w
    }
    if (den <= 0) return null
    const predicted = num / den
    // Derivada de la media respecto a beta: −varianza ponderada.
    let varNum = 0
    for (const r of rows) {
      const w = r.years * Math.exp(-beta * r.mag)
      varNum += w * (r.mag - predicted) ** 2
    }
    const variance = varNum / den
    if (!(variance > 1e-12)) return null
    // f(beta) = media_predicha − media_observada, y df/dbeta = −varianza,
    // así que Newton avanza sumando: beta + f/varianza.
    const next = beta + (predicted - magMean) / variance
    if (!Number.isFinite(next) || next <= 0) return null
    const converged = Math.abs(next - beta) < 1e-8
    beta = next
    if (converged) break
  }

  const b = beta / Math.LN10
  // Error estándar de Weichert: 1/sqrt(n · varianza ponderada).
  let num = 0
  let den = 0
  for (const r of rows) {
    const w = r.years * Math.exp(-beta * r.mag)
    num += w * r.mag
    den += w
  }
  const predicted = num / den
  let varNum = 0
  for (const r of rows) {
    const w = r.years * Math.exp(-beta * r.mag)
    varNum += w * (r.mag - predicted) ** 2
  }
  const variance = varNum / den
  const bErr = 1 / (Math.sqrt(n * variance) * Math.LN10)

  // Tasa total: N observado dividido por la exposición efectiva del modelo.
  // Con p_i ∝ exp(−β·m_i), el conteo esperado del bin i es ν·t_i·p_i, así que
  // la tasa total ν se despeja como N·Σexp / Σ(t·exp).
  const sumExp = rows.reduce((acc, r) => acc + Math.exp(-beta * r.mag), 0)
  const sumTexp = rows.reduce((acc, r) => acc + r.years * Math.exp(-beta * r.mag), 0)
  const rateAtMmin = sumTexp > 0 ? (n * sumExp) / sumTexp : 0

  return {
    b,
    bErr,
    rate: rateAtMmin,
    mMin,
    n,
    aAnnual: Math.log10(rateAtMmin) + b * mMin,
    bands,
    bins: rows,
  }
}

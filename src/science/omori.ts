import type { Quake } from '../types'
import { DAY_MS, clamp, haversineKm, logspace, poissonAtLeastOne } from './stats'
import { gkRadiusKm } from './declustering'

/** Parámetros genéricos de Reasenberg & Jones para secuencias sin datos propios. */
export const GENERIC_RJ = { a: -1.67, b: 0.91, p: 1.08, c: 0.05 }

export interface OmoriFit {
  /** Productividad. */
  K: number
  /** Tiempo característico en días. */
  c: number
  /** Exponente de decaimiento. */
  p: number
  /** Réplicas usadas en el ajuste. */
  n: number
  /** Días observados desde el evento principal. */
  observedDays: number
  /** Magnitud mínima de las réplicas consideradas. */
  mMin: number
  logL: number
  /** true si no hubo datos suficientes y se usó el modelo genérico. */
  generic: boolean
}

/** Integral de (t+c)^-p entre t1 y t2 (días). */
function omoriIntegral(t1: number, t2: number, c: number, p: number): number {
  if (t2 <= t1) return 0
  if (Math.abs(p - 1) < 1e-6) return Math.log((t2 + c) / (t1 + c))
  return ((t2 + c) ** (1 - p) - (t1 + c) ** (1 - p)) / (1 - p)
}

/**
 * Ajuste de Omori–Utsu n(t) = K (t + c)^-p por máxima verosimilitud sobre el
 * proceso puntual, con K resuelto analíticamente y búsqueda en malla de (p, c).
 */
export function fitOmori(daysAfter: number[], observedDays: number): OmoriFit | null {
  const ts = daysAfter.filter((t) => t > 0 && t <= observedDays).sort((a, b) => a - b)
  const n = ts.length
  if (n < 10) return null

  let best: { p: number; c: number; K: number; logL: number } | null = null
  const cGrid = logspace(0.003, 3, 40)
  for (let p = 0.6; p <= 1.8001; p += 0.02) {
    for (const c of cGrid) {
      const A = omoriIntegral(0, observedDays, c, p)
      if (!(A > 0) || !Number.isFinite(A)) continue
      const K = n / A
      let sumLog = 0
      for (const t of ts) sumLog += Math.log(t + c)
      const logL = n * Math.log(K) - p * sumLog - n
      if (!Number.isFinite(logL)) continue
      if (!best || logL > best.logL) best = { p, c, K, logL }
    }
  }
  if (!best) return null
  return {
    K: best.K,
    c: best.c,
    p: best.p,
    n,
    observedDays,
    mMin: 0,
    logL: best.logL,
    generic: false,
  }
}

/** Número esperado de réplicas (M >= mMin del ajuste) entre t1 y t2 días. */
export function expectedAftershocks(fit: OmoriFit, t1: number, t2: number): number {
  return fit.K * omoriIntegral(t1, t2, fit.c, fit.p)
}

/**
 * Modelo Reasenberg–Jones: tasa de réplicas con M >= m tras un principal Mm.
 * Devuelve el número esperado entre t1 y t2 días.
 */
export function rjExpected(
  mainMag: number,
  m: number,
  t1: number,
  t2: number,
  params = GENERIC_RJ,
): number {
  const productivity = 10 ** (params.a + params.b * (mainMag - m))
  return productivity * omoriIntegral(t1, t2, params.c, params.p)
}

export interface Sequence {
  mainshock: Quake
  aftershocks: Quake[]
  radiusKm: number
  /** Días transcurridos desde el principal hasta el fin del catálogo. */
  elapsedDays: number
  /** Magnitud de la mayor réplica observada. */
  largestAftershock: number | null
  fit: OmoriFit | null
}

/**
 * Detecta secuencias activas: sismos M >= minMain ocurridos en los últimos
 * `lookbackDays`, con sus réplicas dentro de la ventana espacial de G–K.
 */
export function findSequences(
  quakes: Quake[],
  opts: { minMain?: number; lookbackDays?: number; now?: number } = {},
): Sequence[] {
  const minMain = opts.minMain ?? 5.5
  const lookbackDays = opts.lookbackDays ?? 90
  const now = opts.now ?? Date.now()
  const since = now - lookbackDays * DAY_MS

  const candidates = quakes
    .filter((q) => q.mag >= minMain && q.time >= since)
    .sort((a, b) => b.mag - a.mag)

  const used = new Set<string>()
  const out: Sequence[] = []

  for (const main of candidates) {
    if (used.has(main.id)) continue
    const radiusKm = gkRadiusKm(main.mag)
    const aftershocks = quakes.filter(
      (q) =>
        q.time > main.time &&
        q.id !== main.id &&
        q.mag < main.mag &&
        haversineKm(main.lat, main.lon, q.lat, q.lon) <= radiusKm,
    )
    for (const a of aftershocks) used.add(a.id)
    used.add(main.id)

    const elapsedDays = Math.max((now - main.time) / DAY_MS, 0.02)
    const days = aftershocks.map((a) => (a.time - main.time) / DAY_MS)
    const fit = fitOmori(days, elapsedDays)
    if (fit && aftershocks.length) {
      let mMin = Infinity
      for (const a of aftershocks) if (a.mag < mMin) mMin = a.mag
      fit.mMin = mMin
    }
    out.push({
      mainshock: main,
      aftershocks,
      radiusKm,
      elapsedDays,
      largestAftershock: aftershocks.length
        ? aftershocks.reduce((mx, a) => Math.max(mx, a.mag), -Infinity)
        : null,
      fit,
    })
  }

  return out.sort((a, b) => b.mainshock.time - a.mainshock.time)
}

export interface AftershockForecast {
  horizonDays: number
  mag: number
  expected: number
  probability: number
  source: 'secuencia' | 'genérico'
}

/**
 * Pronóstico de réplicas para una secuencia. Usa el ajuste propio cuando hay
 * suficientes réplicas; si no, cae al modelo genérico de Reasenberg–Jones.
 * `bValue` escala el número esperado hacia otras magnitudes vía G–R.
 */
export function forecastAftershocks(
  seq: Sequence,
  horizons: number[],
  mags: number[],
  bValue = 1,
  mc = 4.5,
): AftershockForecast[] {
  const out: AftershockForecast[] = []
  const t1 = seq.elapsedDays
  const useFit = seq.fit !== null && seq.aftershocks.length >= 15

  // Ajuste específico de secuencia: si el modelo genérico ya predijo de más (o
  // de menos) para lo transcurrido, se corrige con lo realmente observado.
  let calibration = 1
  if (!useFit) {
    const observed = seq.aftershocks.filter((a) => a.mag >= mc).length
    const predicted = rjExpected(seq.mainshock.mag, mc, 0, t1)
    calibration = clamp((observed + 0.5) / (predicted + 0.5), 0.1, 10)
  }

  for (const h of horizons) {
    for (const m of mags) {
      let expected: number
      let source: AftershockForecast['source']
      if (useFit && seq.fit) {
        const base = expectedAftershocks(seq.fit, t1, t1 + h)
        // Reescalado en magnitud con Gutenberg–Richter desde mMin del ajuste.
        expected = base * 10 ** (-bValue * (m - seq.fit.mMin))
        source = 'secuencia'
      } else {
        expected = rjExpected(seq.mainshock.mag, m, t1, t1 + h) * calibration
        source = 'genérico'
      }
      expected = clamp(expected, 0, 1e6)
      out.push({ horizonDays: h, mag: m, expected, probability: poissonAtLeastOne(expected), source })
    }
  }
  return out
}

/** Ley de Båth: la mayor réplica suele estar ~1.2 unidades bajo el principal. */
export function bathExpectation(mainMag: number): number {
  return +(mainMag - 1.2).toFixed(1)
}

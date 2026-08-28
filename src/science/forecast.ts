import type { Quake, Region } from '../types'
import { DAY_MS, YEAR_DAYS, clamp, poissonAtLeastOne } from './stats'
import {
  fitGutenbergRichter,
  magnitudeOfCompleteness,
  type GrFit,
} from './gutenbergRichter'
import { decluster, type DeclusterResult } from './declustering'
import {
  estimateCompleteness,
  fitWeichert,
  type CompletenessBand,
  type WeichertFit,
} from './completeness'
import { calibrateEtas, etasForecast, etasRate, type EtasForecastCell, type EtasParams } from './etas'
import { findSequences, type Sequence } from './omori'

export const SHORT_HORIZONS = [1, 7, 30, 90]
export const LONG_HORIZONS_YEARS = [1, 5, 10, 30, 50]
export const FORECAST_MAGS = [4, 5, 6, 7]

export interface PoissonCell {
  years: number
  mag: number
  expected: number
  probability: number
}

export interface RegionForecast {
  region: Region
  quakes: Quake[]
  years: number
  gr: GrFit | null
  /** Ajuste G–R sobre el catálogo desagrupado (tasa de fondo). */
  grBackground: GrFit | null
  /** Periodos de completitud usados para corregir las tasas. */
  bands: CompletenessBand[]
  /** Ajuste de Weichert, cuando el catálogo tiene completitud desigual. */
  weichert: WeichertFit | null
  cluster: DeclusterResult
  etas: EtasParams | null
  /** Tasa actual de eventos M >= Mc por día según ETAS. */
  currentRatePerDay: number
  /** Cociente entre la tasa actual y la de fondo. 1 = normal. */
  rateRatio: number
  shortTerm: EtasForecastCell[]
  longTerm: PoissonCell[]
  sequences: Sequence[]
  maxObserved: Quake | null
  lastEvent: Quake | null
  /** Índice 0–100 de actividad relativa; comparativo, no absoluto. */
  score: number
}

function yearsSpan(quakes: Quake[]): number {
  if (quakes.length < 2) return 0
  let min = Infinity
  let max = -Infinity
  for (const q of quakes) {
    if (q.time < min) min = q.time
    if (q.time > max) max = q.time
  }
  return (max - min) / DAY_MS / YEAR_DAYS
}

/** Tasa anual de M >= m a partir de un ajuste G–R. */
function rateFrom(fit: GrFit, m: number): number {
  return 10 ** (fit.aAnnual - fit.b * m)
}

/**
 * Construye el pronóstico completo de una zona: ajuste G–R, desagrupamiento,
 * ETAS de corto plazo y Poisson de fondo para el largo plazo.
 */
export function buildRegionForecast(
  region: Region,
  quakes: Quake[],
  now = Date.now(),
): RegionForecast | null {
  if (quakes.length < 30) return null

  const years = yearsSpan(quakes)
  const mags = quakes.map((q) => q.mag)
  const mc = magnitudeOfCompleteness(mags)
  const gr = fitGutenbergRichter(quakes, { mc })
  const cluster = decluster(quakes)

  // Fondo: tasas sobre el catálogo desagrupado. Si el catálogo abarca periodos
  // con distinta completitud —lo normal al mezclar registro histórico e
  // instrumental— se usa Weichert (1980) en vez de dividir entre el lapso total.
  const bands = estimateCompleteness(quakes)
  let grBackground: GrFit | null = null
  let weichert: WeichertFit | null = null
  if (gr) {
    const bg = cluster.background.filter((q) => q.mag >= gr.mc)
    const bgYears = Math.max(years, 1 / YEAR_DAYS)
    weichert = fitWeichert(bg, gr.mc, bands)
    if (weichert) {
      grBackground = {
        ...gr,
        b: weichert.b,
        bErr: weichert.bErr,
        n: weichert.n,
        years: bgYears,
        aAnnual: weichert.aAnnual,
        a: weichert.aAnnual + Math.log10(bgYears),
      }
    } else if (bg.length >= 10) {
      grBackground = {
        ...gr,
        n: bg.length,
        years: bgYears,
        aAnnual: Math.log10(bg.length / bgYears) + gr.b * gr.mc,
        a: Math.log10(bg.length) + gr.b * gr.mc,
      }
    }
  }

  let etas: EtasParams | null = null
  let currentRatePerDay = 0
  let rateRatio = 1
  let shortTerm: EtasForecastCell[] = []

  if (gr && grBackground) {
    const bgPerDay = grBackground.n / Math.max(grBackground.years * YEAR_DAYS, 1)
    etas = calibrateEtas(quakes, {
      mc: gr.mc,
      backgroundRatePerDay: bgPerDay,
      branching: cluster.clusteredFraction,
    })
    currentRatePerDay = etasRate(etas, quakes, now)
    rateRatio = etas.mu > 0 ? currentRatePerDay / etas.mu : 1
    shortTerm = etasForecast(etas, quakes, now, SHORT_HORIZONS, FORECAST_MAGS, gr.b)
  }

  const longTerm: PoissonCell[] = []
  if (grBackground) {
    for (const y of LONG_HORIZONS_YEARS) {
      for (const m of FORECAST_MAGS) {
        const expected = rateFrom(grBackground, m) * y
        longTerm.push({ years: y, mag: m, expected, probability: poissonAtLeastOne(expected) })
      }
    }
  }

  const sequences = findSequences(quakes, { minMain: 5.3, lookbackDays: 120, now })

  let maxObserved: Quake | null = null
  let lastEvent: Quake | null = null
  for (const q of quakes) {
    if (!maxObserved || q.mag > maxObserved.mag) maxObserved = q
    if (!lastEvent || q.time > lastEvent.time) lastEvent = q
  }

  // Índice comparativo: 60% tasa de fondo de M>=6, 40% anomalía actual.
  const rate6 = grBackground ? rateFrom(grBackground, 6) : 0
  const longPart = clamp((Math.log10(Math.max(rate6, 1e-5)) + 4) / 4.3, 0, 1)
  const shortPart = clamp(Math.log10(Math.max(rateRatio, 0.1)) / 1.2, 0, 1)
  const score = Math.round(100 * (0.6 * longPart + 0.4 * shortPart))

  return {
    region,
    quakes,
    years,
    gr,
    grBackground,
    bands,
    weichert,
    cluster,
    etas,
    currentRatePerDay,
    rateRatio,
    shortTerm,
    longTerm,
    sequences,
    maxObserved,
    lastEvent,
    score,
  }
}

export interface BacktestRow {
  mag: number
  expected: number
  observed: number
  /** Probabilidad Poisson de observar al menos `observed` si el modelo es correcto. */
  pAtLeastObserved: number
}

/**
 * Validación retrospectiva simple: ajusta G–R con los datos anteriores a
 * `splitTime` y compara la tasa proyectada contra lo que realmente ocurrió
 * después. Es la prueba mínima para saber si el modelo miente.
 */
export function backtest(
  quakes: Quake[],
  splitTime: number,
  mags: number[] = FORECAST_MAGS,
): { rows: BacktestRow[]; trainYears: number; testYears: number } | null {
  const train = quakes.filter((q) => q.time < splitTime)
  const test = quakes.filter((q) => q.time >= splitTime)
  if (train.length < 50 || !test.length) return null

  const fit = fitGutenbergRichter(train)
  if (!fit) return null

  const trainYears = yearsSpan(train)
  let maxTime = -Infinity
  for (const q of test) if (q.time > maxTime) maxTime = q.time
  const testYears = (maxTime - splitTime) / DAY_MS / YEAR_DAYS
  if (testYears <= 0) return null

  const rows = mags.map((m) => {
    const expected = rateFrom(fit, m) * testYears
    const observed = test.filter((q) => q.mag >= m).length
    // P(N >= observed) bajo Poisson(expected)
    let cdf = 0
    let term = Math.exp(-expected)
    for (let k = 0; k < observed; k++) {
      cdf += term
      term *= expected / (k + 1)
    }
    return { mag: m, expected, observed, pAtLeastObserved: clamp(1 - cdf, 0, 1) }
  })

  return { rows, trainYears, testYears }
}

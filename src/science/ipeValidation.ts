import type { Quake } from '../types'
import { DEFAULT_IPE, IPE_MODELS, hypocentralKm, type IpeId } from './intensity'
import { mean, stdev } from './stats'

/**
 * Contraste de la ecuación de intensidad contra intensidad realmente observada.
 *
 * El catálogo del USGS publica dos observaciones por evento cuando existen:
 * `mmi`, la intensidad máxima del ShakeMap instrumental, y `cdi`, la máxima
 * reportada por la población (Did You Feel It?). Ambas se comparan con la
 * intensidad que el modelo predice en el epicentro, donde la distancia
 * hipocentral es simplemente la profundidad.
 *
 * Es una comparación de primer orden —la observación máxima no siempre cae
 * justo sobre el epicentro— pero basta para medir el sesgo sistemático de un
 * modelo en una región, que es la pregunta que importa aquí.
 */

export type ObservationKind = 'mmi' | 'cdi'

export interface Residual {
  quake: Quake
  observed: number
  predicted: number
  /** Observado menos predicho: positivo = el modelo se queda corto. */
  residual: number
}

export interface IpeScore {
  ipe: IpeId
  name: string
  n: number
  /** Sesgo medio en unidades de MMI. */
  bias: number
  /** Dispersión de los residuales. */
  scatter: number
  /** Error cuadrático medio. */
  rmse: number
  /** Proporción de eventos dentro de ±1 grado de intensidad. */
  within1: number
  residuals: Residual[]
}

/**
 * Profundidad máxima admitida en la validación. La IPE está formulada para
 * corteza somera: comparar contra un sismo de slab a 600 km mide el error del
 * modelo fuera de su dominio, no dentro, y contaminaría la corrección de sesgo.
 */
export const MAX_VALIDATION_DEPTH_KM = 70

/** Eventos con intensidad observada utilizable para validar el modelo. */
export function withObservations(quakes: Quake[], kind: ObservationKind): Quake[] {
  return quakes.filter((q) => {
    const v = kind === 'mmi' ? q.mmi : q.cdi
    if (q.depth > MAX_VALIDATION_DEPTH_KM) return false
    // Los reportes ciudadanos con muy pocas respuestas son ruido.
    if (kind === 'cdi' && (q.felt ?? 0) < 5) return false
    return v != null && v >= 2 && Number.isFinite(v)
  })
}

/** Puntúa una IPE contra las observaciones disponibles. */
export function scoreIpe(
  quakes: Quake[],
  ipeId: IpeId = DEFAULT_IPE,
  kind: ObservationKind = 'mmi',
): IpeScore | null {
  const ipe = IPE_MODELS[ipeId]
  const sample = withObservations(quakes, kind)
  if (sample.length < 5) return null

  const residuals: Residual[] = sample.map((q) => {
    const observed = (kind === 'mmi' ? q.mmi : q.cdi) as number
    // En el epicentro la distancia hipocentral es la profundidad focal.
    const predicted = ipe.mmi(q.mag, hypocentralKm(0, q.depth))
    return { quake: q, observed, predicted, residual: observed - predicted }
  })

  const diffs = residuals.map((r) => r.residual)
  const bias = mean(diffs)
  const rmse = Math.sqrt(mean(diffs.map((d) => d * d)))
  const within1 = residuals.filter((r) => Math.abs(r.residual) <= 1).length / residuals.length

  return {
    ipe: ipeId,
    name: ipe.name,
    n: residuals.length,
    bias,
    scatter: stdev(diffs),
    rmse,
    within1,
    residuals: residuals.sort((a, b) => b.quake.mag - a.quake.mag),
  }
}

/** Compara todas las IPE disponibles sobre el mismo conjunto de observaciones. */
export function compareIpes(quakes: Quake[], kind: ObservationKind = 'mmi'): IpeScore[] {
  return (Object.keys(IPE_MODELS) as IpeId[])
    .map((id) => scoreIpe(quakes, id, kind))
    .filter((s): s is IpeScore => s !== null)
    .sort((a, b) => a.rmse - b.rmse)
}

export interface ResidualByDistanceBin {
  /** Límite inferior del bin de magnitud. */
  magBin: number
  n: number
  bias: number
}

/**
 * Sesgo desglosado por magnitud: revela si el modelo falla solo en los
 * extremos —lo habitual— o de forma pareja.
 */
export function biasByMagnitude(score: IpeScore, step = 0.5): ResidualByDistanceBin[] {
  const bins = new Map<number, number[]>()
  for (const r of score.residuals) {
    const bin = Math.floor(r.quake.mag / step) * step
    const list = bins.get(bin) ?? []
    list.push(r.residual)
    bins.set(bin, list)
  }
  return [...bins.entries()]
    .map(([magBin, diffs]) => ({ magBin, n: diffs.length, bias: mean(diffs) }))
    .filter((b) => b.n >= 3)
    .sort((a, b) => a.magBin - b.magBin)
}

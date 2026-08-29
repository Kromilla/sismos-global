import type { CatalogQuery, Quake } from '../types'
import { CITIES } from './cities'
import { cacheKey, readCache, writeCache } from './cache'
import { haversineKm } from '../science/stats'

/**
 * Catálogo integrado del Servicio Geológico Colombiano.
 *
 * Se sirve como capa ArcGIS abierta (sin token) y cubre desde 1610 hasta 2020
 * con magnitud mínima 3.5, así que aporta cuatro siglos de historia que el
 * catálogo del USGS no tiene. Dos rarezas del servicio marcan el diseño de
 * este módulo:
 *
 *  1. El `FeatureServer` falla al pedir atributos; hay que usar el `MapServer`.
 *  2. No admite paginación (`resultOffset` devuelve error) y corta en 1000
 *     registros, así que las ventanas grandes se parten por tiempo.
 */
const SGC_LAYER =
  'https://srvags.sgc.gov.co/arcgis/rest/services/catalogo_sismos/catalogo_de_sismos_2/MapServer/0'

/** Tope de registros por respuesta del servicio. */
const PAGE_LIMIT = 1000

/** Magnitud mínima que contiene el catálogo. */
export const SGC_MIN_MAG = 3.5

/**
 * El campo de fecha del SGC guarda hora local de Colombia (UTC−5) dentro de un
 * epoch que aparenta ser UTC: sus marcas van cinco horas por delante de las del
 * USGS para el mismo sismo. Verificado contra Pedernales 2016 y Loreto 2019.
 */
const SGC_UTC_SHIFT_MS = 5 * 3600_000

/**
 * Inicio de la cobertura del catálogo integrado. El final no se fija: se deja
 * que el servicio devuelva lo que tenga, para no descartar en silencio los años
 * que el SGC vaya publicando.
 */
export const SGC_COVERAGE_START = Date.UTC(1610, 0, 1)

interface SgcAttributes {
  ESP_MAGNITUD: number | null
  ESP_PROFUNDIDAD: number | null
  ESP_LATITUD: number | null
  ESP_LONGITUD: number | null
  ESP_FECHA_TXT: string | null
  ESP_FUENTE_MAGNITUD: string | null
  ESP_ID_EVENTO_TXT: number | null
}

function buildUrl(params: Record<string, string>): string {
  const p = new URLSearchParams({ f: 'json', returnGeometry: 'false', ...params })
  return `${SGC_LAYER}/query?${p.toString()}`
}

/** Cláusula WHERE de una ventana: tiempo, magnitud y recuadro geográfico. */
function whereFor(q: CatalogQuery, from: number, to: number): string {
  const b = q.bbox
  // Las ventanas se traducen a la hora local en que el servicio las almacena.
  return [
    `ESP_FECHA_LONG >= ${Math.round(from + SGC_UTC_SHIFT_MS)}`,
    `ESP_FECHA_LONG < ${Math.round(to + SGC_UTC_SHIFT_MS)}`,
    `ESP_MAGNITUD >= ${q.minMag}`,
    `ESP_LATITUD >= ${b.minLat}`,
    `ESP_LATITUD <= ${b.maxLat}`,
    `ESP_LONGITUD >= ${b.minLon}`,
    `ESP_LONGITUD <= ${b.maxLon}`,
  ].join(' AND ')
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`SGC respondió ${res.status} ${res.statusText}`)
  const data = (await res.json()) as Record<string, unknown>
  const err = data.error as { message?: string; details?: string[] } | undefined
  if (err) throw new Error(`SGC: ${err.message ?? 'consulta rechazada'}`)
  return data
}

async function countWindow(
  q: CatalogQuery,
  from: number,
  to: number,
  signal?: AbortSignal,
): Promise<number> {
  const data = await fetchJson(
    buildUrl({ where: whereFor(q, from, to), returnCountOnly: 'true' }),
    signal,
  )
  return Number(data.count ?? 0)
}

/** El catálogo no trae topónimo: se nombra por la ciudad conocida más cercana. */
function placeFor(lat: number, lon: number): string {
  let best: { name: string; dist: number } | null = null
  for (const c of CITIES) {
    const dist = haversineKm(lat, lon, c.lat, c.lon)
    if (!best || dist < best.dist) best = { name: c.name, dist }
  }
  if (!best) return 'Colombia'
  if (best.dist < 12) return best.name
  return `a ${best.dist.toFixed(0)} km de ${best.name}`
}

function toQuake(a: SgcAttributes): Quake | null {
  const mag = a.ESP_MAGNITUD
  const lat = a.ESP_LATITUD
  const lon = a.ESP_LONGITUD
  const stored = a.ESP_FECHA_TXT != null ? Number(a.ESP_FECHA_TXT) : NaN
  if (mag == null || lat == null || lon == null || !Number.isFinite(stored)) return null
  const time = stored - SGC_UTC_SHIFT_MS
  return {
    id: `sgc:${a.ESP_ID_EVENTO_TXT ?? `${time}:${lat}:${lon}`}`,
    time,
    lat,
    lon,
    depth: a.ESP_PROFUNDIDAD ?? 0,
    mag,
    magType: a.ESP_FUENTE_MAGNITUD ?? 'SGC',
    place: placeFor(lat, lon),
    tsunami: false,
    source: 'SGC',
    url: 'https://bdrsnc.sgc.gov.co/paginas1/catalogo/index.php',
  }
}

async function fetchWindow(
  q: CatalogQuery,
  from: number,
  to: number,
  signal?: AbortSignal,
): Promise<Quake[]> {
  const data = await fetchJson(
    buildUrl({
      where: whereFor(q, from, to),
      outFields:
        'ESP_ID_EVENTO_TXT,ESP_MAGNITUD,ESP_PROFUNDIDAD,ESP_LATITUD,ESP_LONGITUD,ESP_FECHA_TXT,ESP_FUENTE_MAGNITUD',
    }),
    signal,
  )
  const features = (data.features ?? []) as { attributes: SgcAttributes }[]
  return features.map((f) => toQuake(f.attributes)).filter((x): x is Quake => x !== null)
}

export interface SgcResult {
  quakes: Quake[]
  /** Ventanas que el servicio recortó por superar su tope de 1000 registros. */
  truncatedWindows: number
}

/**
 * Descarga el catálogo del SGC para la consulta dada, partiendo por tiempo
 * cada ventana que supere el tope de registros del servicio.
 */
export async function fetchSgcCatalog(
  query: CatalogQuery,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<SgcResult> {
  const q: CatalogQuery = { ...query, minMag: Math.max(query.minMag, SGC_MIN_MAG) }
  const start = Math.max(q.startTime, SGC_COVERAGE_START)
  const end = q.endTime
  if (end <= start) return { quakes: [], truncatedWindows: 0 }

  const total = await countWindow(q, start, end, signal)
  if (total === 0) return { quakes: [], truncatedWindows: 0 }

  const out: Quake[] = []
  let truncatedWindows = 0
  const stack: Array<[number, number]> = [[start, end]]

  while (stack.length) {
    const [from, to] = stack.pop()!
    const n = out.length === 0 && stack.length === 0 ? total : await countWindow(q, from, to, signal)
    if (n === 0) continue
    if (n > PAGE_LIMIT && to - from > 86_400_000) {
      const mid = Math.floor((from + to) / 2)
      stack.push([mid, to], [from, mid])
      continue
    }
    const chunk = await fetchWindow(q, from, to, signal)
    // Ventana de un día que topa el límite: el servicio recortó y no hay forma
    // de partirla más, así que al menos queda constancia.
    if (chunk.length >= PAGE_LIMIT) truncatedWindows++
    out.push(...chunk)
    onProgress?.(out.length, total)
  }

  const seen = new Set<string>()
  const quakes = out
    .filter((k) => (seen.has(k.id) ? false : (seen.add(k.id), true)))
    .sort((a, b) => b.time - a.time)
  return { quakes, truncatedWindows }
}

/**
 * Funde dos catálogos (primario y secundario). Ante eventos duplicados —el mismo
 * sismo reportado por las dos redes dentro de la tolerancia de tiempo, distancia y magnitud—
 * se conserva el del catálogo primario.
 */
export function mergeCatalogs(primary: Quake[], secondary: Quake[]): Quake[] {
  const TIME_TOL_MS = 90_000
  const DIST_TOL_KM = 120
  const MAG_TOL = 1.2

  const byTime = [...primary].sort((a, b) => a.time - b.time)
  const lowerBound = (t: number): number => {
    let lo = 0
    let hi = byTime.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (byTime[mid].time < t) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  const extra: Quake[] = []
  for (const s of secondary) {
    let duplicated = false
    for (let i = lowerBound(s.time - TIME_TOL_MS); i < byTime.length; i++) {
      const u = byTime[i]
      if (u.time > s.time + TIME_TOL_MS) break
      if (Math.abs(u.mag - s.mag) > MAG_TOL) continue
      if (haversineKm(u.lat, u.lon, s.lat, s.lon) > DIST_TOL_KM) continue
      duplicated = true
      break
    }
    if (!duplicated) extra.push(s)
  }

  return [...primary, ...extra].sort((a, b) => b.time - a.time)
}

/** Descarga el catálogo del SGC con caché en localStorage. */
export async function loadSgcCatalog(
  query: CatalogQuery,
  ttlMs: number,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ quakes: Quake[]; fromCache: boolean; truncatedWindows: number }> {
  const key = cacheKey(query, ttlMs, 'SGC')
  const hit = await readCache(key)
  if (hit) return { quakes: hit, fromCache: true, truncatedWindows: 0 }
  const { quakes, truncatedWindows } = await fetchSgcCatalog(query, signal, onProgress)
  await writeCache(key, quakes)
  return { quakes, fromCache: false, truncatedWindows }
}

import type { Bbox, CatalogQuery, Quake } from '../types'
import { cacheKey, readCache, writeCache } from './cache'

const FDSN = 'https://earthquake.usgs.gov/fdsnws/event/1'
/** Tope duro del servicio USGS por consulta. */
const USGS_MAX = 20000

interface UsgsFeature {
  id: string
  properties: {
    time: number
    mag: number | null
    magType: string | null
    place: string | null
    tsunami: number
    url: string
    cdi: number | null
    mmi: number | null
    felt: number | null
  }
  geometry: { coordinates: [number, number, number] } | null
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19)
}

function queryString(q: CatalogQuery, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({
    format: 'geojson',
    starttime: iso(q.startTime),
    endtime: iso(q.endTime),
    minmagnitude: String(q.minMag),
    minlatitude: String(q.bbox.minLat),
    maxlatitude: String(q.bbox.maxLat),
    minlongitude: String(q.bbox.minLon),
    maxlongitude: String(q.bbox.maxLon),
    orderby: 'time',
    ...extra,
  })
  return p.toString()
}

function toQuake(f: UsgsFeature): Quake | null {
  const c = f.geometry?.coordinates
  const mag = f.properties.mag
  if (!c || mag == null || !Number.isFinite(mag)) return null
  return {
    id: f.id,
    time: f.properties.time,
    lat: c[1],
    lon: c[0],
    depth: Number.isFinite(c[2]) ? c[2] : 0,
    mag,
    magType: f.properties.magType ?? '—',
    place: f.properties.place ?? 'Sin localidad',
    tsunami: f.properties.tsunami === 1,
    url: f.properties.url,
    source: 'USGS',
    // Intensidad realmente observada: sirve para contrastar la IPE.
    cdi: f.properties.cdi ?? undefined,
    mmi: f.properties.mmi ?? undefined,
    felt: f.properties.felt ?? undefined,
  }
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`USGS respondió ${res.status} ${res.statusText}`)
  return res.json()
}

export async function countEvents(q: CatalogQuery, signal?: AbortSignal): Promise<number> {
  const data = (await fetchJson(`${FDSN}/count?${queryString(q)}`, signal)) as { count: number }
  return data.count ?? 0
}

async function fetchWindow(q: CatalogQuery, signal?: AbortSignal): Promise<Quake[]> {
  const data = (await fetchJson(
    `${FDSN}/query?${queryString(q, { limit: String(USGS_MAX) })}`,
    signal,
  )) as { features: UsgsFeature[] }
  return data.features.map(toQuake).filter((x): x is Quake => x !== null)
}

/**
 * Descarga un catálogo. Si la ventana supera el tope del servicio la parte en
 * dos por la mitad temporal, recursivamente, y concatena.
 */
export async function fetchCatalog(
  q: CatalogQuery,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Quake[]> {
  const total = await countEvents(q, signal)
  if (total === 0) return []

  const out: Quake[] = []
  const stack: CatalogQuery[] = [q]

  while (stack.length) {
    const win = stack.pop()!
    const chunk = await fetchWindow(win, signal)
    // El servicio trunca en USGS_MAX: si topamos, partimos la ventana en dos.
    if (chunk.length >= USGS_MAX && win.endTime - win.startTime > 86_400_000) {
      const mid = Math.floor((win.startTime + win.endTime) / 2)
      stack.push({ ...win, startTime: mid + 1 }, { ...win, endTime: mid })
      continue
    }
    out.push(...chunk)
    onProgress?.(out.length, Math.max(total, out.length))
  }

  const seen = new Set<string>()
  return out
    .filter((k) => (seen.has(k.id) ? false : (seen.add(k.id), true)))
    .sort((a, b) => b.time - a.time)
}

/** Descarga con caché en localStorage. `ttlMs` define el bucket de frescura. */
export async function loadCatalog(
  q: CatalogQuery,
  ttlMs: number,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ quakes: Quake[]; fromCache: boolean }> {
  const key = cacheKey(q, ttlMs)
  const hit = await readCache(key)
  if (hit) return { quakes: hit, fromCache: true }
  const quakes = await fetchCatalog(q, signal, onProgress)
  await writeCache(key, quakes)
  return { quakes, fromCache: false }
}

export function bboxOf(quakes: Quake[]): Bbox | null {
  if (!quakes.length) return null
  let minLat = 90,
    maxLat = -90,
    minLon = 180,
    maxLon = -180
  for (const k of quakes) {
    if (k.lat < minLat) minLat = k.lat
    if (k.lat > maxLat) maxLat = k.lat
    if (k.lon < minLon) minLon = k.lon
    if (k.lon > maxLon) maxLon = k.lon
  }
  return { minLat, maxLat, minLon, maxLon }
}

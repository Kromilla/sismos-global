/**
 * Compatibilidad: este módulo re-exporta el cliente FDSN configurado para USGS.
 * El código nuevo debe usar directamente `src/data/fdsn.ts`.
 */
import type { Bbox, CatalogQuery, Quake } from '../types'
import { fetchFdsnCatalog, loadFdsnCatalog, FDSN_NETWORKS } from './fdsn'

const USGS = FDSN_NETWORKS.USGS

export async function countEvents(q: CatalogQuery, signal?: AbortSignal): Promise<number> {
  const res = await fetch(
    `${USGS.baseUrl}/count?format=geojson&starttime=${new Date(q.startTime).toISOString().slice(0, 19)}&endtime=${new Date(q.endTime).toISOString().slice(0, 19)}&minmagnitude=${q.minMag}&minlatitude=${q.bbox.minLat}&maxlatitude=${q.bbox.maxLat}&minlongitude=${q.bbox.minLon}&maxlongitude=${q.bbox.maxLon}`,
    { signal },
  )
  if (!res.ok) throw new Error(`USGS respondió ${res.status}`)
  const data = (await res.json()) as { count: number }
  return data.count ?? 0
}

export async function fetchCatalog(
  q: CatalogQuery,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Quake[]> {
  return fetchFdsnCatalog(USGS, q, signal, onProgress)
}

export async function loadCatalog(
  q: CatalogQuery,
  ttlMs: number,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ quakes: Quake[]; fromCache: boolean }> {
  return loadFdsnCatalog(USGS, q, ttlMs, signal, onProgress)
}

export function bboxOf(quakes: Quake[]): Bbox | null {
  if (!quakes.length) return null
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180
  for (const k of quakes) {
    if (k.lat < minLat) minLat = k.lat
    if (k.lat > maxLat) maxLat = k.lat
    if (k.lon < minLon) minLon = k.lon
    if (k.lon > maxLon) maxLon = k.lon
  }
  return { minLat, maxLat, minLon, maxLon }
}

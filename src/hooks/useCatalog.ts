import { useCallback, useEffect, useRef, useState } from 'react'
import type { CatalogQuery, CatalogSource, Quake } from '../types'
import { loadFdsnCatalog, FDSN_NETWORKS } from '../data/fdsn'
import { clearCache } from '../data/cache'
import { loadSgcCatalog, mergeCatalogs } from '../data/sgc'

export interface CatalogState {
  quakes: Quake[]
  loading: boolean
  error: string | null
  /** Eventos descargados hasta ahora / total esperado. */
  progress: { loaded: number; total: number } | null
  fromCache: boolean
  /** Cuántos eventos aportó cada red tras fundir los catálogos. */
  counts: Record<string, number>
  /** Fuentes que fallaron sin impedir que el resto se cargara. */
  degraded: string[]
  /** Avisos de calidad del dato. */
  warnings: string[]
  reload: (force?: boolean) => void
}

/**
 * Descompone un CatalogSource compuesto (e.g. 'USGS+EMSC') en las partes
 * que lo forman, para saber qué redes hay que consultar.
 */
function parseSources(source: CatalogSource): string[] {
  if (source === 'ambos') return ['USGS', 'SGC']
  return source.split('+')
}

const EMPTY_FDSN = { quakes: [] as Quake[], fromCache: true }
const EMPTY_SGC = { quakes: [] as Quake[], fromCache: true, truncatedWindows: 0 }

/**
 * Carga un catálogo con caché en IndexedDB y cancelación segura.
 *
 * `source` elige la red o combinación de redes:
 *  - Redes FDSN: USGS, EMSC, GEONET, GA, INGV (protocolo estándar)
 *  - SGC: catálogo colombiano vía ArcGIS, desde 1610
 *  - Combinaciones: 'ambos' (USGS+SGC), 'USGS+EMSC', 'USGS+GEONET', etc.
 */
export function useCatalog(
  query: CatalogQuery,
  ttlMs: number,
  source: CatalogSource = 'USGS',
): CatalogState {
  const [quakes, setQuakes] = useState<Quake[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [degraded, setDegraded] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [nonce, setNonce] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const key = `${source}|${query.startTime}|${query.endTime}|${query.minMag}|${query.bbox.minLat},${query.bbox.maxLat},${query.bbox.minLon},${query.bbox.maxLon}`

  useEffect(() => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    let alive = true

    setLoading(true)
    setError(null)
    setProgress(null)
    setDegraded([])
    setWarnings([])

    const parts = parseSources(source)
    const wantsSgc = parts.includes('SGC')
    const fdsnParts = parts.filter((p) => p !== 'SGC')

    const onProgress = (loaded: number, total: number) => {
      if (alive) setProgress({ loaded, total })
    }

    // Lanza todas las redes en paralelo con allSettled: si una falla, el resto sigue.
    const fdsnPromises = fdsnParts.map((netId) => {
      const net = FDSN_NETWORKS[netId]
      if (!net) return Promise.resolve(EMPTY_FDSN)
      return loadFdsnCatalog(net, query, ttlMs, ac.signal, onProgress).catch(() => EMPTY_FDSN)
    })

    const sgcPromise = wantsSgc
      ? loadSgcCatalog(query, ttlMs, ac.signal, onProgress)
      : Promise.resolve(EMPTY_SGC)

    Promise.allSettled([Promise.all(fdsnPromises), sgcPromise]).then(([fdsnRes, sgcRes]) => {
      if (!alive || ac.signal.aborted) return

      const failures: string[] = []

      const fdsnResults =
        fdsnRes.status === 'fulfilled'
          ? fdsnRes.value
          : (failures.push(...fdsnParts), fdsnParts.map(() => EMPTY_FDSN))

      const sgcResult =
        sgcRes.status === 'fulfilled' ? sgcRes.value : (failures.push('SGC'), EMPTY_SGC)

      const totalExpected =
        fdsnParts.length + (wantsSgc ? 1 : 0)
      if (failures.length === totalExpected) {
        setError('No se pudo consultar ningún catálogo')
        setLoading(false)
        return
      }

      // Fusionar todos los catálogos FDSN en uno solo, deduplicando por ID.
      let merged: Quake[] = []
      const seen = new Set<string>()
      const newCounts: Record<string, number> = {}

      for (let i = 0; i < fdsnResults.length; i++) {
        const netId = fdsnParts[i]
        const result = fdsnResults[i]
        let added = 0
        for (const q of result.quakes) {
          if (!seen.has(q.id)) {
            seen.add(q.id)
            merged.push(q)
            added++
          }
        }
        newCounts[netId] = added
      }

      // Si hay SGC, fundir con la lógica de deduplicación espacio-temporal.
      if (wantsSgc && sgcResult.quakes.length > 0) {
        merged = mergeCatalogs(merged, sgcResult.quakes)
        newCounts['SGC'] = sgcResult.quakes.length
      }

      merged.sort((a, b) => b.time - a.time)

      setQuakes(merged)
      setCounts(newCounts)
      setFromCache(fdsnResults.every((r) => r.fromCache) && sgcResult.fromCache)
      setDegraded(failures)

      const warns: string[] = []
      if (sgcResult.truncatedWindows > 0) {
        warns.push(
          `El SGC recortó ${sgcResult.truncatedWindows} ventana(s) por su tope de 1000 registros: faltan réplicas de los días más activos.`,
        )
      }
      setWarnings(warns)
      setLoading(false)
    })

    return () => {
      alive = false
      ac.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ttlMs, nonce])

  const reload = useCallback((force = false) => {
    if (!force) {
      setNonce((n) => n + 1)
      return
    }
    void clearCache().then(() => setNonce((n) => n + 1))
  }, [])

  return { quakes, loading, error, progress, fromCache, counts, degraded, warnings, reload }
}

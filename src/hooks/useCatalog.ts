import { useCallback, useEffect, useRef, useState } from 'react'
import type { CatalogQuery, CatalogSource, Quake } from '../types'
import { loadCatalog } from '../data/usgs'
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
  counts: { usgs: number; sgc: number }
  /** Fuentes que fallaron sin impedir que el resto se cargara. */
  degraded: string[]
  /** Avisos de calidad del dato, como ventanas recortadas por el servicio. */
  warnings: string[]
  reload: (force?: boolean) => void
}

/**
 * Carga un catálogo con caché en localStorage y cancelación segura.
 *
 * `source` elige la red: el USGS cubre toda Latinoamérica desde 1900 con buena
 * homogeneidad, el SGC aporta cuatro siglos de historia en Colombia, y
 * combinarlos da lo mejor de ambos quitando los duplicados.
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
  const [counts, setCounts] = useState({ usgs: 0, sgc: 0 })
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

    const wantsUsgs = source === 'USGS' || source === 'ambos'
    const wantsSgc = source === 'SGC' || source === 'ambos'
    const onProgress = (loaded: number, total: number) => {
      if (alive) setProgress({ loaded, total })
    }

    const empty = { quakes: [] as Quake[], fromCache: true, truncatedWindows: 0 }

    // allSettled y no all: si una red falla, la otra sigue sirviendo la app.
    Promise.allSettled([
      wantsUsgs ? loadCatalog(query, ttlMs, ac.signal, onProgress) : Promise.resolve(empty),
      wantsSgc ? loadSgcCatalog(query, ttlMs, ac.signal, onProgress) : Promise.resolve(empty),
    ])
      .then(([usgsRes, sgcRes]) => {
        if (!alive || ac.signal.aborted) return
        const failures: string[] = []
        const usgs = usgsRes.status === 'fulfilled' ? usgsRes.value : (failures.push('USGS'), empty)
        const sgc = sgcRes.status === 'fulfilled' ? sgcRes.value : (failures.push('SGC'), empty)

        if (failures.length === (wantsUsgs ? 1 : 0) + (wantsSgc ? 1 : 0)) {
          const reason = [usgsRes, sgcRes].find((r) => r.status === 'rejected')
          const err = reason && 'reason' in reason ? reason.reason : null
          setError(err instanceof Error ? err.message : 'No se pudo consultar ningún catálogo')
          setLoading(false)
          return
        }

        setQuakes(wantsSgc ? mergeCatalogs(usgs.quakes, sgc.quakes) : usgs.quakes)
        setCounts({ usgs: usgs.quakes.length, sgc: sgc.quakes.length })
        setFromCache(usgs.fromCache && sgc.fromCache)
        setDegraded(failures)
        setWarnings(
          sgc.truncatedWindows > 0
            ? [
                `El SGC recortó ${sgc.truncatedWindows} ventana(s) por su tope de 1000 registros: faltan réplicas de los días más activos.`,
              ]
            : [],
        )
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
    // Se vacía la caché antes de relanzar, o la recarga volvería a leerla.
    void clearCache().then(() => setNonce((n) => n + 1))
  }, [])

  return { quakes, loading, error, progress, fromCache, counts, degraded, warnings, reload }
}

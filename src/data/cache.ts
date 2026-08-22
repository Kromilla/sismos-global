import type { CatalogQuery, Quake, QuakeTuple } from '../types'

/**
 * Caché de catálogos en IndexedDB.
 *
 * Antes vivía en localStorage, que corta en unos 5 MB: suficiente para los
 * 32.000 eventos de Latinoamérica, imposible para los 62.000 de un catálogo
 * global. IndexedDB admite cientos de megas y guarda estructuras nativas, así
 * que además se ahorra un JSON.parse de varios megabytes en cada carga.
 *
 * Los eventos se guardan como tuplas: un catálogo de 60.000 sismos ronda los
 * 6 MB en este formato, frente a unos 24 MB en objetos con nombres de campo.
 */
const DB_NAME = 'sismos'
const DB_VERSION = 1
const STORE = 'catalogs'

let dbPromise: Promise<IDBDatabase | null> | null = null

/**
 * Tiempo máximo de espera para abrir la base. Si otra pestaña tiene una versión
 * distinta abierta, o hay un borrado en cola, la petición de apertura puede no
 * emitir nunca ningún evento. Sin este tope la app se quedaría colgada por una
 * caché, que es justo la pieza de la que puede prescindir.
 */
const OPEN_TIMEOUT_MS = 3000

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    let settled = false
    const done = (db: IDBDatabase | null) => {
      if (settled) return
      settled = true
      resolve(db)
    }
    const timer = setTimeout(() => done(null), OPEN_TIMEOUT_MS)
    const finish = (db: IDBDatabase | null) => {
      clearTimeout(timer)
      done(db)
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' })
    }
    req.onsuccess = () => {
      const db = req.result
      // Si otra pestaña pide una versión nueva, se suelta la conexión en vez de
      // bloquearla: quedarse agarrado cuelga a la otra pestaña.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      finish(db)
    }
    // Sin caché la app sigue funcionando contra la red: no vale la pena romper.
    req.onerror = () => finish(null)
    req.onblocked = () => finish(null)
  })
  return dbPromise
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null)
          return
        }
        let request: IDBRequest<T>
        try {
          request = run(db.transaction(STORE, mode).objectStore(STORE))
        } catch {
          resolve(null)
          return
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(null)
      }),
  )
}

interface CacheEntry {
  key: string
  /** Momento de escritura: permite expulsar primero lo más viejo. */
  t: number
  rows: QuakeTuple[]
}

function encode(quakes: Quake[]): QuakeTuple[] {
  return quakes.map((k) => [
    k.id,
    k.time,
    Math.round(k.lat * 1e4) / 1e4,
    Math.round(k.lon * 1e4) / 1e4,
    Math.round(k.depth * 10) / 10,
    Math.round(k.mag * 100) / 100,
    k.magType,
    k.place,
    k.tsunami ? 1 : 0,
    k.source,
    k.cdi ?? null,
    k.mmi ?? null,
    k.felt ?? null,
  ])
}

function decode(rows: QuakeTuple[]): Quake[] {
  return rows.map((r) => ({
    id: r[0],
    time: r[1],
    lat: r[2],
    lon: r[3],
    depth: r[4],
    mag: r[5],
    magType: r[6],
    place: r[7],
    tsunami: r[8] === 1,
    source: r[9] ?? 'USGS',
    cdi: r[10] ?? undefined,
    mmi: r[11] ?? undefined,
    felt: r[12] ?? undefined,
    url:
      (r[9] ?? 'USGS') === 'SGC'
        ? 'https://bdrsnc.sgc.gov.co/paginas1/catalogo/index.php'
        : `https://earthquake.usgs.gov/earthquakes/eventpage/${r[0]}`,
  }))
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19)
}

export function cacheKey(q: CatalogQuery, bucketMs: number, source = 'USGS'): string {
  const bucket = Math.floor(q.endTime / bucketMs)
  const b = q.bbox
  return `${source}|${b.minLat},${b.maxLat},${b.minLon},${b.maxLon}|${q.minMag}|${iso(
    q.startTime,
  ).slice(0, 10)}|${bucket}`
}

export async function readCache(key: string): Promise<Quake[] | null> {
  const entry = await tx<CacheEntry>('readonly', (store) => store.get(key) as IDBRequest<CacheEntry>)
  if (!entry || !Array.isArray(entry.rows)) return null
  return decode(entry.rows)
}

/** Claves guardadas, de la más vieja a la más reciente. */
async function keysByAge(exceptKey: string): Promise<string[]> {
  const all = await tx<CacheEntry[]>(
    'readonly',
    (store) => store.getAll() as IDBRequest<CacheEntry[]>,
  )
  if (!all) return []
  return all
    .filter((e) => e.key !== exceptKey)
    .sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
    .map((e) => e.key)
}

export async function writeCache(key: string, quakes: Quake[]): Promise<void> {
  const entry: CacheEntry = { key, t: Date.now(), rows: encode(quakes) }
  if ((await tx('readwrite', (store) => store.put(entry))) !== null) return

  // Cuota agotada: se expulsa de lo más viejo a lo más nuevo, y solo lo justo,
  // para que el catálogo de la otra red recién descargado sobreviva.
  for (const victim of await keysByAge(key)) {
    await tx('readwrite', (store) => store.delete(victim))
    if ((await tx('readwrite', (store) => store.put(entry))) !== null) return
  }
}

export async function clearCache(): Promise<void> {
  await tx('readwrite', (store) => store.clear())
  // Restos de la época en que la caché vivía en localStorage.
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('sismoslatam:')) localStorage.removeItem(k)
  }
}

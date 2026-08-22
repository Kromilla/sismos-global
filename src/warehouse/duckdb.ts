import * as duckdb from '@duckdb/duckdb-wasm'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import type { Quake } from '../types'
import { ALL_REGIONS, inBbox } from '../data/regions'
import type { QuakeRole } from '../science/declustering'
import { energyJoules } from '../science/stats'

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
}

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null

async function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const bundle = await duckdb.selectBundle(BUNDLES)
      const worker = new Worker(bundle.mainWorker!, { type: 'module' })
      const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker ?? undefined)
      return db
    })()
  }
  return dbPromise
}

export type Row = Record<string, unknown>

/** Convierte el resultado Arrow en objetos JS planos y serializables. */
function toRows(table: { toArray(): unknown[] }): Row[] {
  return table.toArray().map((r) => {
    const obj = (r as { toJSON?: () => Row }).toJSON?.() ?? (r as Row)
    const out: Row = {}
    for (const [k, v] of Object.entries(obj)) {
      out[k] = typeof v === 'bigint' ? Number(v) : v
    }
    return out
  })
}

export interface WarehouseStats {
  facts: number
  zones: number
  fromYear: number
  toYear: number
  sizeMb: number
}

const DDL = `
CREATE TABLE dim_zona (
  zona_id     VARCHAR PRIMARY KEY,
  nombre      VARCHAR,
  pais        VARCHAR,
  min_lat     DOUBLE, max_lat DOUBLE,
  min_lon     DOUBLE, max_lon DOUBLE,
  contexto    VARCHAR
);

CREATE TABLE dim_profundidad (
  profundidad_id VARCHAR PRIMARY KEY,
  etiqueta       VARCHAR,
  desde_km       DOUBLE,
  hasta_km       DOUBLE
);
INSERT INTO dim_profundidad VALUES
  ('superficial', 'Superficial (< 70 km)',   0,   70),
  ('intermedia',  'Intermedia (70-300 km)',  70,  300),
  ('profunda',    'Profunda (> 300 km)',     300, 800);

CREATE TABLE dim_magnitud (
  magnitud_id VARCHAR PRIMARY KEY,
  etiqueta    VARCHAR,
  desde       DOUBLE,
  hasta       DOUBLE
);
INSERT INTO dim_magnitud VALUES
  ('micro',    'Micro (< 3)',        -1, 3),
  ('menor',    'Menor (3-4)',         3, 4),
  ('ligero',   'Ligero (4-5)',        4, 5),
  ('moderado', 'Moderado (5-6)',      5, 6),
  ('fuerte',   'Fuerte (6-7)',        6, 7),
  ('mayor',    'Mayor (7-8)',         7, 8),
  ('grande',   'Grande (>= 8)',       8, 10);
`

const FACT_DDL = `
CREATE TABLE fact_sismo AS
SELECT
  evento_id,
  CAST(to_timestamp(ts_ms / 1000) AS TIMESTAMP) AS ocurrido_en,
  ts_ms,
  lat, lon, profundidad_km, magnitud, tipo_magnitud,
  lugar, tsunami, rol, zona_id,
  CASE
    WHEN profundidad_km < 70  THEN 'superficial'
    WHEN profundidad_km < 300 THEN 'intermedia'
    ELSE 'profunda'
  END AS profundidad_id,
  CASE
    WHEN magnitud < 3 THEN 'micro'
    WHEN magnitud < 4 THEN 'menor'
    WHEN magnitud < 5 THEN 'ligero'
    WHEN magnitud < 6 THEN 'moderado'
    WHEN magnitud < 7 THEN 'fuerte'
    WHEN magnitud < 8 THEN 'mayor'
    ELSE 'grande'
  END AS magnitud_id,
  energia_j
FROM staging_sismos;

CREATE TABLE dim_tiempo AS
SELECT DISTINCT
  CAST(strftime(ocurrido_en, '%Y%m%d') AS INTEGER) AS tiempo_id,
  CAST(ocurrido_en AS DATE)      AS fecha,
  year(ocurrido_en)              AS anio,
  month(ocurrido_en)             AS mes,
  day(ocurrido_en)               AS dia,
  quarter(ocurrido_en)           AS trimestre,
  dayofweek(ocurrido_en)         AS dia_semana,
  strftime(ocurrido_en, '%Y-%m') AS anio_mes
FROM fact_sismo;

CREATE VIEW vw_sismos AS
SELECT f.evento_id, f.ocurrido_en, f.magnitud, f.tipo_magnitud, f.profundidad_km,
       f.lat, f.lon, f.lugar, f.rol, f.tsunami,
       z.nombre AS zona, z.pais, p.etiqueta AS profundidad, m.etiqueta AS clase_magnitud,
       f.energia_j
FROM fact_sismo f
LEFT JOIN dim_zona z         USING (zona_id)
LEFT JOIN dim_profundidad p  USING (profundidad_id)
LEFT JOIN dim_magnitud m     USING (magnitud_id);

CREATE VIEW vw_resumen_zona AS
SELECT z.nombre AS zona, z.pais,
       count(*)                                         AS eventos,
       round(avg(f.magnitud), 2)                        AS mag_media,
       max(f.magnitud)                                  AS mag_max,
       round(avg(f.profundidad_km), 1)                  AS prof_media_km,
       sum(CASE WHEN f.magnitud >= 6 THEN 1 ELSE 0 END) AS eventos_m6,
       min(f.ocurrido_en)                               AS primero,
       max(f.ocurrido_en)                               AS ultimo
FROM fact_sismo f JOIN dim_zona z USING (zona_id)
GROUP BY 1, 2
ORDER BY eventos DESC;

CREATE VIEW vw_tasa_anual AS
SELECT z.nombre AS zona,
       year(f.ocurrido_en) AS anio,
       count(*) AS eventos,
       sum(CASE WHEN f.magnitud >= 5 THEN 1 ELSE 0 END) AS eventos_m5,
       round(sum(f.energia_j) / 1e15, 3)                AS energia_pj
FROM fact_sismo f
JOIN dim_zona z USING (zona_id)
GROUP BY 1, 2
ORDER BY zona, anio;
`

/** Etiqueta cada sismo con la primera zona que lo contiene. */
function zoneOf(q: Quake): string | null {
  for (const r of ALL_REGIONS) if (inBbox(q.lat, q.lon, r.bbox)) return r.id
  return null
}

/** Crea el esquema estrella y carga el catálogo. Idempotente. */
export async function buildWarehouse(
  quakes: Quake[],
  roles?: Map<string, QuakeRole>,
): Promise<WarehouseStats> {
  const db = await getDb()
  const conn = await db.connect()
  try {
    await conn.query(`
      DROP VIEW IF EXISTS vw_tasa_anual;
      DROP VIEW IF EXISTS vw_resumen_zona;
      DROP VIEW IF EXISTS vw_sismos;
      DROP TABLE IF EXISTS dim_tiempo;
      DROP TABLE IF EXISTS fact_sismo;
      DROP TABLE IF EXISTS staging_sismos;
      DROP TABLE IF EXISTS dim_zona;
      DROP TABLE IF EXISTS dim_profundidad;
      DROP TABLE IF EXISTS dim_magnitud;
    `)
    await conn.query(DDL)

    const zonas = ALL_REGIONS.map((r) => ({
      zona_id: r.id,
      nombre: r.name,
      pais: r.country,
      min_lat: r.bbox.minLat,
      max_lat: r.bbox.maxLat,
      min_lon: r.bbox.minLon,
      max_lon: r.bbox.maxLon,
      contexto: r.blurb,
    }))
    await db.registerFileText('zonas.json', JSON.stringify(zonas))
    await conn.query(`INSERT INTO dim_zona SELECT * FROM read_json_auto('zonas.json')`)

    const rows = quakes.map((q) => ({
      evento_id: q.id,
      ts_ms: q.time,
      lat: q.lat,
      lon: q.lon,
      profundidad_km: q.depth,
      magnitud: q.mag,
      tipo_magnitud: q.magType,
      lugar: q.place,
      tsunami: q.tsunami,
      rol: roles?.get(q.id) ?? 'sin_clasificar',
      zona_id: zoneOf(q),
      energia_j: energyJoules(q.mag),
    }))
    const json = JSON.stringify(rows)
    await db.registerFileText('sismos.json', json)
    await conn.query(
      `CREATE TABLE staging_sismos AS SELECT * FROM read_json_auto('sismos.json', maximum_object_size=200000000)`,
    )
    await conn.query(FACT_DDL)

    const stats = toRows(
      await conn.query(
        `SELECT count(*) AS facts,
                count(DISTINCT zona_id) AS zones,
                min(year(ocurrido_en)) AS from_year,
                max(year(ocurrido_en)) AS to_year
         FROM fact_sismo`,
      ),
    )[0]

    return {
      facts: Number(stats.facts ?? 0),
      zones: Number(stats.zones ?? 0),
      fromYear: Number(stats.from_year ?? 0),
      toYear: Number(stats.to_year ?? 0),
      sizeMb: json.length / 1e6,
    }
  } finally {
    await conn.close()
  }
}

export interface QueryResult {
  rows: Row[]
  columns: string[]
  ms: number
  truncated: boolean
}

const MAX_ROWS = 500

export async function runQuery(sql: string): Promise<QueryResult> {
  const db = await getDb()
  const conn = await db.connect()
  const t0 = performance.now()
  try {
    const table = await conn.query(sql)
    const all = toRows(table as unknown as { toArray(): unknown[] })
    const columns = table.schema.fields.map((f) => f.name)
    // Arrow entrega las marcas de tiempo como enteros: las volvemos legibles.
    const timeCols = table.schema.fields
      .filter((f) => /timestamp|date/i.test(String(f.type)))
      .map((f) => f.name)
    if (timeCols.length) {
      for (const row of all) {
        for (const c of timeCols) {
          const v = row[c]
          if (typeof v !== 'number') continue
          const ms = Math.abs(v) > 1e14 ? v / 1000 : v
          row[c] = new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
        }
      }
    }
    const rows = all.slice(0, MAX_ROWS)
    return { rows, columns, ms: performance.now() - t0, truncated: all.length > MAX_ROWS }
  } finally {
    await conn.close()
  }
}

/** Serializa el resultado de una consulta como CSV. */
export async function exportCsv(sql: string): Promise<string> {
  const { rows, columns } = await runQuery(sql)
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n')
}

export const SAMPLE_QUERIES: { title: string; sql: string }[] = [
  {
    title: 'Resumen por zona',
    sql: 'SELECT * FROM vw_resumen_zona;',
  },
  {
    title: 'Sismos por año y zona (M>=5)',
    sql: `SELECT zona, anio, eventos_m5, energia_pj
FROM vw_tasa_anual
WHERE eventos_m5 > 0
ORDER BY anio DESC, eventos_m5 DESC
LIMIT 100;`,
  },
  {
    title: 'Top 20 más fuertes',
    sql: `SELECT ocurrido_en, magnitud, profundidad_km, zona, lugar
FROM vw_sismos
ORDER BY magnitud DESC
LIMIT 20;`,
  },
  {
    title: 'Energía liberada por año',
    sql: `SELECT year(ocurrido_en) AS anio,
       round(sum(energia_j) / 1e15, 2) AS energia_pj,
       count(*) AS eventos
FROM fact_sismo
GROUP BY 1 ORDER BY 1;`,
  },
  {
    title: 'Perfil de profundidad por país',
    sql: `SELECT pais, profundidad, count(*) AS eventos
FROM vw_sismos
WHERE pais IS NOT NULL
GROUP BY 1, 2
ORDER BY pais, eventos DESC;`,
  },
  {
    title: 'Réplicas vs sismicidad de fondo',
    sql: `SELECT rol, count(*) AS eventos, round(avg(magnitud), 2) AS mag_media
FROM fact_sismo GROUP BY 1 ORDER BY eventos DESC;`,
  },
  {
    title: 'Ritmo mensual del último año',
    sql: `SELECT strftime(ocurrido_en, '%Y-%m') AS mes, count(*) AS eventos,
       max(magnitud) AS mag_max
FROM fact_sismo
WHERE ocurrido_en > now() - INTERVAL 1 YEAR
GROUP BY 1 ORDER BY 1;`,
  },
]

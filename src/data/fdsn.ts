import type { Bbox, CatalogQuery, Quake } from "../types";
import { cacheKey, readCache, writeCache } from "./cache";

/** Tope de resultados por petición del protocolo FDSN estándar. */
const FDSN_MAX = 20000;

export interface FdsnNetwork {
  id: string;
  /** URL base del endpoint fdsnws/event/1 (sin barra al final). */
  baseUrl: string;
  /** Etiqueta del campo `source` en el objeto Quake. */
  source: Quake["source"];
  /** URL de evento: recibe el ID del sismo y devuelve la URL pública. */
  eventUrl: (id: string) => string;
}

/** Catálogo de redes FDSN disponibles. */
export const FDSN_NETWORKS: Record<string, FdsnNetwork> = {
  USGS: {
    id: "USGS",
    baseUrl: "https://earthquake.usgs.gov/fdsnws/event/1",
    source: "USGS",
    eventUrl: (id) => `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`,
  },
  EMSC: {
    id: "EMSC",
    baseUrl: "https://www.seismicportal.eu/fdsnws/event/1",
    source: "EMSC",
    eventUrl: (id) =>
      `https://www.seismicportal.eu/eventdetails.html?unid=${id}`,
  },
  GEONET: {
    id: "GEONET",
    baseUrl: "https://service.geonet.org.nz/fdsnws/event/1",
    source: "GEONET",
    eventUrl: (id) => `https://www.geonet.org.nz/earthquake/${id}`,
  },
  GA: {
    id: "GA",
    baseUrl: "https://earthquake.ga.gov.au/fdsnws/event/1",
    source: "GA",
    eventUrl: (id) => `https://earthquakes.ga.gov.au/event/${id}`,
  },
  INGV: {
    id: "INGV",
    baseUrl: "https://webservices.ingv.it/fdsnws/event/1",
    source: "INGV",
    eventUrl: (id) => `https://terremoti.ingv.it/event/${id}`,
  },
  GFZ: {
    id: "GFZ",
    baseUrl: "https://geofon.gfz-potsdam.de/fdsnws/event/1",
    source: "GFZ",
    eventUrl: (id) => `https://geofon.gfz-potsdam.de/eqinfo/event.php?id=${id}`,
  },
  IPGP: {
    id: "IPGP",
    baseUrl: "http://ws.ipgp.fr/fdsnws/event/1",
    source: "IPGP",
    eventUrl: (id) =>
      `http://ws.ipgp.fr/fdsnws/event/1/query?eventid=${id}&format=text`,
  },
  SSN: {
    id: "SSN",
    baseUrl: "https://web.ssn.unam.mx/fdsnws/event/1",
    source: "SSN",
    eventUrl: () => `http://www2.ssn.unam.mx:8080/catalogo/`,
  },
};

interface FdsnFeature {
  id: string;
  properties: {
    time: number;
    mag: number | null;
    magType?: string | null;
    type?: string | null;
    place: string | null;
    tsunami?: number;
    url?: string;
    cdi?: number | null;
    mmi?: number | null;
    felt?: number | null;
  }; 
  geometry: { coordinates: [number, number, number] } | null;
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

function queryString(
  _net: FdsnNetwork,
  q: CatalogQuery,
  extra: Record<string, string> = {},
): string {
  const p = new URLSearchParams({
    format: "geojson",
    starttime: iso(q.startTime),
    endtime: iso(q.endTime),
    minmagnitude: String(q.minMag),
    minlatitude: String(q.bbox.minLat),
    maxlatitude: String(q.bbox.maxLat),
    minlongitude: String(q.bbox.minLon),
    maxlongitude: String(q.bbox.maxLon),
    orderby: "time",
    ...extra,
  });
  return p.toString();
}

function toQuake(f: FdsnFeature, net: FdsnNetwork): Quake | null {
  const c = f.geometry?.coordinates;
  const mag = f.properties.mag;
  if (!c || mag == null || !Number.isFinite(mag)) return null;
  return {
    id: `${net.id}:${f.id}`,
    time: f.properties.time,
    lat: c[1],
    lon: c[0],
    depth: Number.isFinite(c[2]) ? c[2] : 0,
    mag,
    magType: f.properties.magType ?? f.properties.type ?? "—",
    place: f.properties.place ?? "Sin localidad",
    tsunami: f.properties.tsunami === 1,
    url: f.properties.url ?? net.eventUrl(f.id),
    source: net.source,
    cdi: f.properties.cdi ?? undefined,
    mmi: f.properties.mmi ?? undefined,
    felt: f.properties.felt ?? undefined,
  };
}

async function fetchJson(
  url: string,
  signal?: AbortSignal,
  retries = 3,
): Promise<unknown> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok)
      throw new Error(
        `${url.split("/")[2]} respondió ${res.status} ${res.statusText}`,
      );
    return await res.json();
  } catch (err) {
    if (
      retries <= 1 ||
      (err instanceof DOMException && err.name === "AbortError")
    )
      throw err;
    await new Promise((r) => setTimeout(r, 1000));
    return fetchJson(url, signal, retries - 1);
  }
}

async function countFdsn(
  net: FdsnNetwork,
  q: CatalogQuery,
  signal?: AbortSignal,
): Promise<number> {
  try {
    const data = (await fetchJson(
      `${net.baseUrl}/count?${queryString(net, q)}`,
      signal,
    )) as { count: number };
    return data.count ?? 0;
  } catch {
    // Algunos servicios no implementan /count — se asume que hay datos.
    return FDSN_MAX;
  }
}

async function fetchWindow(
  net: FdsnNetwork,
  q: CatalogQuery,
  signal?: AbortSignal,
): Promise<Quake[]> {
  const data = (await fetchJson(
    `${net.baseUrl}/query?${queryString(net, q, { limit: String(FDSN_MAX) })}`,
    signal,
  )) as { features: FdsnFeature[] };
  return (data.features ?? [])
    .map((f) => toQuake(f, net))
    .filter((x): x is Quake => x !== null);
}

/**
 * Descarga un catálogo FDSN genérico. Si la ventana supera el tope por
 * petición, la parte en dos por la mitad temporal, recursivamente.
 */
export async function fetchFdsnCatalog(
  net: FdsnNetwork,
  q: CatalogQuery,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Quake[]> {
  const total = await countFdsn(net, q, signal);
  if (total === 0) return [];

  const out: Quake[] = [];
  const stack: CatalogQuery[] = [q];

  while (stack.length) {
    const win = stack.pop()!;
    const chunk = await fetchWindow(net, win, signal);
    if (chunk.length >= FDSN_MAX && win.endTime - win.startTime > 86_400_000) {
      const mid = Math.floor((win.startTime + win.endTime) / 2);
      stack.push({ ...win, startTime: mid + 1 }, { ...win, endTime: mid });
      continue;
    }
    out.push(...chunk);
    onProgress?.(out.length, Math.max(total, out.length));
  }

  const seen = new Set<string>();
  return out
    .filter((k) => (seen.has(k.id) ? false : (seen.add(k.id), true)))
    .sort((a, b) => b.time - a.time);
}

/** Descarga con caché en IndexedDB. */
export async function loadFdsnCatalog(
  net: FdsnNetwork,
  q: CatalogQuery,
  ttlMs: number,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ quakes: Quake[]; fromCache: boolean }> {
  const key = cacheKey(q, ttlMs, net.id);
  const hit = await readCache(key);
  if (hit) return { quakes: hit, fromCache: true };
  const quakes = await fetchFdsnCatalog(net, q, signal, onProgress);
  await writeCache(key, quakes);
  return { quakes, fromCache: false };
}

export function bboxOf(quakes: Quake[]): Bbox | null {
  if (!quakes.length) return null;
  let minLat = 90,
    maxLat = -90,
    minLon = 180,
    maxLon = -180;
  for (const k of quakes) {
    if (k.lat < minLat) minLat = k.lat;
    if (k.lat > maxLat) maxLat = k.lat;
    if (k.lon < minLon) minLon = k.lon;
    if (k.lon > maxLon) maxLon = k.lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

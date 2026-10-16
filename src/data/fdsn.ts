import type { Bbox, CatalogQuery, Quake } from "../types";
import { cacheKey, readCache, writeCache } from "./cache";

/** Tope de resultados por petición del protocolo FDSN estándar. */
const FDSN_MAX = 20000;

export type FdsnFormat = "geojson" | "json" | "text";

export interface FdsnNetwork {
  id: string;
  /** URL base del endpoint fdsnws/event/1 (sin barra al final). */
  baseUrl: string;
  /** Etiqueta del campo `source` en el objeto Quake. */
  source: Quake["source"];
  /** Formato preferido por el servidor FDSN (por defecto 'geojson'). */
  format?: FdsnFormat;
  /** Si el servidor acepta el parámetro `limit` en /query (por defecto true). */
  supportsLimit?: boolean;
  /** Si el servidor implementa el endpoint /count (por defecto false). */
  supportsCount?: boolean;
  /** URL de evento: recibe el ID del sismo y devuelve la URL pública. */
  eventUrl: (id: string) => string;
}

/** Catálogo de redes FDSN disponibles. */
export const FDSN_NETWORKS: Record<string, FdsnNetwork> = {
  USGS: {
    id: "USGS",
    baseUrl: "https://earthquake.usgs.gov/fdsnws/event/1",
    source: "USGS",
    format: "geojson",
    supportsLimit: true,
    supportsCount: true,
    eventUrl: (id) => `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`,
  },
  EMSC: {
    id: "EMSC",
    baseUrl: "https://www.seismicportal.eu/fdsnws/event/1",
    source: "EMSC",
    format: "json",
    supportsLimit: true,
    supportsCount: true,
    eventUrl: (id) =>
      `https://www.seismicportal.eu/eventdetails.html?unid=${id}`,
  },
  GEONET: {
    id: "GEONET",
    baseUrl: "https://service.geonet.org.nz/fdsnws/event/1",
    source: "GEONET",
    format: "text",
    supportsLimit: false,
    supportsCount: false,
    eventUrl: (id) => `https://www.geonet.org.nz/earthquake/${id}`,
  },
  GA: {
    id: "GA",
    baseUrl: "https://earthquake.ga.gov.au/fdsnws/event/1",
    source: "GA",
    format: "text",
    supportsLimit: true,
    supportsCount: false,
    eventUrl: (id) => `https://earthquakes.ga.gov.au/event/${id}`,
  },
  INGV: {
    id: "INGV",
    baseUrl: "https://webservices.ingv.it/fdsnws/event/1",
    source: "INGV",
    format: "geojson",
    supportsLimit: true,
    supportsCount: false,
    eventUrl: (id) => `https://terremoti.ingv.it/event/${id}`,
  },
  GFZ: {
    id: "GFZ",
    baseUrl: "https://geofon.gfz-potsdam.de/fdsnws/event/1",
    source: "GFZ",
    format: "text",
    supportsLimit: true,
    supportsCount: false,
    eventUrl: (id) => `https://geofon.gfz-potsdam.de/eqinfo/event.php?id=${id}`,
  },
  IPGP: {
    id: "IPGP",
    baseUrl: "https://ws.ipgp.fr/fdsnws/event/1",
    source: "IPGP",
    format: "text",
    supportsLimit: true,
    supportsCount: false,
    eventUrl: (id) =>
      `https://ws.ipgp.fr/fdsnws/event/1/query?eventid=${id}&format=text`,
  },
  SSN: {
    id: "SSN",
    baseUrl: "https://web.ssn.unam.mx/fdsnws/event/1",
    source: "SSN",
    format: "text",
    supportsLimit: true,
    supportsCount: false,
    eventUrl: () => `http://www2.ssn.unam.mx:8080/catalogo/`,
  },
};

interface FdsnFeature {
  id?: string | number;
  properties: {
    eventId?: string | number;
    unid?: string;
    time: number | string;
    mag: number | null;
    magType?: string | null;
    magtype?: string | null;
    type?: string | null;
    place?: string | null;
    flynn_region?: string | null;
    depth?: number | null;
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

/**
 * Convierte un instante FDSN (epoch ms o cadena ISO 8601 con o sin 'Z') a ms UTC.
 */
export function parseFdsnTime(raw: number | string | null | undefined): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw !== "string") return NaN;
  const s = raw.trim();
  if (!s) return NaN;
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  return Date.parse(hasTz ? s : `${s}Z`);
}

/**
 * Extrae el conteo de eventos de una respuesta /count FDSN (texto plano, JSON o XML).
 */
export function parseFdsnCount(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s.startsWith("{")) {
    try {
      const data = JSON.parse(s) as { count?: number };
      if (typeof data.count === "number" && Number.isFinite(data.count)) {
        return data.count;
      }
    } catch {
      return null;
    }
  }
  const xmlMatch = /<Events>\s*(\d+)\s*<\/Events>/i.exec(s);
  if (xmlMatch) return parseInt(xmlMatch[1], 10);
  return null;
}

function queryString(
  net: FdsnNetwork,
  q: CatalogQuery,
  extra: Record<string, string> = {},
): string {
  const format = net.format ?? "geojson";
  const p = new URLSearchParams({
    format,
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
  const mag = f.properties?.mag;
  const time = parseFdsnTime(f.properties?.time);
  if (!c || mag == null || !Number.isFinite(mag) || !Number.isFinite(time))
    return null;
  const lon = Number(c[0]);
  const lat = Number(c[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const rawId = f.id ?? f.properties.eventId ?? f.properties.unid;
  const eventId =
    rawId != null && String(rawId).trim() !== ""
      ? String(rawId).trim()
      : `${time}_${lat}_${lon}`;

  const propDepth = f.properties.depth;
  const coordDepth = Number(c[2]);
  let depth =
    typeof propDepth === "number" && Number.isFinite(propDepth)
      ? propDepth
      : Number.isFinite(coordDepth)
        ? coordDepth
        : 0;
  if (net.id === "EMSC" && depth < 0) depth = Math.abs(depth);

  return {
    id: `${net.id}:${eventId}`,
    time,
    lat,
    lon,
    depth,
    mag,
    magType:
      f.properties.magType ??
      f.properties.magtype ??
      f.properties.type ??
      "—",
    place:
      f.properties.place ?? f.properties.flynn_region ?? "Sin localidad",
    tsunami: f.properties.tsunami === 1,
    url: f.properties.url ?? net.eventUrl(eventId),
    source: net.source,
    cdi: f.properties.cdi ?? undefined,
    mmi: f.properties.mmi ?? undefined,
    felt: f.properties.felt ?? undefined,
  };
}

/**
 * Parsea un objeto GeoJSON/JSON de sismos FDSN (USGS, EMSC, INGV).
 */
export function parseFdsnGeoJson(data: unknown, net: FdsnNetwork): Quake[] {
  if (!data || typeof data !== "object") return [];
  const features = (data as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  return features
    .map((f) => toQuake(f as FdsnFeature, net))
    .filter((x): x is Quake => x !== null);
}

/**
 * Parsea el formato estándar FDSN `format=text` separado por tuberías (`|`).
 * Cabecera estándar:
 * #EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType
 */
export function parseFdsnText(text: string, net: FdsnNetwork): Quake[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("<")) {
    throw new Error(
      `${net.id} devolvió HTML/XML en lugar del formato de texto FDSN`,
    );
  }
  const out: Quake[] = [];
  const lines = trimmed.split(/\r?\n/);
  for (const line of lines) {
    const row = line.trim();
    if (!row || row.startsWith("#")) continue;
    const cols = row.split("|");
    if (cols.length < 11) continue;
    const eventId = cols[0].trim();
    const time = parseFdsnTime(cols[1]);
    const lat = parseFloat(cols[2]);
    const lon = parseFloat(cols[3]);
    const depth = parseFloat(cols[4]);
    const magType = cols[9]?.trim() || "—";
    const mag = parseFloat(cols[10]);
    const place = cols[12]?.trim() || cols[6]?.trim() || "Sin localidad";
    if (
      !eventId ||
      !Number.isFinite(time) ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      !Number.isFinite(mag)
    ) {
      continue;
    }
    out.push({
      id: `${net.id}:${eventId}`,
      time,
      lat,
      lon,
      depth: Number.isFinite(depth) ? depth : 0,
      mag,
      magType,
      place,
      tsunami: false,
      url: net.eventUrl(eventId),
      source: net.source,
    });
  }
  return out;
}

class HttpStatusError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function fetchText(
  url: string,
  signal?: AbortSignal,
  retries = 3,
): Promise<string> {
  try {
    const res = await fetch(url, { signal });
    if (res.status === 204) return "";
    if (!res.ok)
      throw new HttpStatusError(
        `${url.split("/")[2]} respondió ${res.status} ${res.statusText}`,
        res.status,
      );
    return await res.text();
  } catch (err) {
    const isClientError =
      err instanceof HttpStatusError &&
      err.status >= 400 &&
      err.status < 500 &&
      err.status !== 429;
    if (
      retries <= 1 ||
      isClientError ||
      (err instanceof DOMException && err.name === "AbortError")
    )
      throw err;
    await new Promise((r) => setTimeout(r, 1000));
    return fetchText(url, signal, retries - 1);
  }
}

async function countFdsn(
  net: FdsnNetwork,
  q: CatalogQuery,
  signal?: AbortSignal,
): Promise<number> {
  if (!net.supportsCount) return FDSN_MAX;
  try {
    const p = new URLSearchParams({
      starttime: iso(q.startTime),
      endtime: iso(q.endTime),
      minmagnitude: String(q.minMag),
      minlatitude: String(q.bbox.minLat),
      maxlatitude: String(q.bbox.maxLat),
      minlongitude: String(q.bbox.minLon),
      maxlongitude: String(q.bbox.maxLon),
    });
    const raw = await fetchText(
      `${net.baseUrl}/count?${p.toString()}`,
      signal,
      1,
    );
    return parseFdsnCount(raw) ?? FDSN_MAX;
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
  const extra: Record<string, string> = {};
  if (net.supportsLimit !== false) {
    extra.limit = String(FDSN_MAX);
  }
  const raw = await fetchText(
    `${net.baseUrl}/query?${queryString(net, q, extra)}`,
    signal,
  );
  if (!raw.trim()) return [];
  if ((net.format ?? "geojson") === "text") {
    return parseFdsnText(raw, net);
  }
  const data = JSON.parse(raw) as unknown;
  return parseFdsnGeoJson(data, net);
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

import type { Quake } from "../types";
import { energyJoules } from "../science/stats";

function csvCell(v: string | number | boolean | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Convierte un arreglo de sismos en una tabla CSV con cabecera estándar.
 */
export function quakesToCsv(quakes: Quake[]): string {
  const headers = [
    "id",
    "time_iso",
    "time_ms",
    "mag",
    "mag_type",
    "depth_km",
    "lat",
    "lon",
    "place",
    "source",
    "tsunami",
    "mmi",
    "cdi",
    "felt",
    "energy_joules",
    "url",
  ];
  const lines = [headers.join(",")];
  for (const q of quakes) {
    const row = [
      csvCell(q.id),
      csvCell(new Date(q.time).toISOString()),
      csvCell(q.time),
      csvCell(q.mag),
      csvCell(q.magType),
      csvCell(q.depth),
      csvCell(q.lat),
      csvCell(q.lon),
      csvCell(q.place),
      csvCell(q.source ?? "USGS"),
      csvCell(q.tsunami ? 1 : 0),
      csvCell(q.mmi ?? ""),
      csvCell(q.cdi ?? ""),
      csvCell(q.felt ?? ""),
      csvCell(Math.round(energyJoules(q.mag))),
      csvCell(q.url),
    ];
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

/**
 * Convierte un arreglo de sismos en un FeatureCollection GeoJSON estándar.
 */
export function quakesToGeoJson(quakes: Quake[]): string {
  const collection = {
    type: "FeatureCollection",
    metadata: {
      generated: new Date().toISOString(),
      count: quakes.length,
    },
    features: quakes.map((q) => ({
      type: "Feature",
      id: q.id,
      properties: {
        time: q.time,
        timeIso: new Date(q.time).toISOString(),
        mag: q.mag,
        magType: q.magType,
        place: q.place,
        depth: q.depth,
        tsunami: q.tsunami ? 1 : 0,
        source: q.source ?? "USGS",
        mmi: q.mmi ?? null,
        cdi: q.cdi ?? null,
        felt: q.felt ?? null,
        url: q.url,
      },
      geometry: {
        type: "Point",
        coordinates: [q.lon, q.lat, q.depth],
      },
    })),
  };
  return JSON.stringify(collection, null, 2);
}

/**
 * Escapa caracteres especiales para XML.
 */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Convierte un arreglo de sismos al estándar internacional FDSN QuakeML 1.2 (XML),
 * compatible con ObsPy, SeisComP, QGIS e IRIS.
 * Nota: en QuakeML 1.2 la profundidad (<depth><value>) se expresa en metros.
 */
export function quakesToQuakeMl(quakes: Quake[]): string {
  const created = new Date().toISOString();
  const eventsXml = quakes
    .map((q) => {
      const safeId = xmlEscape(q.id || `ev-${q.time}`);
      const iso = new Date(q.time).toISOString();
      const depthMeters = Math.round(q.depth * 1000);
      const place = xmlEscape(q.place || "Unknown");
      const magType = xmlEscape(q.magType || "Mw");
      return `    <event publicID="smi:sismos.global/event/${safeId}">
      <description>
        <type>region name</type>
        <text>${place}</text>
      </description>
      <origin publicID="smi:sismos.global/origin/${safeId}">
        <time><value>${iso}</value></time>
        <latitude><value>${q.lat}</value></latitude>
        <longitude><value>${q.lon}</value></longitude>
        <depth><value>${depthMeters}</value></depth>
      </origin>
      <magnitude publicID="smi:sismos.global/mag/${safeId}">
        <mag><value>${q.mag}</value></mag>
        <type>${magType}</type>
      </magnitude>
    </event>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2">
  <eventParameters publicID="smi:sismos.global/catalog">
    <creationInfo>
      <agencyID>SismosGlobal</agencyID>
      <creationTime>${created}</creationTime>
    </creationInfo>
${eventsXml}
  </eventParameters>
</q:quakeml>`;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const VALID_SOURCES = new Set<Quake["source"]>([
  "USGS",
  "SGC",
  "EMSC",
  "GEONET",
  "GA",
  "INGV",
  "GFZ",
  "IPGP",
  "SSN",
]);

function normalizeSource(raw: unknown): Quake["source"] {
  const s = typeof raw === "string" ? raw.toUpperCase() : "";
  return VALID_SOURCES.has(s as Quake["source"])
    ? (s as Quake["source"])
    : "USGS";
}

/**
 * Importa y normaliza un catálogo de sismos proporcionado por el usuario en
 * formato GeoJSON (.geojson/.json), CSV (.csv, esquema Sismos Global o USGS)
 * o QuakeML 1.2 (.xml).
 */
export function parseUserCatalog(content: string): Quake[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  // 1. GeoJSON o JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { features?: unknown[] }).features)
        ? (parsed as { features: unknown[] }).features
        : [];
    const quakes: Quake[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as Record<string, unknown>;
      const props = (item.properties as Record<string, unknown>) ?? item;
      const geom = item.geometry as { coordinates?: number[] } | undefined;
      const coords = Array.isArray(geom?.coordinates) ? geom.coordinates : [];

      const lat = Number(props.lat ?? props.latitude ?? coords[1]);
      const lon = Number(props.lon ?? props.longitude ?? coords[0]);
      const depth = Number(props.depth ?? props.depth_km ?? coords[2] ?? 10);
      const mag = Number(props.mag ?? props.magnitude);
      const rawTime = props.time ?? props.time_ms ?? props.timeIso ?? props.time_iso;
      const time =
        typeof rawTime === "number"
          ? rawTime
          : typeof rawTime === "string"
            ? Date.parse(rawTime)
            : NaN;

      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(mag))
        continue;
      quakes.push({
        id: String(item.id ?? props.id ?? `user-${i}`),
        time: Number.isFinite(time) ? time : Date.now() - i * 60_000,
        mag,
        magType: String(props.magType ?? props.mag_type ?? "Mw"),
        depth: Number.isFinite(depth) ? depth : 10,
        lat,
        lon,
        place: String(props.place ?? "Catálogo importado"),
        url: String(props.url ?? "https://earthquake.usgs.gov"),
        tsunami: Boolean(props.tsunami),
        mmi: props.mmi != null && props.mmi !== "" ? Number(props.mmi) : undefined,
        cdi: props.cdi != null && props.cdi !== "" ? Number(props.cdi) : undefined,
        felt:
          props.felt != null && props.felt !== "" ? Number(props.felt) : undefined,
        source: normalizeSource(props.source),
      });
    }
    return quakes.sort((a, b) => b.time - a.time);
  }

  // 2. QuakeML 1.2 (XML)
  if (trimmed.startsWith("<")) {
    const eventBlocks = trimmed.match(/<event\b[\s\S]*?<\/event>/gi) ?? [];
    const tagVal = (block: string, tag: string): string | null => {
      const m = block.match(
        new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<value>([^<]+)<\\/value>`, "i"),
      );
      return m ? m[1].trim() : null;
    };
    const simpleTag = (block: string, tag: string): string | null => {
      const m = block.match(new RegExp(`<${tag}\\b[^>]*>([^<]+)<\\/${tag}>`, "i"));
      return m ? m[1].trim() : null;
    };

    const quakes: Quake[] = [];
    for (let i = 0; i < eventBlocks.length; i++) {
      const block = eventBlocks[i];
      const idMatch = block.match(/publicID=["']([^"']+)["']/i);
      const rawId = idMatch
        ? idMatch[1].split("/").pop() || `qml-${i}`
        : `qml-${i}`;
      const timeStr = tagVal(block, "time");
      const lat = Number(tagVal(block, "latitude"));
      const lon = Number(tagVal(block, "longitude"));
      const rawDepth = Number(tagVal(block, "depth") ?? 10000);
      const depth = rawDepth > 700 ? rawDepth / 1000 : rawDepth;
      const mag = Number(tagVal(block, "mag"));
      const place = simpleTag(block, "text") ?? "QuakeML event";
      const magType = simpleTag(block, "type") ?? "Mw";
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(mag))
        continue;
      const time = timeStr ? Date.parse(timeStr) : Date.now();
      quakes.push({
        id: rawId,
        time: Number.isFinite(time) ? time : Date.now(),
        mag,
        magType,
        depth: Number.isFinite(depth) ? depth : 10,
        lat,
        lon,
        place,
        url: "https://earthquake.usgs.gov",
        tsunami: false,
        source: "USGS",
      });
    }
    return quakes.sort((a, b) => b.time - a.time);
  }

  // 3. CSV (Sismos Global o USGS)
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) =>
    headers.findIndex((h) => names.includes(h));

  const iId = idx(["id", "eventid", "evento_id"]);
  const iTimeMs = idx(["time_ms", "ts_ms"]);
  const iTimeIso = idx(["time_iso", "time", "ocurrido_en", "datetime"]);
  const iMag = idx(["mag", "magnitud", "magnitude"]);
  const iMagType = idx(["mag_type", "magtype", "tipo_magnitud"]);
  const iDepth = idx(["depth_km", "depth", "profundidad_km"]);
  const iLat = idx(["lat", "latitude"]);
  const iLon = idx(["lon", "longitude", "lng"]);
  const iPlace = idx(["place", "lugar", "location"]);
  const iSource = idx(["source", "net", "network"]);
  const iTsunami = idx(["tsunami"]);

  const quakes: Quake[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r]);
    const lat = Number(cols[iLat]);
    const lon = Number(cols[iLon]);
    const mag = Number(cols[iMag]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(mag))
      continue;
    const depth = iDepth >= 0 ? Number(cols[iDepth]) : 10;
    const tMs = iTimeMs >= 0 ? Number(cols[iTimeMs]) : NaN;
    const tIso = iTimeIso >= 0 ? Date.parse(cols[iTimeIso]) : NaN;
    const time = Number.isFinite(tMs)
      ? tMs
      : Number.isFinite(tIso)
        ? tIso
        : Date.now() - r * 60_000;
    quakes.push({
      id: (iId >= 0 && cols[iId]) || `csv-${r}`,
      time,
      mag,
      magType: (iMagType >= 0 && cols[iMagType]) || "Mw",
      depth: Number.isFinite(depth) ? depth : 10,
      lat,
      lon,
      place: (iPlace >= 0 && cols[iPlace]) || "CSV event",
      url: "https://earthquake.usgs.gov",
      tsunami: iTsunami >= 0 && (cols[iTsunami] === "1" || cols[iTsunami] === "true"),
      source: normalizeSource(iSource >= 0 ? cols[iSource] : undefined),
    });
  }
  return quakes.sort((a, b) => b.time - a.time);
}

/**
 * Dispara la descarga de un archivo de texto en el navegador.
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

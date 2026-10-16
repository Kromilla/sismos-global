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

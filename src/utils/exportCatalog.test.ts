import { describe, expect, it } from "vitest";
import type { Quake } from "../types";
import { FAMOUS_QUAKES } from "../data/famousQuakes";
import {
  parseUserCatalog,
  quakesToCsv,
  quakesToGeoJson,
  quakesToQuakeMl,
} from "./exportCatalog";

const sampleQuakes: Quake[] = [
  {
    id: "USGS:us6000test",
    time: 1735689600000,
    lat: -16.1,
    lon: 167.4,
    depth: 35,
    mag: 6.2,
    magType: "mww",
    place: '7 km E of "Lakatoro", Vanuatu',
    tsunami: true,
    url: "https://earthquake.usgs.gov/earthquakes/eventpage/us6000test",
    source: "USGS",
    mmi: 5.8,
    cdi: 5.2,
    felt: 42,
  },
];

describe("quakesToCsv", () => {
  it("genera CSV válido escapando comas y comillas dobles", () => {
    const csv = quakesToCsv(sampleQuakes);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("id,time_iso,time_ms,mag,mag_type");
    expect(lines[1]).toContain('"7 km E of ""Lakatoro"", Vanuatu"');
    expect(lines[1]).toContain("USGS:us6000test,2025-01-01T00:00:00.000Z");
  });
});

describe("quakesToGeoJson", () => {
  it("genera un FeatureCollection GeoJSON con geometría Point [lon, lat, depth]", () => {
    const raw = quakesToGeoJson(sampleQuakes);
    const parsed = JSON.parse(raw) as {
      type: string;
      metadata: { count: number };
      features: Array<{
        id: string;
        properties: { mag: number; tsunami: number };
        geometry: { type: string; coordinates: [number, number, number] };
      }>;
    };

    expect(parsed.type).toBe("FeatureCollection");
    expect(parsed.metadata.count).toBe(1);
    expect(parsed.features[0].id).toBe("USGS:us6000test");
    expect(parsed.features[0].properties.mag).toBe(6.2);
    expect(parsed.features[0].properties.tsunami).toBe(1);
    expect(parsed.features[0].geometry.coordinates).toEqual([
      167.4, -16.1, 35,
    ]);
  });
});

describe("quakesToQuakeMl y parseUserCatalog", () => {
  it("exporta QuakeML 1.2 válido con profundidad en metros y lo re-importa sin pérdidas", () => {
    const xml = quakesToQuakeMl(sampleQuakes);
    expect(xml).toContain("<q:quakeml");
    expect(xml).toContain("<depth><value>35000</value></depth>");
    expect(xml).toContain("&quot;Lakatoro&quot;");

    const reimported = parseUserCatalog(xml);
    expect(reimported).toHaveLength(1);
    expect(reimported[0].mag).toBeCloseTo(6.2, 2);
    expect(reimported[0].depth).toBeCloseTo(35, 2);
    expect(reimported[0].lat).toBeCloseTo(-16.1, 2);
  });

  it("importa catálogos propios desde CSV y GeoJSON (round-trip)", () => {
    const fromCsv = parseUserCatalog(quakesToCsv(sampleQuakes));
    expect(fromCsv).toHaveLength(1);
    expect(fromCsv[0].id).toBe("USGS:us6000test");
    expect(fromCsv[0].mag).toBeCloseTo(6.2, 2);
    expect(fromCsv[0].place).toContain('7 km E of "Lakatoro"');

    const fromGeoJson = parseUserCatalog(quakesToGeoJson(sampleQuakes));
    expect(fromGeoJson).toHaveLength(1);
    expect(fromGeoJson[0].id).toBe("USGS:us6000test");
    expect(fromGeoJson[0].tsunami).toBe(true);
  });

  it("contiene el catálogo curado de grandes terremotos históricos", () => {
    expect(FAMOUS_QUAKES.length).toBeGreaterThanOrEqual(8);
    expect(FAMOUS_QUAKES[0].mag).toBe(9.5);
  });
});


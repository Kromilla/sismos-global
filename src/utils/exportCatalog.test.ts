import { describe, expect, it } from "vitest";
import type { Quake } from "../types";
import { quakesToCsv, quakesToGeoJson } from "./exportCatalog";

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

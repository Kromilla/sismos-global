import { describe, expect, it } from "vitest";
import { buildCrossSection } from "./crossSection";
import type { Quake } from "../types";

const SAMPLE: Quake[] = [
  {
    id: "west-shallow",
    time: 1000,
    mag: 6.5,
    magType: "mww",
    depth: 20,
    lat: -20,
    lon: -71,
    place: "Costa de Chile",
    tsunami: false,
    url: "",
    source: "USGS",
  },
  {
    id: "east-deep",
    time: 2000,
    mag: 5.8,
    magType: "mww",
    depth: 180,
    lat: -20,
    lon: -67,
    place: "Altiplano",
    tsunami: false,
    url: "",
    source: "USGS",
  },
];

describe("buildCrossSection", () => {
  it("proyecta eventos de oeste a este con distancias crecientes desde 0 km", () => {
    const res = buildCrossSection(SAMPLE, "WE");
    expect(res.points).toHaveLength(2);
    expect(res.points[0].distKm).toBe(0);
    expect(res.points[1].distKm).toBeGreaterThan(300);
    expect(res.points[1].depthKm).toBe(180);
  });
});

import { describe, expect, it } from "vitest";
import { normalCdf, sitePsha } from "./psha";
import type { City } from "../data/cities";
import type { Quake } from "../types";

describe("PSHA Science Module", () => {
  it("normalCdf computes standard normal probabilities accurately", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 2);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 2);
    expect(normalCdf(3)).toBeGreaterThan(0.998);
    expect(normalCdf(-3)).toBeLessThan(0.002);
  });

  const mockCity: City = {
    id: "bogota",
    name: "Bogotá",
    lat: 4.711,
    lon: -74.0721,
    country: "Colombia",
    popK: 8000,
  };

  it("sitePsha returns null when insufficient quakes are present", () => {
    const quakes: Quake[] = [
      {
        id: "q1",
        time: Date.now() - 100000,
        lat: 4.7,
        lon: -74.0,
        depth: 10,
        mag: 5.0,
        magType: "mw",
        place: "Near Bogotá",
        tsunami: false,
        url: "https://example.com/q1",
        source: "USGS",
      },
    ];
    const res = sitePsha(mockCity, quakes, {
      mc: 4.0,
      b: 1.0,
      mmax: 8.0,
      years: 10,
    });
    expect(res).toBeNull();
  });

  it("sitePsha returns null when mmax <= mc or b <= 0", () => {
    const quakes: Quake[] = Array.from({ length: 10 }, (_, i) => ({
      id: `q${i}`,
      time: Date.now() - (i + 1) * 86_400_000,
      lat: 4.7 + i * 0.01,
      lon: -74.0 + i * 0.01,
      depth: 10,
      mag: 5.0,
      magType: "mw",
      place: "Mock place",
      tsunami: false,
      url: `https://example.com/q${i}`,
      source: "USGS",
    }));

    expect(
      sitePsha(mockCity, quakes, { mc: 5.0, b: 1.0, mmax: 4.5, years: 10 }),
    ).toBeNull();
    expect(
      sitePsha(mockCity, quakes, { mc: 4.0, b: 0, mmax: 8.0, years: 10 }),
    ).toBeNull();
  });

  it("sitePsha calculates coherent hazard curve with valid dataset", () => {
    const quakes: Quake[] = Array.from({ length: 20 }, (_, i) => ({
      id: `q${i}`,
      time: Date.now() - (i + 1) * 86_400_000 * 30,
      lat: 4.7 + (i % 3) * 0.1,
      lon: -74.0 + (i % 3) * 0.1,
      depth: 15,
      mag: 4.5 + (i % 4) * 0.5,
      magType: "mw",
      place: "Central Colombia",
      tsunami: false,
      url: `https://example.com/q${i}`,
      source: "SGC",
    }));

    const res = sitePsha(mockCity, quakes, {
      mc: 4.0,
      b: 1.0,
      mmax: 7.8,
      years: 10,
    });

    expect(res).not.toBeNull();
    if (res) {
      expect(res.curve.length).toBeGreaterThan(0);
      expect(res.mmi475).toBeGreaterThanOrEqual(1);
      expect(res.mmi475).toBeLessThanOrEqual(12);
      expect(res.mmi2475).toBeGreaterThanOrEqual(res.mmi475);
      expect(res.historicMax).not.toBeNull();
    }
  });
});

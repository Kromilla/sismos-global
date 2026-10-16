import { describe, expect, it } from "vitest";
import {
  calibrateEtas,
  etasExpected,
  etasForecast,
  etasRate,
  scaleToMagnitude,
} from "./etas";
import type { Quake } from "../types";

describe("ETAS Science Module", () => {
  const baseTime = 1_700_000_000_000;
  const mockQuakes: Quake[] = [
    {
      id: "mainshock",
      time: baseTime - 86_400_000 * 2,
      lat: 0,
      lon: 0,
      depth: 10,
      mag: 6.5,
      magType: "mww",
      place: "Epicenter",
      tsunami: false,
      url: "https://example.com/mainshock",
      source: "USGS",
    },
    {
      id: "aftershock1",
      time: baseTime - 86_400_000 * 1,
      lat: 0.1,
      lon: 0.1,
      depth: 10,
      mag: 5.2,
      magType: "mb",
      place: "Near epicenter",
      tsunami: false,
      url: "https://example.com/aftershock1",
      source: "USGS",
    },
  ];

  it("calibrateEtas produces bounded parameters", () => {
    const params = calibrateEtas(mockQuakes, {
      mc: 4.0,
      backgroundRatePerDay: 0.5,
      branching: 0.3,
    });

    expect(params.mu).toBe(0.5);
    expect(params.branching).toBe(0.3);
    expect(params.K0).toBeGreaterThanOrEqual(0);
    expect(params.p).toBeGreaterThanOrEqual(1.03);
    expect(params.c).toBeGreaterThan(0);
  });

  it("etasRate decays as time elapsed increases", () => {
    const params = calibrateEtas(mockQuakes, {
      mc: 4.0,
      backgroundRatePerDay: 0.1,
      branching: 0.4,
    });

    const rateJustAfter = etasRate(params, mockQuakes, baseTime);
    const rateMuchLater = etasRate(
      params,
      mockQuakes,
      baseTime + 86_400_000 * 30,
    );

    expect(rateJustAfter).toBeGreaterThan(rateMuchLater);
    expect(rateMuchLater).toBeGreaterThanOrEqual(params.mu);
  });

  it("etasExpected computes cumulative events with cascade correction", () => {
    const params = calibrateEtas(mockQuakes, {
      mc: 4.0,
      backgroundRatePerDay: 0.1,
      branching: 0.2,
    });
    const expected7d = etasExpected(params, mockQuakes, baseTime, 7);
    const expected30d = etasExpected(params, mockQuakes, baseTime, 30);
    expect(expected7d).toBeGreaterThan(0);
    expect(expected30d).toBeGreaterThan(expected7d);
  });

  it("scaleToMagnitude applies Gutenberg-Richter scaling", () => {
    const base = 100;
    const scaled = scaleToMagnitude(base, 1.0, 4.0, 5.0);
    expect(scaled).toBeCloseTo(10, 4);

    const scaled2 = scaleToMagnitude(base, 1.0, 4.0, 6.0);
    expect(scaled2).toBeCloseTo(1, 4);
  });

  it("etasForecast generates probabilities bounded in [0, 1]", () => {
    const params = calibrateEtas(mockQuakes, {
      mc: 4.0,
      backgroundRatePerDay: 0.2,
      branching: 0.2,
    });

    const forecast = etasForecast(
      params,
      mockQuakes,
      baseTime,
      [1, 7, 30],
      [4.0, 5.0, 6.0],
      1.0,
    );

    expect(forecast.length).toBe(9);
    for (const cell of forecast) {
      expect(cell.probability).toBeGreaterThanOrEqual(0);
      expect(cell.probability).toBeLessThanOrEqual(1);
      expect(cell.expected).toBeGreaterThanOrEqual(0);
    }
  });
});

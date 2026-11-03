import { describe, expect, it } from "vitest";
import type { Quake } from "../types";
import {
  fitGutenbergRichter,
  annualRate,
  returnPeriod,
  magnitudeForReturnPeriod,
} from "./gutenbergRichter";
import { gkRadiusKm, gkWindowDays } from "./declustering";
import {
  haversineKm,
  poissonAtLeastOne,
  energyJoules,
  tntTons,
  linspace,
  quantile,
} from "./stats";
import { mmiToPga, pgaToMmi, pgaToG, hypocentralKm } from "./intensity";
import { bathExpectation } from "./omori";

const DAY = 86_400_000;

/** Catálogo sintético determinista con b = 1 exacto (cuantiles de la exponencial). */
function syntheticCatalog(b: number, mc: number, n: number): Quake[] {
  return Array.from({ length: n }, (_, i) => {
    const u = (i + 0.5) / n;
    return { mag: mc - Math.log10(u) / b, time: i * DAY } as unknown as Quake;
  });
}

describe("Gutenberg–Richter (Aki 1965)", () => {
  it("recupera b≈1 de un catálogo con b=1", () => {
    const fit = fitGutenbergRichter(syntheticCatalog(1, 4, 5000), {
      mc: 4,
      dM: 0,
    })!;
    expect(fit.b).toBeCloseTo(1, 1);
    expect(fit.n).toBe(5000);
  });
  it("tasa anual y periodo de retorno son inversos y consistentes", () => {
    const fit = fitGutenbergRichter(syntheticCatalog(1, 4, 5000), {
      mc: 4,
      dM: 0,
    })!;
    expect(returnPeriod(fit, 6)).toBeCloseTo(1 / annualRate(fit, 6), 10);
    expect(annualRate(fit, 5) / annualRate(fit, 6)).toBeCloseTo(10 ** fit.b, 8);
    const m = magnitudeForReturnPeriod(fit, 100);
    expect(returnPeriod(fit, m)).toBeCloseTo(100, 6);
  });
  it("devuelve null con muy pocos eventos", () => {
    expect(fitGutenbergRichter(syntheticCatalog(1, 4, 10))).toBeNull();
  });
});

describe("Gardner & Knopoff (1974)", () => {
  it("M5: ~40 km y ~144 días (ajuste exponencial de la tabla, tabla original ~155 d)", () => {
    expect(gkRadiusKm(5)).toBeCloseTo(40, 0);
    expect(gkWindowDays(5)).toBeCloseTo(143.7, 0);
  });
  it("ventanas crecen con la magnitud", () => {
    expect(gkWindowDays(7)).toBeGreaterThan(gkWindowDays(6));
    expect(gkRadiusKm(7)).toBeGreaterThan(gkRadiusKm(6));
  });
});

describe("stats", () => {
  it("haversine: 1° de longitud en el ecuador ≈ 111.2 km", () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 1);
  });
  it("Poisson: P(≥1) = 1 − e^−λ", () => {
    expect(poissonAtLeastOne(1)).toBeCloseTo(1 - Math.exp(-1), 12);
    expect(poissonAtLeastOne(0)).toBe(0);
    expect(poissonAtLeastOne(-1)).toBe(0);
  });
  it("energía: log E = 1.5M + 4.8 y cada grado ≈ 31.6×", () => {
    expect(energyJoules(6)).toBeCloseTo(10 ** 13.8, -10);
    expect(energyJoules(7) / energyJoules(6)).toBeCloseTo(10 ** 1.5, 8);
    expect(tntTons(6)).toBeCloseTo(10 ** 13.8 / 4.184e9, 3);
  });
  it("linspace y quantile", () => {
    expect(linspace(0, 1, 5)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });
});

describe("intensidad (Worden et al. 2012)", () => {
  it("MMI↔PGA es reversible en ambos tramos", () => {
    for (const mmi of [3, 5, 7, 9])
      expect(pgaToMmi(mmiToPga(mmi))).toBeCloseTo(mmi, 6);
  });
  it("PGA a g y distancia hipocentral", () => {
    expect(pgaToG(980.665)).toBe(1);
    expect(hypocentralKm(30, 40)).toBe(50);
  });
});

describe("Båth", () => {
  it("réplica mayor ≈ M − 1.2", () => {
    expect(bathExpectation(7.5)).toBe(6.3);
  });
});

import { describe, expect, it } from "vitest";
import {
  SITE_CLASSES,
  buildResponseSpectrum,
  buildSyntheticWaveform,
  estimateWaveArrivals,
  inferTectonicRegime,
  radiusForMmi,
  seismicMomentNm,
  siteClassById,
} from "./intensity";
import { fitGutenbergRichter, returnPeriod } from "./gutenbergRichter";
import { DEFAULT_COMPLETENESS, fitWeichert } from "./completeness";
import { decluster } from "./declustering";
import { bathExpectation, fitOmori } from "./omori";
import { calibrateEtas, etasExpected } from "./etas";
import { normalCdf, sitePsha } from "./psha";
import { DAY_MS } from "./stats";
import type { Quake } from "../types";

describe("radiusForMmi", () => {
  it("devuelve 0 km cuando ni siquiera en el epicentro se alcanza la intensidad objetivo", () => {
    expect(radiusForMmi(4.0, 8, 50)).toBe(0);
  });

  it("calcula radios crecientes para umbrales de MMI menores en un sismo fuerte", () => {
    const r7 = radiusForMmi(7.5, 7, 15);
    const r5 = radiusForMmi(7.5, 5, 15);
    expect(r7).toBeGreaterThan(10);
    expect(r5).toBeGreaterThan(r7);
  });
});

describe("seismicMomentNm", () => {
  it("crece ~31.6 veces por cada grado de magnitud", () => {
    const m6 = seismicMomentNm(6);
    const m7 = seismicMomentNm(7);
    expect(m7 / m6).toBeCloseTo(10 ** 1.5, 1);
  });
});

describe("SITE_CLASSES", () => {
  it("define amplificación creciente desde roca firme hasta arcilla lacustre", () => {
    expect(Object.keys(SITE_CLASSES).length).toBe(4);
    expect(siteClassById("rock").deltaMmi).toBe(0);
    expect(siteClassById("lacustrine").deltaMmi).toBeGreaterThan(
      siteClassById("soft").deltaMmi,
    );
  });
});

describe("inferTectonicRegime", () => {
  it("identifica intraplaca profunda (slab) cuando depth > 70 km", () => {
    const r = inferTectonicRegime({
      mag: 6.2,
      depth: 150,
      tsunami: false,
    });
    expect(r.style).toBe("intraslab");
  });
});

describe("estimateWaveArrivals & buildSyntheticWaveform", () => {
  it("calcula llegadas P < S < superficiales y ventana S-P positiva", () => {
    const arr = estimateWaveArrivals(120, 25);
    expect(arr.pSec).toBeGreaterThan(10);
    expect(arr.sSec).toBeGreaterThan(arr.pSec);
    expect(arr.surfaceSec).toBeGreaterThan(arr.sSec);
    expect(arr.warningLeadSec).toBeCloseTo(arr.sSec - arr.pSec, 5);
  });

  it("genera una forma de onda normalizada determinista con marcadores P y S", () => {
    const w = buildSyntheticWaveform(6.8, 90, 20, 0.75, 100);
    expect(w.samples).toHaveLength(100);
    expect(w.pRatio).toBeLessThan(w.sRatio);
    const peak = Math.max(...w.samples.map((x) => Math.abs(x)));
    expect(peak).toBeCloseTo(1, 5);
  });
});

describe("Modelos estadísticos del catálogo (G–R, Weichert, G–K, Omori, ETAS, PSHA)", () => {
  const syntheticCatalog: Quake[] = Array.from({ length: 60 }, (_, i) => {
    // Distribución exponencial sintética con b ≈ 1.0 desde M4.5
    const u = ((i + 0.5) / 60) * 0.98;
    const mag = +(4.5 - Math.log10(1 - u)).toFixed(2);
    return {
      id: `syn-${i}`,
      time: Date.UTC(2015, 0, 1) + i * 30 * DAY_MS,
      mag,
      magType: "mw",
      depth: 25,
      lat: 4.6 + (i % 5) * 0.05,
      lon: -74.1 + (i % 5) * 0.05,
      place: "Zona Andina",
      tsunami: false,
      url: "",
      source: "USGS",
    };
  });

  it("ajusta Gutenberg–Richter (Aki 1965) y recupera b ≈ 1", () => {
    const gr = fitGutenbergRichter(syntheticCatalog, { mc: 4.5 });
    expect(gr).not.toBeNull();
    expect(gr!.b).toBeGreaterThan(0.75);
    expect(gr!.b).toBeLessThan(1.35);
    expect(returnPeriod(gr!, 6)).toBeGreaterThan(returnPeriod(gr!, 5));
  });

  it("ajusta Weichert (1980) sobre bandas de completitud", () => {
    const wf = fitWeichert(syntheticCatalog, 4.5, DEFAULT_COMPLETENESS);
    expect(wf).not.toBeNull();
    expect(wf!.b).toBeGreaterThan(0.7);
    expect(wf!.rate).toBeGreaterThan(0);
  });

  it("desagrupa réplicas con ventanas de Gardner & Knopoff (1974)", () => {
    const t0 = Date.UTC(2024, 0, 1);
    const seqCatalog: Quake[] = [
      {
        id: "main",
        time: t0,
        mag: 7.0,
        magType: "mww",
        depth: 20,
        lat: -20,
        lon: -70,
        place: "Mainshock",
        tsunami: false,
        url: "",
        source: "USGS",
      },
      {
        id: "aft-1",
        time: t0 + 2 * DAY_MS,
        mag: 5.5,
        magType: "mww",
        depth: 22,
        lat: -20.05,
        lon: -70.05,
        place: "Aftershock",
        tsunami: false,
        url: "",
        source: "USGS",
      },
    ];
    const dec = decluster(seqCatalog);
    expect(dec.roles.get("main")).toBe("principal");
    expect(dec.roles.get("aft-1")).toBe("replica");
    expect(dec.clustered).toHaveLength(1);
  });

  it("ajusta Omori–Utsu por máxima verosimilitud y cumple la ley de Båth", () => {
    const days = [
      0.05, 0.12, 0.25, 0.5, 0.9, 1.4, 2.2, 3.5, 5.8, 9.0, 14.0, 22.0,
    ];
    const fit = fitOmori(days, 30);
    expect(fit).not.toBeNull();
    expect(fit!.p).toBeGreaterThan(0.6);
    expect(fit!.K).toBeGreaterThan(0);
    expect(bathExpectation(7.2)).toBe(6.0);
  });

  it("calibra ETAS temporal y calcula sismicidad esperada", () => {
    const params = calibrateEtas(syntheticCatalog, {
      mc: 4.5,
      backgroundRatePerDay: 0.02,
      branching: 0.35,
    });
    const exp30 = etasExpected(
      params,
      syntheticCatalog,
      syntheticCatalog[syntheticCatalog.length - 1].time + DAY_MS,
      30,
    );
    expect(exp30).toBeGreaterThan(0);
  });

  it("calcula PSHA puntual (475 y 2475 años) y CDF normal estándar", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    const psha = sitePsha(
      {
        id: "bogota",
        name: "Bogotá",
        country: "Colombia",
        lat: 4.61,
        lon: -74.08,
        popK: 8000,
      },
      syntheticCatalog,
      { mc: 4.5, b: 1.0, mmax: 7.5, years: 10 },
    );
    expect(psha).not.toBeNull();
    expect(psha!.mmi2475).toBeGreaterThanOrEqual(psha!.mmi475);
    expect(psha!.deagg.length).toBeGreaterThan(0);
  });

  it("construye espectro de respuesta elástico Sa(T) al 5% y refleja amplificación en suelo blando", () => {
    const rockSpec = buildResponseSpectrum(7.5, 45, "rock");
    const lacustrineSpec = buildResponseSpectrum(7.5, 45, "lacustrine");
    expect(rockSpec.points.length).toBeGreaterThan(15);
    expect(rockSpec.sdsG).toBeGreaterThan(rockSpec.pgaG);
    expect(lacustrineSpec.sdsG).toBeGreaterThan(rockSpec.sdsG);
    expect(lacustrineSpec.tsSec).toBeGreaterThan(rockSpec.tsSec);
    expect(lacustrineSpec.resonance.highRiseG).toBeGreaterThan(
      rockSpec.resonance.highRiseG,
    );
  });
});


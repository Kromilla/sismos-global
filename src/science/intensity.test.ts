import { describe, expect, it } from "vitest";
import {
  SITE_CLASSES,
  inferTectonicRegime,
  radiusForMmi,
  seismicMomentNm,
  siteClassById,
} from "./intensity";

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

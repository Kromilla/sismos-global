import { describe, it, expect } from "vitest";
import { CITIES } from "../data/cities";
import {
  IPE_MODELS,
  DEFAULT_IPE,
  hypocentralKm,
  mmiLevel,
  mmiRoman,
  mmiToPga,
  pgaToG,
  radiusForMmi,
} from "../science/intensity";
import { haversineKm } from "../science/stats";

describe("Intensity calculation tests", () => {
  const roncesvallesQuake = {
    mag: 4.4,
    depth: 10,
    lat: 3.8692,
    lon: -75.74,
  };

  it("calcula correctamente la intensidad epicentral máxima (MMI V)", () => {
    const ipe = IPE_MODELS[DEFAULT_IPE];
    const epicentralRhypo = hypocentralKm(0, roncesvallesQuake.depth);
    const epicentralMmi = ipe.mmi(roncesvallesQuake.mag, epicentralRhypo);

    expect(epicentralMmi).toBeGreaterThanOrEqual(5.0);
    expect(mmiRoman(epicentralMmi)).toBe("V");
    expect(mmiLevel(epicentralMmi).label).toBe("Poco fuerte");
  });

  it("identifica ciudades cercanas afectadas en Colombia para el sismo de Roncesvalles", () => {
    const ipe = IPE_MODELS[DEFAULT_IPE];
    const rows = CITIES.map((city) => {
      const distKm = haversineKm(
        roncesvallesQuake.lat,
        roncesvallesQuake.lon,
        city.lat,
        city.lon,
      );
      const rhypoKm = hypocentralKm(distKm, roncesvallesQuake.depth);
      const mmi = ipe.mmi(roncesvallesQuake.mag, rhypoKm);
      return {
        city: city.name,
        distKm,
        mmi,
        label: mmiLevel(mmi).label,
      };
    })
      .filter((r) => r.mmi >= 1.5)
      .sort((a, b) => b.mmi - a.mmi);

    expect(rows.length).toBeGreaterThan(0);
    const names = rows.map((r) => r.city);
    expect(names).toContain("Roncesvalles");
    expect(names).toContain("Chaparral");
    expect(names).toContain("Tuluá");
  });

  it("calcula aceleración PGA y fracción de gravedad en la calculadora por distancia", () => {
    const ipe = IPE_MODELS[DEFAULT_IPE];
    const distKm = 30;
    const rhypoKm = hypocentralKm(distKm, roncesvallesQuake.depth);
    const mmi = ipe.mmi(roncesvallesQuake.mag, rhypoKm);
    const pga = mmiToPga(mmi);
    const gFraction = pgaToG(pga);

    expect(mmi).toBeGreaterThan(3.0);
    expect(pga).toBeGreaterThan(0);
    expect(gFraction).toBeGreaterThan(0);
    expect(Number.isFinite(pga)).toBe(true);
  });

  it("calcula radios de isosistas de percepción", () => {
    const ipe = IPE_MODELS[DEFAULT_IPE];
    const iso4km = radiusForMmi(roncesvallesQuake.mag, 4, roncesvallesQuake.depth, ipe.mmi);
    expect(iso4km).toBeGreaterThan(1);
    expect(iso4km).toBeLessThan(100);
  });

  it("acota físicamente micro-sismos (M < 2.0) a MMI I (No sentido) sin radios falsos", () => {
    const ipe = IPE_MODELS[DEFAULT_IPE];
    const microQuake = { mag: 1.7, depth: 2 };
    const rhypo = hypocentralKm(0, microQuake.depth);
    const mmi = ipe.mmi(microQuake.mag, rhypo);

    expect(mmi).toBe(1.0);
    expect(mmiRoman(mmi)).toBe("I");
    expect(mmiLevel(mmi).label).toBe("No sentido");

    // No debe devolver radios positivos de percepción (MMI III+) para un micro-sismo imperceptible
    const iso3km = radiusForMmi(microQuake.mag, 3, microQuake.depth, ipe.mmi);
    expect(iso3km).toBe(0);
  });
});

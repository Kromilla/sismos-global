import { describe, expect, it } from "vitest";
import { radiusForMmi } from "./intensity";

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

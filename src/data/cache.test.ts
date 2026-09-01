import { describe, it, expect } from "vitest";
import { cacheKey } from "./cache";

describe("cacheKey", () => {
  it("debería generar una clave única para una consulta", () => {
    const q = {
      startTime: 1609459200000,
      endTime: 1609545600000,
      minMag: 4.5,
      bbox: { minLat: -10, maxLat: 10, minLon: -20, maxLon: 20 },
    };
    const bucketMs = 86400000; // 1 día
    const key = cacheKey(q, bucketMs, "USGS");

    expect(key).toBe("USGS|-10,10,-20,20|4.5|2021-01-01|18629");
  });
});

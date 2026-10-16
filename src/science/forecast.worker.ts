import { ALL_REGIONS, inBbox } from "../data/regions";
import type { Quake } from "../types";
import { buildRegionForecast, type RegionForecast } from "./forecast";

interface ForecastWorkerRequest {
  id: number;
  quakes: Quake[];
  now: number;
}

self.onmessage = (e: MessageEvent<ForecastWorkerRequest>) => {
  const { id, quakes, now } = e.data;
  try {
    const out: RegionForecast[] = [];
    for (const region of ALL_REGIONS) {
      const subset = quakes.filter((q) => inBbox(q.lat, q.lon, region.bbox));
      const f = buildRegionForecast(region, subset, now);
      if (f) out.push(f);
    }
    out.sort((a, b) => b.score - a.score);
    self.postMessage({ id, ranking: out });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};

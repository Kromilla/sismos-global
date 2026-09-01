import type { Quake } from "../types";
import type { City } from "../data/cities";
import { DAY_MS, YEAR_DAYS, clamp, haversineKm } from "./stats";
import {
  DEFAULT_IPE,
  IPE_MODELS,
  hypocentralKm,
  mmiToPga,
  type IpeId,
} from "./intensity";

/** Φ(x): función de distribución normal estándar (Abramowitz & Stegun 7.1.26). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export interface PshaOptions {
  /** Magnitud de completitud del catálogo fuente. */
  mc: number;
  /** Pendiente b de Gutenberg–Richter. */
  b: number;
  /** Magnitud máxima creíble de la zona. */
  mmax: number;
  /** Años que cubre el catálogo (para pasar conteos a tasas). */
  years: number;
  /** Radio de influencia considerado. */
  maxDistKm?: number;
  /** Ecuación de predicción de intensidad a usar. */
  ipe?: IpeId;
  /** Corrección de sesgo en unidades de MMI, medida contra intensidad observada. */
  bias?: number;
  /**
   * Años de observación completos para una magnitud dada. Sin esto, un evento
   * antiguo y uno reciente pesarían igual pese a venir de ventanas distintas.
   */
  periodYears?: (mag: number) => number;
}

export interface HazardPoint {
  mmi: number;
  /** Tasa anual de excedencia. */
  annualRate: number;
  /** Probabilidad de excedencia en 50 años. */
  p50y: number;
  /** Periodo de retorno en años. */
  returnPeriod: number;
  /** PGA equivalente en fracción de g. */
  pgaG: number;
}

export interface DeaggBin {
  magBin: number;
  distBin: number;
  contribution: number;
}

export interface PshaResult {
  site: City;
  curve: HazardPoint[];
  /** MMI con 10% de probabilidad de excedencia en 50 años (retorno 475 años). */
  mmi475: number;
  /** MMI con 2% en 50 años (retorno 2475 años). */
  mmi2475: number;
  pga475G: number;
  pga2475G: number;
  /** Número de fuentes puntuales usadas. */
  sources: number;
  /** Desagregación de la amenaza para MMI VI. */
  deagg: DeaggBin[];
  /** Máxima intensidad histórica estimada en el sitio y el sismo que la produjo. */
  historicMax: { mmi: number; quake: Quake } | null;
}

const MMI_LEVELS = Array.from({ length: 41 }, (_, i) => 2 + i * 0.25);

/**
 * PSHA puntual con fuentes puntuales tomadas del catálogo desagrupado
 * (sismicidad suavizada elemental): cada evento independiente aporta una tasa
 * 1/años en su ubicación, repartida en magnitudes según G–R truncada.
 */
export function sitePsha(
  site: City,
  backgroundQuakes: Quake[],
  opts: PshaOptions,
): PshaResult | null {
  const maxDist = opts.maxDistKm ?? 400;
  const ipe = IPE_MODELS[opts.ipe ?? DEFAULT_IPE];
  const bias = opts.bias ?? 0;
  const { mc, b, mmax, years } = opts;
  if (!(years > 0) || !(b > 0) || mmax <= mc) return null;

  const sources = backgroundQuakes
    .filter((q) => q.mag >= mc)
    .map((q) => ({ q, dist: haversineKm(site.lat, site.lon, q.lat, q.lon) }))
    .filter((s) => s.dist <= maxDist);
  if (sources.length < 5) return null;

  const dM = 0.1;
  const nBins = Math.max(1, Math.round((mmax - mc) / dM));
  const norm = 10 ** (-b * mc) - 10 ** (-b * mmax);
  const magBins = Array.from({ length: nBins }, (_, i) => {
    const m1 = mc + i * dM;
    const m2 = m1 + dM;
    return {
      mag: m1 + dM / 2,
      weight: (10 ** (-b * m1) - 10 ** (-b * m2)) / norm,
    };
  });

  const periodYears = opts.periodYears ?? (() => years);
  const rates = new Float64Array(MMI_LEVELS.length);
  const deagg = new Map<string, number>();
  const deaggTarget = 6;

  for (const s of sources) {
    const r = hypocentralKm(s.dist, s.q.depth);
    // Cada evento aporta 1 / (años en que su magnitud fue observable).
    const nu = 1 / Math.max(periodYears(s.q.mag), 0.5);
    // σ depende de la distancia en Allen et al. (2012); es constante en la IPE de 2007.
    const sigma = ipe.sigma(r);
    for (const mb of magBins) {
      const med = ipe.mmi(mb.mag, r) + bias;
      const w = nu * mb.weight;
      for (let i = 0; i < MMI_LEVELS.length; i++) {
        const pExceed = 1 - normalCdf((MMI_LEVELS[i] - med) / sigma);
        if (pExceed > 1e-9) rates[i] += w * pExceed;
      }
      const pTarget = 1 - normalCdf((deaggTarget - med) / sigma);
      if (pTarget > 1e-6) {
        const magBin = Math.floor(mb.mag * 2) / 2;
        const distBin = Math.floor(s.dist / 50) * 50;
        const key = `${magBin}|${distBin}`;
        deagg.set(key, (deagg.get(key) ?? 0) + w * pTarget);
      }
    }
  }

  const curve: HazardPoint[] = MMI_LEVELS.map((mmi, i) => {
    const annualRate = rates[i];
    return {
      mmi,
      annualRate,
      p50y: 1 - Math.exp(-annualRate * 50),
      returnPeriod: annualRate > 0 ? 1 / annualRate : Infinity,
      pgaG: mmiToPga(mmi) / 980.665,
    };
  });

  const mmiForRate = (target: number): number => {
    for (let i = 0; i < curve.length - 1; i++) {
      const a = curve[i];
      const c = curve[i + 1];
      if (a.annualRate >= target && c.annualRate <= target) {
        const la = Math.log(Math.max(a.annualRate, 1e-12));
        const lc = Math.log(Math.max(c.annualRate, 1e-12));
        const lt = Math.log(target);
        const f = (la - lt) / (la - lc || 1);
        return a.mmi + f * (c.mmi - a.mmi);
      }
    }
    return curve[0].annualRate < target ? NaN : curve[curve.length - 1].mmi;
  };

  const mmi475 = clamp(mmiForRate(1 / 475), 1, 12);
  const mmi2475 = clamp(mmiForRate(1 / 2475), 1, 12);

  let historicMax: PshaResult["historicMax"] = null;
  for (const s of sources) {
    const mmi = ipe.mmi(s.q.mag, hypocentralKm(s.dist, s.q.depth)) + bias;
    if (!historicMax || mmi > historicMax.mmi)
      historicMax = { mmi, quake: s.q };
  }

  const totalDeagg = [...deagg.values()].reduce((a, x) => a + x, 0) || 1;
  const deaggRows: DeaggBin[] = [...deagg.entries()]
    .map(([k, v]) => {
      const [magBin, distBin] = k.split("|").map(Number);
      return { magBin, distBin, contribution: v / totalDeagg };
    })
    .sort((a, b2) => b2.contribution - a.contribution);

  return {
    site,
    curve,
    mmi475,
    mmi2475,
    pga475G: mmiToPga(mmi475) / 980.665,
    pga2475G: mmiToPga(mmi2475) / 980.665,
    sources: sources.length,
    deagg: deaggRows,
    historicMax,
  };
}

export interface ScenarioImpact {
  city: City;
  distKm: number;
  mmi: number;
  pgaG: number;
  /** Población expuesta a esa intensidad, en miles. */
  popK: number;
}

/** Intensidad esperada en cada ciudad para un sismo hipotético. */
export function scenarioShaking(
  scenario: { lat: number; lon: number; depth: number; mag: number },
  cities: City[],
  ipeId: IpeId = DEFAULT_IPE,
  bias = 0,
): ScenarioImpact[] {
  const ipe = IPE_MODELS[ipeId];
  return cities
    .map((city) => {
      const dist = haversineKm(scenario.lat, scenario.lon, city.lat, city.lon);
      const mmi =
        ipe.mmi(scenario.mag, hypocentralKm(dist, scenario.depth)) + bias;
      return {
        city,
        distKm: dist,
        mmi,
        pgaG: mmiToPga(mmi) / 980.665,
        popK: city.popK,
      };
    })
    .filter((r) => r.mmi >= 2)
    .sort((a, b) => b.mmi - a.mmi);
}

/** Intensidad histórica máxima sentida en una ciudad, evento por evento. */
export function historicIntensity(
  city: City,
  quakes: Quake[],
  topN = 10,
  ipeId: IpeId = DEFAULT_IPE,
  bias = 0,
) {
  const ipe = IPE_MODELS[ipeId];
  return quakes
    .map((q) => {
      const dist = haversineKm(city.lat, city.lon, q.lat, q.lon);
      return {
        quake: q,
        distKm: dist,
        mmi: ipe.mmi(q.mag, hypocentralKm(dist, q.depth)) + bias,
      };
    })
    .filter((r) => r.mmi >= 3)
    .sort((a, b) => b.mmi - a.mmi)
    .slice(0, topN);
}

export function yearsOf(quakes: Quake[]): number {
  if (quakes.length < 2) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const q of quakes) {
    if (q.time < min) min = q.time;
    if (q.time > max) max = q.time;
  }
  return (max - min) / DAY_MS / YEAR_DAYS;
}

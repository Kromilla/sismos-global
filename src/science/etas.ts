import type { Quake } from "../types";
import { DAY_MS, clamp, poissonAtLeastOne } from "./stats";

export interface EtasParams {
  /** Tasa de fondo (eventos M >= Mc por día). */
  mu: number;
  /** Productividad base. */
  K0: number;
  /** Escala de productividad con la magnitud. */
  alpha: number;
  /** Exponente de Omori. */
  p: number;
  /** Tiempo característico en días. */
  c: number;
  /** Magnitud de referencia (completitud). */
  mc: number;
  /** Razón de ramificación media estimada del catálogo. */
  branching: number;
}

export const ETAS_DEFAULTS = { alpha: 0.8, p: 1.1, c: 0.01 };

function integral(t1: number, t2: number, c: number, p: number): number {
  if (t2 <= t1) return 0;
  if (Math.abs(p - 1) < 1e-6) return Math.log((t2 + c) / (t1 + c));
  return ((t2 + c) ** (1 - p) - (t1 + c) ** (1 - p)) / (1 - p);
}

/**
 * Calibra un ETAS temporal simplificado.
 *
 * La productividad K0 se fija para que el número medio de réplicas directas
 * por evento reproduzca la razón de ramificación observada (fracción de
 * eventos dependientes tras desagrupar). Es una calibración de primer orden,
 * no una máxima verosimilitud completa del ETAS.
 */
export function calibrateEtas(
  quakes: Quake[],
  opts: {
    mc: number;
    /** Tasa de fondo diaria M >= Mc (del catálogo desagrupado). */
    backgroundRatePerDay: number;
    branching: number;
    p?: number;
    c?: number;
    alpha?: number;
  },
): EtasParams {
  const alpha = opts.alpha ?? ETAS_DEFAULTS.alpha;
  // p <= 1 hace divergente la productividad total: lo acotamos por arriba de 1.
  const p = clamp(opts.p ?? ETAS_DEFAULTS.p, 1.03, 2);
  const c = clamp(opts.c ?? ETAS_DEFAULTS.c, 1e-4, 5);
  const branching = clamp(opts.branching, 0, 0.9);

  const above = quakes.filter((q) => q.mag >= opts.mc);
  let sumScale = 0;
  for (const q of above) sumScale += 10 ** (alpha * (q.mag - opts.mc));
  const meanScale = above.length ? sumScale / above.length : 1;
  const totalIntegral = c ** (1 - p) / (p - 1);
  const K0 = totalIntegral > 0 ? branching / (meanScale * totalIntegral) : 0;

  return {
    mu: opts.backgroundRatePerDay,
    K0,
    alpha,
    p,
    c,
    mc: opts.mc,
    branching,
  };
}

/** Tasa instantánea de eventos M >= Mc por día, en el instante `at`. */
export function etasRate(
  params: EtasParams,
  quakes: Quake[],
  at: number,
): number {
  let rate = params.mu;
  for (const q of quakes) {
    if (q.time >= at || q.mag < params.mc) continue;
    const dt = (at - q.time) / DAY_MS;
    rate +=
      params.K0 *
      10 ** (params.alpha * (q.mag - params.mc)) *
      (dt + params.c) ** -params.p;
  }
  return rate;
}

/**
 * Número esperado de eventos M >= Mc en la ventana [from, from + días].
 * Suma el fondo, el disparo directo de la sismicidad pasada y una corrección
 * de cascada 1/(1 − n) por réplicas de réplicas.
 */
export function etasExpected(
  params: EtasParams,
  quakes: Quake[],
  from: number,
  horizonDays: number,
): number {
  let triggered = 0;
  for (const q of quakes) {
    if (q.time >= from || q.mag < params.mc) continue;
    const t1 = (from - q.time) / DAY_MS;
    triggered +=
      params.K0 *
      10 ** (params.alpha * (q.mag - params.mc)) *
      integral(t1, t1 + horizonDays, params.c, params.p);
  }
  const cascade = 1 / Math.max(1 - params.branching, 0.15);
  return (params.mu * horizonDays + triggered) * cascade;
}

/** Escala el conteo esperado de M >= Mc hacia M >= m usando Gutenberg–Richter. */
export function scaleToMagnitude(
  expectedAtMc: number,
  b: number,
  mc: number,
  m: number,
): number {
  return expectedAtMc * 10 ** (-b * (m - mc));
}

export interface EtasForecastCell {
  horizonDays: number;
  mag: number;
  expected: number;
  probability: number;
}

export function etasForecast(
  params: EtasParams,
  quakes: Quake[],
  from: number,
  horizons: number[],
  mags: number[],
  b: number,
): EtasForecastCell[] {
  const out: EtasForecastCell[] = [];
  for (const h of horizons) {
    const base = etasExpected(params, quakes, from, h);
    for (const m of mags) {
      const expected = scaleToMagnitude(base, b, params.mc, m);
      out.push({
        horizonDays: h,
        mag: m,
        expected,
        probability: poissonAtLeastOne(expected),
      });
    }
  }
  return out;
}

import { clamp } from "./stats";

/**
 * Ecuación de predicción de intensidad (IPE) de Atkinson & Wald (2007),
 * coeficientes de California. Devuelve MMI a partir de la magnitud y la
 * distancia hipocentral.
 *
 * Advertencia: no está recalibrada para la subducción andina ni para el
 * Caribe; en zonas de slab profundo tiende a sobreestimar. Se usa como
 * modelo transparente y comparable entre zonas, no como norma de diseño.
 */
export function mmiAtkinsonWald(mag: number, distKm: number): number {
  const c1 = 12.27;
  const c2 = 2.27;
  const c3 = 0.1304;
  const c4 = -1.3;
  const c5 = -0.000707;
  const c6 = 1.95;
  const c7 = -0.577;
  const rt = 30;

  const r = Math.max(distKm, 1);
  const logR = Math.log10(r);
  const b = Math.max(Math.log10(r / rt), 0);
  const mmi =
    c1 +
    c2 * (mag - 6) +
    c3 * (mag - 6) ** 2 +
    c4 * logR +
    c5 * r +
    c6 * b +
    c7 * mag * logR;
  return clamp(mmi, 1, 12);
}

/** Desviación estándar aleatoria típica de una IPE, en unidades de MMI. */
export const MMI_SIGMA = 0.7;

/** Distancia hipocentral a partir de la epicentral y la profundidad. */
export function hypocentralKm(epicentralKm: number, depthKm: number): number {
  return Math.sqrt(epicentralKm ** 2 + Math.max(depthKm, 0) ** 2);
}

/**
 * Conversión MMI → PGA (cm/s²) invirtiendo la relación de Worden et al. (2012).
 */
export function mmiToPga(mmi: number): number {
  if (mmi <= 4.22) return 10 ** ((mmi - 1.78) / 1.55);
  return 10 ** ((mmi + 1.6) / 3.7);
}

/** Conversión PGA (cm/s²) → MMI, Worden et al. (2012). */
export function pgaToMmi(pga: number): number {
  const lp = Math.log10(Math.max(pga, 1e-3));
  return clamp(lp < 1.57 ? 1.78 + 1.55 * lp : -1.6 + 3.7 * lp, 1, 12);
}

/** PGA expresada como fracción de g. */
export function pgaToG(pga: number): number {
  return pga / 980.665;
}

export interface MmiLevel {
  roman: string;
  label: string;
  perception: string;
  damage: string;
  color: string;
}

/** Escala de Mercalli Modificada resumida. */
export const MMI_SCALE: MmiLevel[] = [
  {
    roman: "I",
    label: "No sentido",
    perception: "Solo lo registran los sismógrafos.",
    damage: "Ninguno.",
    color: "#1e293b",
  },
  {
    roman: "II",
    label: "Muy leve",
    perception: "Lo notan personas en reposo, pisos altos.",
    damage: "Ninguno.",
    color: "#1e3a5f",
  },
  {
    roman: "III",
    label: "Leve",
    perception:
      "Como el paso de un camión; muchos no lo identifican como sismo.",
    damage: "Ninguno.",
    color: "#1d4ed8",
  },
  {
    roman: "IV",
    label: "Moderado",
    perception: "Sentido dentro de casas; vibran ventanas y vajilla.",
    damage: "Ninguno.",
    color: "#0891b2",
  },
  {
    roman: "V",
    label: "Poco fuerte",
    perception: "Sentido por casi todos; despierta a la gente.",
    damage: "Objetos caen, grietas finas en revoques.",
    color: "#22c55e",
  },
  {
    roman: "VI",
    label: "Fuerte",
    perception: "Todos lo sienten; muchos salen a la calle.",
    damage: "Daño leve: caída de repellos, chimeneas agrietadas.",
    color: "#facc15",
  },
  {
    roman: "VII",
    label: "Muy fuerte",
    perception: "Difícil mantenerse en pie.",
    damage:
      "Daño moderado en construcción corriente; grave en la mal construida.",
    color: "#f97316",
  },
  {
    roman: "VIII",
    label: "Destructivo",
    perception: "Pánico generalizado.",
    damage:
      "Colapso parcial de mampostería sin refuerzo; daño en estructuras normales.",
    color: "#ef4444",
  },
  {
    roman: "IX",
    label: "Ruinoso",
    perception: "Pánico total.",
    damage: "Estructuras desplazadas de cimientos; daño severo generalizado.",
    color: "#dc2626",
  },
  {
    roman: "X",
    label: "Desastroso",
    perception: "—",
    damage: "Colapso de muchas estructuras; rieles torcidos, deslizamientos.",
    color: "#b91c1c",
  },
  {
    roman: "XI",
    label: "Muy desastroso",
    perception: "—",
    damage: "Pocas estructuras quedan en pie; puentes destruidos.",
    color: "#a21caf",
  },
  {
    roman: "XII",
    label: "Catastrófico",
    perception: "—",
    damage: "Destrucción total; ondas visibles en el terreno.",
    color: "#7e22ce",
  },
];

export function mmiLevel(mmi: number): MmiLevel {
  return MMI_SCALE[clamp(Math.round(mmi) - 1, 0, 11)];
}

export function mmiRoman(mmi: number): string {
  return mmiLevel(mmi).roman;
}

export function mmiColor(mmi: number): string {
  return mmiLevel(mmi).color;
}

/** Radio aproximado (km) donde se alcanza cierta MMI, resolviendo la IPE. */
export function radiusForMmi(
  mag: number,
  targetMmi: number,
  depthKm = 10,
  ipe: (m: number, r: number) => number = mmiAllen2012,
): number {
  if (ipe(mag, hypocentralKm(0, depthKm)) < targetMmi) return 0;
  let lo = 0;
  let hi = 1500;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const mmi = ipe(mag, hypocentralKm(mid, depthKm));
    if (mmi > targetMmi) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * IPE de Allen, Wald & Worden (2012), variante de distancia hipocentral.
 *
 * Es global —no regional como Atkinson–Wald— y su dispersión depende de la
 * distancia, que es la forma correcta de propagar incertidumbre en un PSHA.
 * Coeficientes tomados de la implementación de referencia en OpenQuake
 * (`openquake/hazardlib/gsim/allen_2012_ipe.py`).
 */
const ALLEN = {
  c0: 2.085,
  c1: 1.428,
  c2: -1.402,
  c4: 0.078,
  m1: -0.209,
  m2: 2.042,
  s1: 0.82,
  s2: 0.37,
  s3: 22.9,
};

export function mmiAllen2012(mag: number, rhypoKm: number): number {
  const r = Math.max(rhypoKm, 1);
  const rm = ALLEN.m1 + ALLEN.m2 * Math.exp(mag - 5);
  let mmi =
    ALLEN.c0 + ALLEN.c1 * mag + ALLEN.c2 * Math.log(Math.sqrt(r * r + rm * rm));
  // Más allá de 50 km entra un término de atenuación anelástica.
  if (r > 50) mmi += ALLEN.c4 * Math.log(r / 50);
  return clamp(mmi, 1, 12);
}

/** Dispersión total de Allen et al. (2012): decrece con la distancia. */
export function allenSigma(rhypoKm: number): number {
  const r = Math.max(rhypoKm, 1);
  return ALLEN.s1 + ALLEN.s2 / (1 + (r / ALLEN.s3) ** 2);
}

export type IpeId = "allen2012" | "atkinsonWald2007";

export interface IpeModel {
  id: IpeId;
  name: string;
  reference: string;
  scope: string;
  /** MMI mediana para una magnitud y una distancia hipocentral en km. */
  mmi: (mag: number, rhypoKm: number) => number;
  /** Desviación estándar total en unidades de MMI. */
  sigma: (rhypoKm: number) => number;
}

export const IPE_MODELS: Record<IpeId, IpeModel> = {
  allen2012: {
    id: "allen2012",
    name: "Allen et al. (2012)",
    reference: "Allen, Wald & Worden (2012), J. Seismology 16:409–433",
    scope: "Global, corteza activa. σ decrece con la distancia.",
    mmi: mmiAllen2012,
    sigma: allenSigma,
  },
  atkinsonWald2007: {
    id: "atkinsonWald2007",
    name: "Atkinson & Wald (2007)",
    reference: "Atkinson & Wald (2007), Seismological Research Letters 78",
    scope: "Calibrada para California. σ fija de 0.7.",
    mmi: mmiAtkinsonWald,
    sigma: () => MMI_SIGMA,
  },
};

export const DEFAULT_IPE: IpeId = "allen2012";

/**
 * Longitud de ruptura subsuperficial (SRL) en km para fallas corticales,
 * según Wells & Coppersmith (1994). Válido para todos los mecanismos.
 */
export function wellsCoppersmithLength(mag: number): number {
  if (mag < 5.0) return 0;
  return 10 ** (-2.44 + 0.59 * mag);
}

/**
 * Momento sísmico escalar M0 en N·m según Hanks & Kanamori (1979):
 * log10(M0 [N·m]) = 1.5 * Mw + 9.05
 */
export function seismicMomentNm(mag: number): number {
  return 10 ** (1.5 * mag + 9.05);
}

export type SiteClassId = "rock" | "stiff" | "soft" | "lacustrine";

export interface SiteClass {
  id: SiteClassId;
  name: string;
  nameEn: string;
  vs30: number;
  /** Amplificación aditiva en unidades de MMI respecto a roca de referencia (760 m/s). */
  deltaMmi: number;
  description: string;
  descriptionEn: string;
}

/**
 * Clases de suelo NEHRP basadas en Vs30 y amplificación empírica (Borcherdt 1994 / Worden et al. 2012).
 */
export const SITE_CLASSES: Record<SiteClassId, SiteClass> = {
  rock: {
    id: "rock",
    name: "Roca firme (NEHRP B · Vs30 ≈ 760 m/s)",
    nameEn: "Firm rock (NEHRP B · Vs30 ≈ 760 m/s)",
    vs30: 760,
    deltaMmi: 0,
    description: "Referencia sin amplificación por sitio.",
    descriptionEn: "Reference rock condition without site amplification.",
  },
  stiff: {
    id: "stiff",
    name: "Suelo rígido (NEHRP C · Vs30 ≈ 450 m/s)",
    nameEn: "Stiff soil (NEHRP C · Vs30 ≈ 450 m/s)",
    vs30: 450,
    deltaMmi: 0.35,
    description: "Gravas densas o roca blanda meteorizada (+0.35 MMI).",
    descriptionEn: "Dense gravel or weathered soft rock (+0.35 MMI).",
  },
  soft: {
    id: "soft",
    name: "Suelo blando (NEHRP D · Vs30 ≈ 250 m/s)",
    nameEn: "Soft soil (NEHRP D · Vs30 ≈ 250 m/s)",
    vs30: 250,
    deltaMmi: 0.75,
    description: "Sedimentos aluviales profundos (+0.75 MMI).",
    descriptionEn: "Deep alluvial sediments (+0.75 MMI).",
  },
  lacustrine: {
    id: "lacustrine",
    name: "Arcilla lacustre (NEHRP E · Vs30 ≈ 150 m/s)",
    nameEn: "Lacustrine clay (NEHRP E · Vs30 ≈ 150 m/s)",
    vs30: 150,
    deltaMmi: 1.25,
    description: "Cuencas lacustres blandas como Bogotá o CDMX (+1.25 MMI).",
    descriptionEn: "Very soft lacustrine basins like Bogotá or Mexico City (+1.25 MMI).",
  },
};

export const SITE_CLASSES_LIST: SiteClass[] = Object.values(SITE_CLASSES);

export function siteClassById(id: SiteClassId): SiteClass {
  return SITE_CLASSES[id] ?? SITE_CLASSES.rock;
}

export type FocalStyle = "thrust" | "normal" | "strike-slip" | "intraslab";

export interface TectonicRegimeInfo {
  style: FocalStyle;
  labelEs: string;
  labelEn: string;
  mechanismEs: string;
  mechanismEn: string;
  /** Rumbo (strike), buzamiento (dip) y deslizamiento (rake) representativos en grados. */
  nodalPlane: { strike: number; dip: number; rake: number };
}

/**
 * Infiere el régimen tectónico y el estilo focal dominante a partir de la
 * profundidad hipocentral, magnitud e indicador de tsunami.
 */
export function inferTectonicRegime(quake: {
  mag: number;
  depth: number;
  tsunami?: boolean;
}): TectonicRegimeInfo {
  if (quake.depth < 60 && (quake.tsunami || quake.mag >= 6.8)) {
    return {
      style: "thrust",
      labelEs: "Interplaca de subducción / compresivo",
      labelEn: "Subduction interplate / thrust",
      mechanismEs: "Falla inversa (cabalgamiento)",
      mechanismEn: "Reverse / megathrust fault",
      nodalPlane: { strike: 15, dip: 22, rake: 90 },
    };
  }
  if (quake.depth < 40) {
    return {
      style: "strike-slip",
      labelEs: "Cortical superficial",
      labelEn: "Shallow crustal",
      mechanismEs: "Transcurrente / cortical mixto",
      mechanismEn: "Strike-slip / mixed crustal",
      nodalPlane: { strike: 45, dip: 85, rake: 175 },
    };
  }
  if (quake.depth <= 300) {
    return {
      style: "intraslab",
      labelEs: "Intraplaca de losa subducida (Wadati–Benioff)",
      labelEn: "Subducted slab intraplate (Wadati–Benioff)",
      mechanismEs: "Extensión / tracción de losa (normal)",
      mechanismEn: "Slab-pull extension (normal)",
      nodalPlane: { strike: 180, dip: 50, rake: -90 },
    };
  }
  return {
    style: "normal",
    labelEs: "Manto de transición profundo (>300 km)",
    labelEn: "Deep mantle transition zone (>300 km)",
    mechanismEs: "Transformación de fase / compresión profunda",
    mechanismEn: "Phase transformation / deep slab compression",
    nodalPlane: { strike: 0, dip: 45, rake: -90 },
  };
}

export interface SpectralPoint {
  periodSec: number;
  saG: number;
  storiesApprox: number;
}

export interface BuildingResonance {
  lowRiseG: number;
  midRiseG: number;
  highRiseG: number;
  peakPeriodSec: number;
  peakSaG: number;
  vulnerableClassEs: string;
  vulnerableClassEn: string;
}

export interface ResponseSpectrum {
  points: SpectralPoint[];
  t0Sec: number;
  tsSec: number;
  pgaG: number;
  sdsG: number;
  sd1G: number;
  resonance: BuildingResonance;
}

const SITE_FACTORS: Record<SiteClassId, { fa: number; fv: number }> = {
  rock: { fa: 1.0, fv: 1.0 },
  stiff: { fa: 1.2, fv: 1.5 },
  soft: { fa: 1.45, fv: 2.0 },
  lacustrine: { fa: 1.75, fv: 2.8 },
};

const SPECTRUM_PERIODS = [
  0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1.0, 1.2, 1.4,
  1.6, 1.8, 2.0, 2.25, 2.5, 2.75, 3.0,
];

/**
 * Construye el espectro de respuesta elástico (5% de amortiguamiento crítico)
 * Sa(T) en unidades de g, estilo NEHRP / ASCE 7 / NSR-10, modulando los factores
 * de sitio Fa y Fv por Vs30 y el enriquecimiento de periodos largos por magnitud.
 */
export function buildResponseSpectrum(
  mag: number,
  rhypoKm: number,
  siteId: SiteClassId = "rock",
  ipe: (m: number, r: number) => number = mmiAllen2012,
): ResponseSpectrum {
  const mmiRock = ipe(mag, Math.max(1, rhypoKm));
  const pgaRockG = pgaToG(mmiToPga(mmiRock));
  const { fa, fv } = SITE_FACTORS[siteId] ?? SITE_FACTORS.rock;

  // Los sismos de gran magnitud (Mw > 6.5) enriquecen el contenido de periodo largo (T >= 1 s).
  const magLongFactor = clamp(0.65 + 0.22 * (mag - 5.5), 0.45, 1.65);

  const pgaG = pgaRockG * fa;
  const sdsG = 2.5 * pgaRockG * fa;
  const sd1G = 1.05 * pgaRockG * fv * magLongFactor;

  const tsSec = clamp(sd1G / Math.max(sdsG, 1e-6), 0.28, 1.85);
  const t0Sec = 0.2 * tsSec;

  const points: SpectralPoint[] = SPECTRUM_PERIODS.map((t) => {
    let saG: number;
    if (t <= 1e-6) {
      saG = pgaG;
    } else if (t < t0Sec) {
      saG = pgaG + (sdsG - pgaG) * (t / t0Sec);
    } else if (t <= tsSec) {
      saG = sdsG;
    } else {
      saG = sd1G / t;
    }
    return {
      periodSec: t,
      saG,
      storiesApprox: Math.max(1, Math.round(t * 10)),
    };
  });

  const saAt = (targetT: number) => {
    if (targetT <= t0Sec) {
      return pgaG + (sdsG - pgaG) * (targetT / Math.max(t0Sec, 1e-4));
    }
    if (targetT <= tsSec) return sdsG;
    return sd1G / targetT;
  };

  const lowRiseG = saAt(0.2); // ~1–3 pisos (T ≈ 0.2 s)
  const midRiseG = saAt(0.75); // ~5–10 pisos (T ≈ 0.75 s)
  const highRiseG = saAt(1.6); // ~12–20+ pisos (T ≈ 1.6 s)

  const shiftsToMidHigh = tsSec >= 0.65;
  const vulnerableClassEs =
    siteId === "lacustrine"
      ? "Edificios medianos y altos (7–20 pisos, T ≈ 0.7–1.8 s) por resonancia de cuenca"
      : shiftsToMidHigh
        ? "Pórticos de mediana altura (4–12 pisos, T ≈ 0.4–1.1 s)"
        : "Mampostería rígida y baja altura (1–3 pisos, T ≈ 0.1–0.3 s)";
  const vulnerableClassEn =
    siteId === "lacustrine"
      ? "Mid- to high-rise buildings (7–20 stories, T ≈ 0.7–1.8 s) due to basin resonance"
      : shiftsToMidHigh
        ? "Mid-rise frames (4–12 stories, T ≈ 0.4–1.1 s)"
        : "Stiff low-rise masonry (1–3 stories, T ≈ 0.1–0.3 s)";

  return {
    points,
    t0Sec,
    tsSec,
    pgaG,
    sdsG,
    sd1G,
    resonance: {
      lowRiseG,
      midRiseG,
      highRiseG,
      peakPeriodSec: Number(((t0Sec + tsSec) / 2).toFixed(2)),
      peakSaG: sdsG,
      vulnerableClassEs,
      vulnerableClassEn,
    },
  };
}

export interface WaveArrivals {
  pSec: number;
  sSec: number;
  surfaceSec: number;
  warningLeadSec: number;
}

/**
 * Estima los tiempos de llegada de las ondas P, S y superficiales (en segundos desde el origen)
 * usando velocidades efectivas de corteza/manto superior tipo IASP91.
 */
export function estimateWaveArrivals(
  rhypoKm: number,
  depthKm = 15,
): WaveArrivals {
  const r = Math.max(rhypoKm, 1);
  const mantleWeight = clamp((Math.max(depthKm, r * 0.25) - 35) / 250, 0, 1);
  const vp = 6.1 + 0.85 * mantleWeight; // 6.1 a 6.95 km/s
  const vs = 3.55 + 0.5 * mantleWeight; // 3.55 a 4.05 km/s
  const pSec = r / vp;
  const sSec = r / vs;
  const surfaceSec = r / 3.1;
  return {
    pSec,
    sSec,
    surfaceSec,
    warningLeadSec: Math.max(0, sSec - pSec),
  };
}

export interface SyntheticWaveform {
  samples: number[];
  durationSec: number;
  pRatio: number;
  sRatio: number;
}

/**
 * Genera una traza sintética determinista (envolvente de Saragoni–Hart / Boore)
 * modulada por magnitud, distancia hipocentral y amplificación de suelo (Vs30).
 */
export function buildSyntheticWaveform(
  mag: number,
  rhypoKm: number,
  depthKm = 15,
  siteDeltaMmi = 0,
  count = 140,
): SyntheticWaveform {
  const arrivals = estimateWaveArrivals(rhypoKm, depthKm);
  const codaDuration = Math.max(
    12,
    8 + (mag - 4) * 7 + siteDeltaMmi * 8 + rhypoKm * 0.05,
  );
  const prePad = Math.max(2, arrivals.pSec * 0.15);
  const durationSec = arrivals.sSec + codaDuration;
  const tStart = Math.max(0, arrivals.pSec - prePad);
  const totalWindow = Math.max(8, durationSec - tStart);

  const pRatio = clamp((arrivals.pSec - tStart) / totalWindow, 0.05, 0.75);
  const sRatio = clamp(
    (arrivals.sSec - tStart) / totalWindow,
    pRatio + 0.06,
    0.88,
  );

  const raw: number[] = [];
  let maxAbs = 1e-6;
  const tauP = Math.max(1.2, (arrivals.sSec - arrivals.pSec) * 0.45);
  const tauS = Math.max(2.5, (mag - 3.5) * 2.2 + siteDeltaMmi * 2.8);

  for (let i = 0; i < count; i++) {
    const u = i / Math.max(1, count - 1);
    const t = tStart + u * totalWindow;

    let env = 0.015;
    if (t >= arrivals.pSec) {
      const dtP = t - arrivals.pSec;
      env += 0.24 * (dtP / (0.35 + dtP)) * Math.exp(-dtP / tauP);
    }
    if (t >= arrivals.sSec) {
      const dtS = t - arrivals.sSec;
      const sEnv =
        1.0 * Math.pow(dtS / tauS, 0.65) * Math.exp(-dtS / (tauS * 1.15));
      env += sEnv * (1 + siteDeltaMmi * 0.25);
    }

    // Oscilación determinista multifrecuencia (onda P más aguda, S/coda más grave en suelo blando)
    const freqShift = t < arrivals.sSec ? 1.55 : 1.0 - siteDeltaMmi * 0.15;
    const carrier =
      0.52 * Math.sin(i * 1.73 * freqShift + mag) +
      0.33 * Math.sin(i * 3.17 * freqShift + depthKm * 0.1) +
      0.15 * Math.cos(i * 5.09 * freqShift);

    const val = env * carrier;
    raw.push(val);
    if (Math.abs(val) > maxAbs) maxAbs = Math.abs(val);
  }

  return {
    samples: raw.map((v) => v / maxAbs),
    durationSec: totalWindow,
    pRatio,
    sRatio,
  };
}

export type PagerAlertLevel = "green" | "yellow" | "orange" | "red";

export interface PagerExposureBin {
  roman: string;
  mmi: number;
  popK: number;
  color: string;
}

export interface PagerAssessment {
  level: PagerAlertLevel;
  color: string;
  labelEs: string;
  labelEn: string;
  summaryEs: string;
  summaryEn: string;
  bins: PagerExposureBin[];
  exposedMmi6PopK: number;
  exposedMmi8PopK: number;
  empiricalLossIndex: number;
}

function stdNormalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + 1.330274429 * t))));
  return z >= 0 ? 1 - p : p;
}

/**
 * Evaluación rápida de exposición poblacional y nivel de alerta humanitaria/económica
 * inspirada en el modelo empírico lognormal USGS PAGER de Jaiswal & Wald (2010):
 *   r(MMI) = Φ( (1 / β) * ln(MMI / θ) )
 * Agrupa la población expuesta de las ciudades de referencia en bandas MMI IV a IX+.
 */
export function estimatePagerImpact(
  cityImpacts: ReadonlyArray<{ mmi: number; popK: number }>,
  epicentralMmi = 1,
): PagerAssessment {
  const binDefs = [
    { roman: "IV", mmi: 4, lo: 3.5, hi: 4.5 },
    { roman: "V", mmi: 5, lo: 4.5, hi: 5.5 },
    { roman: "VI", mmi: 6, lo: 5.5, hi: 6.5 },
    { roman: "VII", mmi: 7, lo: 6.5, hi: 7.5 },
    { roman: "VIII", mmi: 8, lo: 7.5, hi: 8.5 },
    { roman: "IX+", mmi: 9, lo: 8.5, hi: 99 },
  ];

  const bins: PagerExposureBin[] = binDefs.map((b) => ({
    roman: b.roman,
    mmi: b.mmi,
    popK: 0,
    color: mmiColor(b.mmi),
  }));

  let exposedMmi6PopK = 0;
  let exposedMmi8PopK = 0;
  let expectedAffectedK = 0;

  // Parámetros empíricos tipo Jaiswal & Wald (2010) para tasa de daño/afectación severa
  const theta = 9.6;
  const beta = 0.21;

  for (const item of cityImpacts) {
    if (item.popK <= 0 || item.mmi < 3.5) continue;
    for (let i = 0; i < binDefs.length; i++) {
      if (item.mmi >= binDefs[i].lo && item.mmi < binDefs[i].hi) {
        bins[i].popK += item.popK;
        break;
      }
    }
    if (item.mmi >= 5.5) exposedMmi6PopK += item.popK;
    if (item.mmi >= 7.5) exposedMmi8PopK += item.popK;

    if (item.mmi >= 5.0) {
      const rate = stdNormalCdf(Math.log(item.mmi / theta) / beta);
      expectedAffectedK += item.popK * rate;
    }
  }

  // Si el epicentro es muy intenso en zona despoblada, reflejamos un piso por intensidad epicentral
  const epFloor =
    epicentralMmi >= 8.5
      ? 28
      : epicentralMmi >= 7.5
        ? 14
        : epicentralMmi >= 6.5
          ? 5
          : 0;
  const empiricalLossIndex = clamp(
    Math.round(
      Math.max(
        epFloor,
        Math.log10(1 + expectedAffectedK * 120 + exposedMmi6PopK * 0.4) * 22,
      ),
    ),
    0,
    100,
  );

  if (expectedAffectedK >= 15 || exposedMmi8PopK >= 1200 || empiricalLossIndex >= 75) {
    return {
      level: "red",
      color: "#ef4444",
      labelEs: "Alerta Roja (Impacto severo)",
      labelEn: "Red Alert (Severe impact)",
      summaryEs:
        "Alta población expuesta a sacudidas destructivas (MMI ≥ VIII). Probable daño estructural extenso.",
      summaryEn:
        "High population exposed to destructive shaking (MMI ≥ VIII). Extensive structural damage likely.",
      bins,
      exposedMmi6PopK,
      exposedMmi8PopK,
      empiricalLossIndex,
    };
  }
  if (expectedAffectedK >= 1.5 || exposedMmi8PopK >= 150 || exposedMmi6PopK >= 2500 || empiricalLossIndex >= 50) {
    return {
      level: "orange",
      color: "#f97316",
      labelEs: "Alerta Naranja (Impacto regional)",
      labelEn: "Orange Alert (Regional impact)",
      summaryEs:
        "Sacudida muy fuerte en centros urbanos. Daños moderados a severos en edificaciones vulnerables.",
      summaryEn:
        "Very strong shaking in urban centers. Moderate to severe damage in vulnerable buildings.",
      bins,
      exposedMmi6PopK,
      exposedMmi8PopK,
      empiricalLossIndex,
    };
  }
  if (exposedMmi6PopK >= 100 || epicentralMmi >= 6.2 || empiricalLossIndex >= 22) {
    return {
      level: "yellow",
      color: "#facc15",
      labelEs: "Alerta Amarilla (Impacto local)",
      labelEn: "Yellow Alert (Localized impact)",
      summaryEs:
        "Sacudida fuerte localizada (MMI VI–VII). Posibles grietas en mampostería no reforzada y caída de objetos.",
      summaryEn:
        "Localized strong shaking (MMI VI–VII). Possible cracking in unreinforced masonry and fallen objects.",
      bins,
      exposedMmi6PopK,
      exposedMmi8PopK,
      empiricalLossIndex,
    };
  }
  return {
    level: "green",
    color: "#4ade80",
    labelEs: "Alerta Verde (Impacto mínimo)",
    labelEn: "Green Alert (Minimal impact)",
    summaryEs:
      "Sin daños estructurales significativos esperados en las ciudades de referencia.",
    summaryEn:
      "No significant structural damage expected across reference urban centers.",
    bins,
    exposedMmi6PopK,
    exposedMmi8PopK,
    empiricalLossIndex,
  };
}

/**
 * Sonificación sísmica en el navegador (Web Audio API): convierte la llegada de la
 * onda P (compresiva, más aguda) y el tren de ondas S/superficiales (cizalla, grave)
 * a frecuencias audibles (escalado ×30 Hz, estilo IRIS/USGS SeismoSound).
 */
export function playSeismogramAudio(
  mag: number,
  rhypoKm: number,
  depthKm = 15,
  siteDeltaMmi = 0,
): boolean {
  if (typeof window === "undefined") return false;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return false;

  try {
    const ctx = new AudioCtx();
    const sampleRate = ctx.sampleRate;
    const arrivals = estimateWaveArrivals(rhypoKm, depthKm);
    const spDelayAudio = clamp(arrivals.warningLeadSec * 0.055, 0.35, 1.35);
    const pStart = 0.15;
    const sStart = pStart + spDelayAudio;
    const duration = clamp(sStart + 1.4 + (mag - 4.5) * 0.25, 2.2, 3.8);
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Frecuencia base modulada por magnitud y tipo de suelo (suelo blando suena más grave y resonante)
    const pFreq = clamp(210 - (mag - 5) * 18, 130, 260);
    const sFreq = clamp(82 - (mag - 5) * 9 - siteDeltaMmi * 12, 42, 115);

    let maxAbs = 1e-5;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      let sample = 0;

      if (t >= pStart) {
        const dtP = t - pStart;
        const pEnv = Math.exp(-dtP / 0.22) * Math.min(1, dtP / 0.015);
        sample +=
          0.38 *
          pEnv *
          (Math.sin(2 * Math.PI * pFreq * dtP) +
            0.4 * Math.sin(2 * Math.PI * (pFreq * 1.45) * dtP));
      }

      if (t >= sStart) {
        const dtS = t - sStart;
        const tau = 0.38 + siteDeltaMmi * 0.18 + Math.max(0, mag - 5) * 0.08;
        const sEnv =
          Math.pow(dtS / tau, 0.55) *
          Math.exp(-dtS / (tau * 1.35)) *
          (1.2 + siteDeltaMmi * 0.25);
        const pseudoNoise =
          Math.sin(i * 0.037) * 0.3 + Math.cos(i * 0.083) * 0.2;
        sample +=
          sEnv *
          (0.65 * Math.sin(2 * Math.PI * sFreq * dtS) +
            0.35 * Math.sin(2 * Math.PI * (sFreq * 1.62) * dtS) +
            0.25 * pseudoNoise);
      }

      data[i] = sample;
      if (Math.abs(sample) > maxAbs) maxAbs = Math.abs(sample);
    }

    const gainScale = clamp(0.25 + (mag - 4) * 0.14, 0.2, 0.85) / maxAbs;
    for (let i = 0; i < length; i++) {
      data[i] *= gainScale;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      void ctx.close();
    };
    src.start();
    return true;
  } catch {
    return false;
  }
}


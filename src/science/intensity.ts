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
    };
  }
  if (quake.depth < 40) {
    return {
      style: "strike-slip",
      labelEs: "Cortical superficial",
      labelEn: "Shallow crustal",
      mechanismEs: "Transcurrente / cortical mixto",
      mechanismEn: "Strike-slip / mixed crustal",
    };
  }
  if (quake.depth <= 300) {
    return {
      style: "intraslab",
      labelEs: "Intraplaca de losa subducida (Wadati–Benioff)",
      labelEn: "Subducted slab intraplate (Wadati–Benioff)",
      mechanismEs: "Extensión / tracción de losa (normal)",
      mechanismEn: "Slab-pull extension (normal)",
    };
  }
  return {
    style: "normal",
    labelEs: "Manto de transición profundo (>300 km)",
    labelEn: "Deep mantle transition zone (>300 km)",
    mechanismEs: "Transformación de fase / compresión profunda",
    mechanismEn: "Phase transformation / deep slab compression",
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


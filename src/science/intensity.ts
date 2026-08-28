import { clamp } from './stats'

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
  const c1 = 12.27
  const c2 = 2.27
  const c3 = 0.1304
  const c4 = -1.3
  const c5 = -0.000707
  const c6 = 1.95
  const c7 = -0.577
  const rt = 30

  const r = Math.max(distKm, 1)
  const logR = Math.log10(r)
  const b = Math.max(Math.log10(r / rt), 0)
  const mmi =
    c1 +
    c2 * (mag - 6) +
    c3 * (mag - 6) ** 2 +
    c4 * logR +
    c5 * r +
    c6 * b +
    c7 * mag * logR
  return clamp(mmi, 1, 12)
}

/** Desviación estándar aleatoria típica de una IPE, en unidades de MMI. */
export const MMI_SIGMA = 0.7

/** Distancia hipocentral a partir de la epicentral y la profundidad. */
export function hypocentralKm(epicentralKm: number, depthKm: number): number {
  return Math.sqrt(epicentralKm ** 2 + Math.max(depthKm, 0) ** 2)
}

/**
 * Conversión MMI → PGA (cm/s²) invirtiendo la relación de Worden et al. (2012).
 */
export function mmiToPga(mmi: number): number {
  if (mmi <= 4.22) return 10 ** ((mmi - 1.78) / 1.55)
  return 10 ** ((mmi + 1.6) / 3.7)
}

/** Conversión PGA (cm/s²) → MMI, Worden et al. (2012). */
export function pgaToMmi(pga: number): number {
  const lp = Math.log10(Math.max(pga, 1e-3))
  return clamp(lp < 1.57 ? 1.78 + 1.55 * lp : -1.6 + 3.7 * lp, 1, 12)
}

/** PGA expresada como fracción de g. */
export function pgaToG(pga: number): number {
  return pga / 980.665
}

export interface MmiLevel {
  roman: string
  label: string
  perception: string
  damage: string
  color: string
}

/** Escala de Mercalli Modificada resumida. */
export const MMI_SCALE: MmiLevel[] = [
  {
    roman: 'I',
    label: 'No sentido',
    perception: 'Solo lo registran los sismógrafos.',
    damage: 'Ninguno.',
    color: '#1e293b',
  },
  {
    roman: 'II',
    label: 'Muy leve',
    perception: 'Lo notan personas en reposo, pisos altos.',
    damage: 'Ninguno.',
    color: '#1e3a5f',
  },
  {
    roman: 'III',
    label: 'Leve',
    perception: 'Como el paso de un camión; muchos no lo identifican como sismo.',
    damage: 'Ninguno.',
    color: '#1d4ed8',
  },
  {
    roman: 'IV',
    label: 'Moderado',
    perception: 'Sentido dentro de casas; vibran ventanas y vajilla.',
    damage: 'Ninguno.',
    color: '#0891b2',
  },
  {
    roman: 'V',
    label: 'Poco fuerte',
    perception: 'Sentido por casi todos; despierta a la gente.',
    damage: 'Objetos caen, grietas finas en revoques.',
    color: '#22c55e',
  },
  {
    roman: 'VI',
    label: 'Fuerte',
    perception: 'Todos lo sienten; muchos salen a la calle.',
    damage: 'Daño leve: caída de repellos, chimeneas agrietadas.',
    color: '#facc15',
  },
  {
    roman: 'VII',
    label: 'Muy fuerte',
    perception: 'Difícil mantenerse en pie.',
    damage: 'Daño moderado en construcción corriente; grave en la mal construida.',
    color: '#f97316',
  },
  {
    roman: 'VIII',
    label: 'Destructivo',
    perception: 'Pánico generalizado.',
    damage: 'Colapso parcial de mampostería sin refuerzo; daño en estructuras normales.',
    color: '#ef4444',
  },
  {
    roman: 'IX',
    label: 'Ruinoso',
    perception: 'Pánico total.',
    damage: 'Estructuras desplazadas de cimientos; daño severo generalizado.',
    color: '#dc2626',
  },
  {
    roman: 'X',
    label: 'Desastroso',
    perception: '—',
    damage: 'Colapso de muchas estructuras; rieles torcidos, deslizamientos.',
    color: '#b91c1c',
  },
  {
    roman: 'XI',
    label: 'Muy desastroso',
    perception: '—',
    damage: 'Pocas estructuras quedan en pie; puentes destruidos.',
    color: '#a21caf',
  },
  {
    roman: 'XII',
    label: 'Catastrófico',
    perception: '—',
    damage: 'Destrucción total; ondas visibles en el terreno.',
    color: '#7e22ce',
  },
]

export function mmiLevel(mmi: number): MmiLevel {
  return MMI_SCALE[clamp(Math.round(mmi) - 1, 0, 11)]
}

export function mmiRoman(mmi: number): string {
  return mmiLevel(mmi).roman
}

export function mmiColor(mmi: number): string {
  return mmiLevel(mmi).color
}

/** Radio aproximado (km) donde se alcanza cierta MMI, resolviendo la IPE. */
export function radiusForMmi(
  mag: number,
  targetMmi: number,
  depthKm = 10,
  ipe: (m: number, r: number) => number = mmiAllen2012,
): number {
  let lo = 1
  let hi = 1500
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const mmi = ipe(mag, hypocentralKm(mid, depthKm))
    if (mmi > targetMmi) lo = mid
    else hi = mid
  }
  return lo
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
}

export function mmiAllen2012(mag: number, rhypoKm: number): number {
  const r = Math.max(rhypoKm, 1)
  const rm = ALLEN.m1 + ALLEN.m2 * Math.exp(mag - 5)
  let mmi = ALLEN.c0 + ALLEN.c1 * mag + ALLEN.c2 * Math.log(Math.sqrt(r * r + rm * rm))
  // Más allá de 50 km entra un término de atenuación anelástica.
  if (r > 50) mmi += ALLEN.c4 * Math.log(r / 50)
  return clamp(mmi, 1, 12)
}

/** Dispersión total de Allen et al. (2012): decrece con la distancia. */
export function allenSigma(rhypoKm: number): number {
  const r = Math.max(rhypoKm, 1)
  return ALLEN.s1 + ALLEN.s2 / (1 + (r / ALLEN.s3) ** 2)
}

export type IpeId = 'allen2012' | 'atkinsonWald2007'

export interface IpeModel {
  id: IpeId
  name: string
  reference: string
  scope: string
  /** MMI mediana para una magnitud y una distancia hipocentral en km. */
  mmi: (mag: number, rhypoKm: number) => number
  /** Desviación estándar total en unidades de MMI. */
  sigma: (rhypoKm: number) => number
}

export const IPE_MODELS: Record<IpeId, IpeModel> = {
  allen2012: {
    id: 'allen2012',
    name: 'Allen et al. (2012)',
    reference: 'Allen, Wald & Worden (2012), J. Seismology 16:409–433',
    scope: 'Global, corteza activa. σ decrece con la distancia.',
    mmi: mmiAllen2012,
    sigma: allenSigma,
  },
  atkinsonWald2007: {
    id: 'atkinsonWald2007',
    name: 'Atkinson & Wald (2007)',
    reference: 'Atkinson & Wald (2007), Seismological Research Letters 78',
    scope: 'Calibrada para California. σ fija de 0.7.',
    mmi: mmiAtkinsonWald,
    sigma: () => MMI_SIGMA,
  },
}

export const DEFAULT_IPE: IpeId = 'allen2012'

/**
 * Longitud de ruptura subsuperficial (SRL) en km para fallas corticales,
 * según Wells & Coppersmith (1994). Válido para todos los mecanismos.
 */
export function wellsCoppersmithLength(mag: number): number {
  if (mag < 5.0) return 0
  return 10 ** (-2.44 + 0.59 * mag)
}

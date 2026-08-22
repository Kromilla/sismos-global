/** Un sismo normalizado (viene del catálogo USGS/ComCat). */
export interface Quake {
  id: string
  /** Origen del evento, en ms epoch UTC. */
  time: number
  lat: number
  lon: number
  /** Profundidad en km. */
  depth: number
  mag: number
  /** mww, mb, ml, md... el tipo de escala reportada. */
  magType: string
  place: string
  tsunami: boolean
  url: string
  /** Red que reportó el evento. */
  source: 'USGS' | 'SGC'
  /** Intensidad comunitaria máxima reportada (Did You Feel It?), si existe. */
  cdi?: number
  /** Intensidad instrumental máxima del ShakeMap, si existe. */
  mmi?: number
  /** Número de reportes ciudadanos recibidos. */
  felt?: number
}

/** Tupla compacta usada solo para cachear en localStorage. */
export type QuakeTuple = [
  id: string,
  time: number,
  lat: number,
  lon: number,
  depth: number,
  mag: number,
  magType: string,
  place: string,
  tsunami: 0 | 1,
  source: 'USGS' | 'SGC',
  cdi: number | null,
  mmi: number | null,
  felt: number | null,
]

/** De dónde salen los eventos que alimenta la app. */
export type CatalogSource = 'USGS' | 'SGC' | 'ambos'

export interface Bbox {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

export interface Region {
  id: string
  name: string
  country: string
  bbox: Bbox
  /** Contexto tectónico en una línea. */
  blurb: string
}

export interface CatalogQuery {
  startTime: number
  endTime: number
  minMag: number
  bbox: Bbox
}

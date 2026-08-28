import { sitePsha, type PshaOptions } from './psha'
import { observationYears, type CompletenessBand } from './completeness'
import type { City } from '../data/cities'
import type { Quake } from '../types'

interface WorkerRequest {
  id: number
  city: City
  background: Quake[]
  opts: Omit<PshaOptions, 'periodYears'>
  bands: CompletenessBand[]
  startYear: number
  endYear: number
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { city, background, opts, bands, startYear, endYear, id } = e.data
  
  const periodYears = (mag: number) => observationYears(mag, bands, startYear, endYear)

  try {
    const result = sitePsha(city, background, { ...opts, periodYears })
    self.postMessage({ id, result })
  } catch (err) {
    self.postMessage({ id, error: String(err) })
  }
}

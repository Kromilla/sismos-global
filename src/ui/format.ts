import { DAY_MS } from '../science/stats'

/** Paleta por magnitud, alineada con la usada en los mapas sísmicos. */
export function magColor(mag: number): string {
  if (mag < 3) return '#38bdf8'
  if (mag < 4) return '#22d3ee'
  if (mag < 5) return '#4ade80'
  if (mag < 6) return '#facc15'
  if (mag < 7) return '#fb923c'
  if (mag < 8) return '#ef4444'
  return '#d946ef'
}

export function depthColor(depthKm: number): string {
  if (depthKm < 30) return '#f87171'
  if (depthKm < 70) return '#fb923c'
  if (depthKm < 150) return '#facc15'
  if (depthKm < 300) return '#4ade80'
  return '#60a5fa'
}

export function depthLabel(depthKm: number): string {
  if (depthKm < 70) return 'superficial'
  if (depthKm < 300) return 'intermedia'
  return 'profunda'
}

const dtf = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const dtfShort = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short' })

export function fmtDateTime(ms: number): string {
  return dtf.format(new Date(ms))
}

export function fmtDate(ms: number): string {
  return dtfShort.format(new Date(ms))
}

/** "hace 3 h", "hace 2 d". */
export function fmtAgo(ms: number, now = Date.now()): string {
  const diff = Math.max(now - ms, 0)
  const min = diff / 60000
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${Math.round(min)} min`
  const h = min / 60
  if (h < 24) return `hace ${Math.round(h)} h`
  const d = diff / DAY_MS
  if (d < 30) return `hace ${Math.round(d)} d`
  const mo = d / 30.44
  if (mo < 12) {
    const n = Math.round(mo)
    return n === 1 ? 'hace 1 mes' : `hace ${n} meses`
  }
  return `hace ${(d / 365.25).toFixed(1)} años`
}

export function fmtNum(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return '—'
  if (x !== 0 && Math.abs(x) < 0.001) return x.toExponential(1)
  return x.toLocaleString('es-CO', { maximumFractionDigits: digits })
}

export function fmtPct(p: number): string {
  if (!Number.isFinite(p)) return '—'
  if (p >= 0.995) return '>99%'
  if (p > 0 && p < 0.001) return '<0.1%'
  return `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`
}

/** Color de una probabilidad, de verde (baja) a rojo (alta). */
export function probColor(p: number): string {
  if (p < 0.02) return '#334155'
  if (p < 0.1) return '#1d4ed8'
  if (p < 0.25) return '#0891b2'
  if (p < 0.5) return '#ca8a04'
  if (p < 0.75) return '#ea580c'
  return '#dc2626'
}

export function fmtYears(y: number): string {
  if (!Number.isFinite(y)) return '—'
  if (y >= 1000) return `${Math.round(y / 100) / 10} mil años`
  if (y >= 1) return y < 2 ? '1 año' : `${Math.round(y)} años`
  const days = y * 365.25
  if (days < 1) return `${Math.round(days * 24)} h`
  if (days < 45) return `${Math.round(days)} días`
  const months = Math.round(y * 12)
  return months <= 1 ? '1 mes' : `${months} meses`
}

/** Radio del marcador en el mapa, escalado por magnitud. */
export function magRadius(mag: number): number {
  return Math.max(3, 2.2 ** Math.max(mag, 1) * 0.55)
}

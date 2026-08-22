import { useMemo, useState } from 'react'
import type { Quake } from '../types'
import { ALL_REGIONS, inBbox } from '../data/regions'
import {
  FORECAST_MAGS,
  LONG_HORIZONS_YEARS,
  SHORT_HORIZONS,
  backtest,
  buildRegionForecast,
  type RegionForecast,
} from '../science/forecast'
import { bathExpectation, forecastAftershocks } from '../science/omori'
import { Card, Empty, Note, Stat, inputClass } from './ui'
import { fmtAgo, fmtDateTime, fmtNum, fmtPct, fmtYears, magColor, probColor } from '../ui/format'
import { DAY_MS } from '../science/stats'

function ProbCell({ p, expected }: { p: number; expected: number }) {
  return (
    <td
      className="px-3 py-2 text-center font-mono text-xs"
      style={{ background: probColor(p), color: p > 0.2 ? '#0f172a' : '#e2e8f0' }}
      title={`Número esperado de eventos: ${fmtNum(expected, 2)}`}
    >
      {fmtPct(p)}
    </td>
  )
}

function ActivityGauge({ ratio }: { ratio: number }) {
  const pct = Math.min(100, (Math.log10(Math.max(ratio, 0.1)) / 1.5) * 100 + 33)
  const color = ratio > 5 ? '#ef4444' : ratio > 2 ? '#f97316' : ratio > 1.2 ? '#facc15' : '#4ade80'
  return (
    <div className="space-y-1">
      <div className="h-2 overflow-hidden rounded-full bg-ink-800">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="text-[11px] text-slate-500">
        {ratio > 2
          ? 'Actividad por encima del fondo: hay una secuencia en curso.'
          : ratio > 1.2
            ? 'Ligeramente por encima del fondo.'
            : 'Actividad en el nivel de fondo de la zona.'}
      </div>
    </div>
  )
}

export default function Forecast({ quakes }: { quakes: Quake[] }) {
  const [regionId, setRegionId] = useState<string>('co-caribe')

  const ranking = useMemo(() => {
    const out: RegionForecast[] = []
    for (const region of ALL_REGIONS) {
      const subset = quakes.filter((q) => inBbox(q.lat, q.lon, region.bbox))
      const f = buildRegionForecast(region, subset)
      if (f) out.push(f)
    }
    return out.sort((a, b) => b.score - a.score)
  }, [quakes])

  const forecast = useMemo(
    () => ranking.find((f) => f.region.id === regionId) ?? ranking[0] ?? null,
    [ranking, regionId],
  )

  const bt = useMemo(() => {
    if (!forecast) return null
    const subset = forecast.quakes
    const split = Date.now() - 5 * 365.25 * DAY_MS
    return backtest(subset, split)
  }, [forecast])

  if (!forecast) return <Empty>No hay suficientes datos para pronosticar. Amplía el catálogo histórico.</Empty>

  const { gr, grBackground, region, sequences } = forecast

  return (
    <div className="space-y-4">
      <Note tone="warn">
        <strong>Esto no predice terremotos.</strong> Nadie sabe hacerlo: no existe método validado
        que diga fecha, lugar y magnitud exactos. Lo que ves son <em>pronósticos probabilísticos</em>,
        el mismo tipo de producto que publican el USGS y el SGC: tasas estadísticas derivadas del
        catálogo (Gutenberg–Richter), decaimiento de réplicas (Omori–Utsu) y disparo entre eventos
        (ETAS). Sirven para dimensionar el riesgo, no para evacuar un martes.
      </Note>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Zona sismogénica</span>
          <select
            className={inputClass}
            value={forecast.region.id}
            onChange={(e) => setRegionId(e.target.value)}
          >
            {ranking.map((f) => (
              <option key={f.region.id} value={f.region.id}>
                {f.region.name} — {f.region.country} ({f.quakes.length} eventos)
              </option>
            ))}
          </select>
        </label>
        <p className="max-w-xl text-xs text-slate-500">{region.blurb}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Índice de actividad"
          value={`${forecast.score}/100`}
          hint="Comparativo entre zonas, no absoluto"
          accent={forecast.score > 66 ? '#ef4444' : forecast.score > 40 ? '#facc15' : '#4ade80'}
        />
        <Stat
          label="Tasa actual / fondo"
          value={`${fmtNum(forecast.rateRatio, 2)}×`}
          hint={`${fmtNum(forecast.currentRatePerDay, 3)} eventos M≥${gr?.mc.toFixed(1)} por día`}
          accent="#38bdf8"
        />
        <Stat
          label="Retorno M≥7"
          value={
            grBackground
              ? fmtYears(1 / 10 ** (grBackground.aAnnual - grBackground.b * 7))
              : '—'
          }
          hint="Sismicidad de fondo, catálogo desagrupado"
          accent="#fb923c"
        />
        <Stat
          label="Mayor registrado"
          value={forecast.maxObserved ? `M ${forecast.maxObserved.mag.toFixed(1)}` : '—'}
          hint={
            forecast.maxObserved
              ? `${new Date(forecast.maxObserved.time).getUTCFullYear()} · ${forecast.maxObserved.place}`
              : undefined
          }
        />
      </div>

      <Card
        title="Corto plazo · modelo ETAS"
        subtitle="Probabilidad de al menos un sismo de esa magnitud en la zona, contando el efecto de la sismicidad reciente"
      >
        <ActivityGauge ratio={forecast.rateRatio} />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 text-left">Horizonte</th>
                {FORECAST_MAGS.map((m) => (
                  <th key={m} className="px-3 py-2 text-center" style={{ color: magColor(m) }}>
                    M ≥ {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SHORT_HORIZONS.map((h) => (
                <tr key={h} className="border-t border-ink-800/70">
                  <td className="px-3 py-2 text-slate-300">{h} días</td>
                  {FORECAST_MAGS.map((m) => {
                    const cell = forecast.shortTerm.find((c) => c.horizonDays === h && c.mag === m)
                    return (
                      <ProbCell
                        key={m}
                        p={cell?.probability ?? 0}
                        expected={cell?.expected ?? 0}
                      />
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note>
          ETAS calibrado con la razón de ramificación observada en la zona (
          {(forecast.cluster.clusteredFraction * 100).toFixed(0)}% del catálogo son réplicas). Las
          probabilidades se reescalan en magnitud con b = {gr?.b.toFixed(2)}.
        </Note>
      </Card>

      <Card
        title="Largo plazo · Poisson sobre sismicidad de fondo"
        subtitle="Con el catálogo desagrupado, quitando réplicas y premonitores"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 text-left">Ventana</th>
                {FORECAST_MAGS.map((m) => (
                  <th key={m} className="px-3 py-2 text-center" style={{ color: magColor(m) }}>
                    M ≥ {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LONG_HORIZONS_YEARS.map((y) => (
                <tr key={y} className="border-t border-ink-800/70">
                  <td className="px-3 py-2 text-slate-300">{y} {y === 1 ? 'año' : 'años'}</td>
                  {FORECAST_MAGS.map((m) => {
                    const cell = forecast.longTerm.find((c) => c.years === y && c.mag === m)
                    return <ProbCell key={m} p={cell?.probability ?? 0} expected={cell?.expected ?? 0} />
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note>
          Catálogo de {fmtNum(forecast.years, 1)} años con {forecast.quakes.length.toLocaleString('es-CO')}{' '}
          eventos. Un catálogo corto subestima los sismos raros: para M≥8 estas cifras son un piso,
          no una verdad.
        </Note>
      </Card>

      {sequences.length > 0 && (
        <Card
          title="Secuencias activas"
          subtitle="Sismos M≥5.3 de los últimos 120 días y su decaimiento de réplicas"
        >
          <div className="space-y-4">
            {sequences.slice(0, 3).map((seq) => {
              const rows = forecastAftershocks(seq, [1, 7, 30], [4, 5, 6], gr?.b ?? 1, gr?.mc ?? 4.5)
              return (
                <div key={seq.mainshock.id} className="rounded-xl border border-ink-800 bg-ink-950/40 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span
                        className="font-mono text-lg font-bold"
                        style={{ color: magColor(seq.mainshock.mag) }}
                      >
                        M {seq.mainshock.mag.toFixed(1)}
                      </span>
                      <span className="ml-2 text-sm text-slate-200">{seq.mainshock.place}</span>
                    </div>
                    <span className="text-xs text-slate-500">
                      {fmtDateTime(seq.mainshock.time)} · {fmtAgo(seq.mainshock.time)}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-4">
                    <span>Réplicas registradas: <b className="text-slate-200">{seq.aftershocks.length}</b></span>
                    <span>
                      Mayor réplica:{' '}
                      <b className="text-slate-200">
                        {seq.largestAftershock ? `M ${seq.largestAftershock.toFixed(1)}` : '—'}
                      </b>{' '}
                      <span className="text-slate-600">(Båth: M {bathExpectation(seq.mainshock.mag)})</span>
                    </span>
                    <span>Radio de la secuencia: <b className="text-slate-200">{seq.radiusKm.toFixed(0)} km</b></span>
                    <span>
                      Omori:{' '}
                      <b className="text-slate-200">
                        {seq.fit ? `p=${seq.fit.p.toFixed(2)} c=${fmtNum(seq.fit.c, 3)}` : 'modelo genérico'}
                      </b>
                    </span>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[360px] border-collapse text-xs">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                          <th className="px-2 py-1 text-left">Próximos</th>
                          {[4, 5, 6].map((m) => (
                            <th key={m} className="px-2 py-1 text-center">M ≥ {m}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[1, 7, 30].map((h) => (
                          <tr key={h} className="border-t border-ink-800/70">
                            <td className="px-2 py-1 text-slate-300">{h} {h === 1 ? 'día' : 'días'}</td>
                            {[4, 5, 6].map((m) => {
                              const cell = rows.find((r) => r.horizonDays === h && r.mag === m)
                              return (
                                <ProbCell
                                  key={m}
                                  p={cell?.probability ?? 0}
                                  expected={cell?.expected ?? 0}
                                />
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {bt && (
        <Card
          title="Validación retrospectiva"
          subtitle={`Modelo ajustado con ${fmtNum(bt.trainYears, 0)} años previos, contrastado contra los últimos ${fmtNum(bt.testYears, 1)} años reales`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2 text-left">Magnitud</th>
                  <th className="px-3 py-2 text-right">Predicho</th>
                  <th className="px-3 py-2 text-right">Observado</th>
                  <th className="px-3 py-2 text-right">Desvío</th>
                </tr>
              </thead>
              <tbody>
                {bt.rows.map((r) => {
                  const ratio = r.expected > 0 ? r.observed / r.expected : NaN
                  const ok = Number.isFinite(ratio) && ratio > 0.5 && ratio < 2
                  return (
                    <tr key={r.mag} className="border-t border-ink-800/70">
                      <td className="px-3 py-2 text-slate-300">M ≥ {r.mag}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">
                        {fmtNum(r.expected, 1)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">{r.observed}</td>
                      <td
                        className="px-3 py-2 text-right font-mono"
                        style={{ color: ok ? '#4ade80' : '#f97316' }}
                      >
                        {Number.isFinite(ratio) ? `${ratio.toFixed(2)}×` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Note>
            Un desvío cercano a 1× significa que la tasa proyectada acertó el número de eventos. Es
            la prueba mínima de honestidad del modelo: si aquí falla, las tablas de arriba también.
          </Note>
        </Card>
      )}

      <Card title="Ranking de zonas" subtitle="Ordenadas por índice de actividad">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 text-left">Zona</th>
                <th className="px-3 py-2 text-right">Índice</th>
                <th className="px-3 py-2 text-right">b</th>
                <th className="px-3 py-2 text-right">Tasa/fondo</th>
                <th className="px-3 py-2 text-right">P(M≥6, 1 año)</th>
                <th className="px-3 py-2 text-right">Último evento</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((f) => {
                const p6 = f.longTerm.find((c) => c.years === 1 && c.mag === 6)?.probability ?? 0
                return (
                  <tr
                    key={f.region.id}
                    className={`cursor-pointer border-t border-ink-800/70 transition hover:bg-ink-900/60 ${
                      f.region.id === forecast.region.id ? 'bg-sky-500/5' : ''
                    }`}
                    onClick={() => setRegionId(f.region.id)}
                  >
                    <td className="px-3 py-2 text-slate-200">
                      {f.region.name}
                      <span className="ml-2 text-[11px] text-slate-500">{f.region.country}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className="inline-block w-10 rounded px-1 font-mono text-xs text-slate-950"
                        style={{
                          background:
                            f.score > 66 ? '#ef4444' : f.score > 40 ? '#facc15' : '#4ade80',
                        }}
                      >
                        {f.score}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">
                      {f.gr ? f.gr.b.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">
                      {fmtNum(f.rateRatio, 2)}×
                    </td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: probColor(p6) }}>
                      {fmtPct(p6)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-slate-500">
                      {f.lastEvent ? fmtAgo(f.lastEvent.time) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

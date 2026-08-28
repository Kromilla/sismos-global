import { useEffect, useMemo, useRef, useState } from 'react'
import PshaWorker from '../science/psha.worker?worker'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import type { Quake } from '../types'
import { CITIES, cityById } from '../data/cities'
import { Card, Empty, Note, Stat, inputClass } from './ui'
import { decluster } from '../science/declustering'
import { fitGutenbergRichter } from '../science/gutenbergRichter'
import { estimateCompleteness, observationYears } from '../science/completeness'
import { historicIntensity, scenarioShaking, yearsOf, type PshaResult } from '../science/psha'
import {
  DEFAULT_IPE,
  IPE_MODELS,
  MMI_SCALE,
  mmiColor,
  mmiLevel,
  mmiRoman,
  radiusForMmi,
  type IpeId,
} from '../science/intensity'
import { compareIpes, withObservations } from '../science/ipeValidation'
import { fmtNum, fmtYears, magColor } from '../ui/format'
import MapView, { type Ring } from './MapView'

/** Tope de puntos dibujados en la nube de residuales. */
const MAX_SCATTER_POINTS = 1500

const axis = { stroke: '#475569', fontSize: 11 }
const grid = { stroke: '#1e293b', strokeDasharray: '3 3' }
const tooltipStyle = {
  background: '#101a2c',
  border: '1px solid #1f3050',
  borderRadius: 12,
  fontSize: 12,
  color: '#e2e8f0',
}

export default function Hazard({ quakes }: { quakes: Quake[] }) {
  const [cityId, setCityId] = useState('santamarta')
  const [scenarioMag, setScenarioMag] = useState(7)
  const [scenarioDepth, setScenarioDepth] = useState(20)
  const [epicenter, setEpicenter] = useState<{ lat: number; lon: number } | null>(null)
  const [ipeId, setIpeId] = useState<IpeId>(DEFAULT_IPE)
  const [applyBias, setApplyBias] = useState(false)

  const city = cityById(cityId) ?? CITIES[0]

  const model = useMemo(() => {
    if (quakes.length < 100) return null
    const gr = fitGutenbergRichter(quakes)
    if (!gr) return null
    const cluster = decluster(quakes)
    const years = yearsOf(quakes)
    let maxObs = 0
    let tMin = Infinity
    let tMax = -Infinity
    for (const q of quakes) {
      if (q.mag > maxObs) maxObs = q.mag
      if (q.time < tMin) tMin = q.time
      if (q.time > tMax) tMax = q.time
    }
    const mmax = Math.max(maxObs + 0.5, 7.5)
    // Cada magnitud se observó durante un tiempo distinto; el PSHA lo necesita
    // para no repartir un sismo de 1900 entre el mismo lapso que uno de 2020.
    const bands = estimateCompleteness(quakes)
    const startYear = new Date(tMin).getUTCFullYear()
    const endYear = new Date(tMax).getUTCFullYear()
    const periodYears = (mag: number) => observationYears(mag, bands, startYear, endYear)
    return { gr, cluster, years, mmax, bands, periodYears, startYear, endYear }
  }, [quakes])

  const validation = useMemo(() => compareIpes(quakes, 'mmi'), [quakes])
  const score = useMemo(
    () => validation.find((v) => v.ipe === ipeId) ?? null,
    [validation, ipeId],
  )
  // El residual es observado menos predicho, así que corregir el modelo es sumarlo.
  const bias = useMemo(() => (applyBias && score ? score.bias : 0), [applyBias, score])

  const [psha, setPsha] = useState<PshaResult | null>(null)
  const [isComputing, setIsComputing] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const reqIdRef = useRef(0)

  useEffect(() => {
    workerRef.current = new PshaWorker()
    return () => workerRef.current?.terminate()
  }, [])

  useEffect(() => {
    if (!model) {
      setPsha(null)
      return
    }
    const id = ++reqIdRef.current
    setIsComputing(true)
    
    const worker = workerRef.current
    if (!worker) return

    const handleMessage = (e: MessageEvent) => {
      if (e.data.id === id) {
        if (!e.data.error) setPsha(e.data.result)
        setIsComputing(false)
        worker.removeEventListener('message', handleMessage)
      }
    }
    worker.addEventListener('message', handleMessage)
    
    worker.postMessage({
      id,
      city,
      background: model.cluster.background,
      opts: {
        mc: model.gr.mc,
        b: model.gr.b,
        mmax: model.mmax,
        years: model.years,
        ipe: ipeId,
        bias,
      },
      bands: model.bands,
      startYear: model.startYear,
      endYear: model.endYear,
    })
    
    return () => {
      worker.removeEventListener('message', handleMessage)
    }
  }, [model, city, ipeId, bias])

  const scatterData = useMemo(() => {
    const rs = score?.residuals ?? []
    const step = Math.max(1, Math.ceil(rs.length / MAX_SCATTER_POINTS))
    const out = []
    for (let i = 0; i < rs.length; i += step) {
      out.push({ predicho: rs[i].predicted + bias, observado: rs[i].observed, z: 1 })
    }
    return out
  }, [score, bias])

  const historic = useMemo(
    () => historicIntensity(city, quakes, 8, ipeId, bias),
    [city, quakes, ipeId, bias],
  )

  const scenario = useMemo(() => {
    const center = epicenter ?? (historic[0] ? { lat: historic[0].quake.lat, lon: historic[0].quake.lon } : city)
    const impacts = scenarioShaking(
      { lat: center.lat, lon: center.lon, depth: scenarioDepth, mag: scenarioMag },
      CITIES,
      ipeId,
      bias,
    )
    const rings: Ring[] = [8, 7, 6, 5, 4]
      .map((target) => ({
        lat: center.lat,
        lon: center.lon,
        radiusKm: radiusForMmi(scenarioMag, target, scenarioDepth, IPE_MODELS[ipeId].mmi),
        color: mmiColor(target),
        label: `MMI ${mmiRoman(target)} — ${mmiLevel(target).label}`,
      }))
      .filter((r) => r.radiusKm > 2)
    return { center, impacts, rings }
  }, [epicenter, historic, city, scenarioDepth, scenarioMag, ipeId, bias])

  if (!model) return <Empty>Se necesita el catálogo histórico cargado para calcular amenaza.</Empty>

  const curveChart =
    psha?.curve
      .filter((p) => p.annualRate > 1e-6)
      .map((p) => ({
        mmi: p.mmi,
        retorno: p.returnPeriod,
        prob50: p.p50y * 100,
      })) ?? []

  const deaggChart =
    psha?.deagg.slice(0, 12).map((d) => ({
      etiqueta: `M${d.magBin.toFixed(1)} / ${d.distBin}-${d.distBin + 50}km`,
      aporte: d.contribution * 100,
    })) ?? []

  return (
    <div className="space-y-4">
      <Note tone="warn">
        Esto estima <strong>intensidad</strong> (lo que se siente y daña, escala Mercalli), no solo
        magnitud. El cálculo es un PSHA simplificado: fuentes puntuales del catálogo desagrupado,
        Gutenberg–Richter truncada y la ecuación de intensidad de{' '}
        <strong>{IPE_MODELS[ipeId].name}</strong> — {IPE_MODELS[ipeId].scope} No incorpora efecto de
        sitio ni fallas modeladas, así que <strong>no sustituye a la NSR-10 ni a ninguna norma de
        construcción</strong>.
      </Note>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Ciudad</span>
          <select className={inputClass} value={cityId} onChange={(e) => setCityId(e.target.value)}>
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.country}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">
            Ecuación de intensidad
          </span>
          <select
            className={inputClass}
            value={ipeId}
            onChange={(e) => setIpeId(e.target.value as IpeId)}
          >
            {Object.values(IPE_MODELS).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={applyBias}
            onChange={(e) => setApplyBias(e.target.checked)}
            disabled={!score}
            className="accent-sky-500"
          />
          Corregir sesgo medido
        </label>
        <p className="pb-1.5 text-xs text-slate-500 flex items-center gap-2">
          {isComputing && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-sky-500" />}
          {isComputing ? 'Calculando fuentes...' : psha ? `${psha.sources.toLocaleString('es-CO')} fuentes en 400 km` : 'Sin fuentes cercanas'}
        </p>
      </div>

      {psha ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Intensidad de diseño (475 años)"
              value={`MMI ${mmiRoman(psha.mmi475)}`}
              hint={`10% de probabilidad en 50 años · ${mmiLevel(psha.mmi475).label}`}
              accent={mmiColor(psha.mmi475)}
            />
            <Stat
              label="PGA asociada"
              value={`${(psha.pga475G * 100).toFixed(0)}% g`}
              hint="Aceleración pico del suelo equivalente"
              accent="#38bdf8"
            />
            <Stat
              label="Sismo extremo (2475 años)"
              value={`MMI ${mmiRoman(psha.mmi2475)}`}
              hint={`2% en 50 años · ${(psha.pga2475G * 100).toFixed(0)}% g`}
              accent={mmiColor(psha.mmi2475)}
            />
            <Stat
              label="Máxima histórica estimada"
              value={psha.historicMax ? `MMI ${mmiRoman(psha.historicMax.mmi)}` : '—'}
              hint={
                psha.historicMax
                  ? `M${psha.historicMax.quake.mag.toFixed(1)} en ${new Date(
                      psha.historicMax.quake.time,
                    ).getUTCFullYear()}`
                  : undefined
              }
              accent="#fb923c"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title="Curva de amenaza"
              subtitle={`Periodo de retorno de cada intensidad en ${city.name}`}
            >
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={curveChart} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                    <CartesianGrid {...grid} />
                    <XAxis dataKey="mmi" interval={3} {...axis} tickFormatter={(v: number) => mmiRoman(v)} />
                    <YAxis scale="log" domain={['auto', 'auto']} allowDataOverflow {...axis} />
                    <RTooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: unknown) => [fmtYears(Number(v)), 'Periodo de retorno']}
                      labelFormatter={(v: unknown) => `MMI ${mmiRoman(Number(v))}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="retorno"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <Note>
                Se lee así: cada intensidad tiene su periodo de retorno. Las normas de construcción
                se anclan en 475 años (10% en 50), que es la vida útil típica de un edificio.
              </Note>
            </Card>

            <Card
              title="Desagregación"
              subtitle="Qué combinación magnitud–distancia domina la amenaza de MMI VI"
            >
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart
                    data={deaggChart}
                    layout="vertical"
                    margin={{ top: 8, right: 12, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid {...grid} />
                    <XAxis type="number" {...axis} unit="%" />
                    <YAxis type="category" dataKey="etiqueta" width={130} {...axis} />
                    <RTooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: unknown) => [`${Number(v).toFixed(1)}%`, 'Aporte']}
                    />
                    <Bar dataKey="aporte" fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Note>
                Dice de dónde viene el peligro real: si dominan sismos cercanos moderados o lejanos
                grandes. Eso cambia qué tipo de estructura sufre.
              </Note>
            </Card>
          </div>

          <Card title={`Sismos que más se sintieron en ${city.name}`} subtitle="Intensidad estimada con la IPE, no medida">
            <div className="grid gap-2 sm:grid-cols-2">
              {historic.map((h) => (
                <div
                  key={h.quake.id}
                  className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-950/50 px-3 py-2"
                >
                  <span
                    className="w-12 shrink-0 rounded-md py-1 text-center font-mono text-sm font-bold text-slate-950"
                    style={{ background: mmiColor(h.mmi) }}
                  >
                    {mmiRoman(h.mmi)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-200">
                      M{h.quake.mag.toFixed(1)} · {h.quake.place}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {new Date(h.quake.time).getUTCFullYear()} · a {h.distKm.toFixed(0)} km ·{' '}
                      {mmiLevel(h.mmi).label}
                    </span>
                  </span>
                </div>
              ))}
              {!historic.length && (
                <p className="text-sm text-slate-500">
                  Ningún evento del catálogo alcanza MMI III en esta ciudad.
                </p>
              )}
            </div>
          </Card>
        </>
      ) : (
        <Empty>No hay suficientes fuentes cercanas a {city.name} para un cálculo estable.</Empty>
      )}

      <Card
        title="Escenario: ¿qué pasaría si…?"
        subtitle="Haz clic en el mapa para mover el epicentro y ajusta magnitud y profundidad"
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <MapView
            quakes={[]}
            showCities
            rings={scenario.rings}
            marker={{
              lat: scenario.center.lat,
              lon: scenario.center.lon,
              label: `M${scenarioMag.toFixed(1)} · ${scenarioDepth} km`,
            }}
            onMapClick={(lat, lon) => setEpicenter({ lat, lon })}
            focus={{ lat: scenario.center.lat, lon: scenario.center.lon, zoom: 6 }}
            className="h-[380px]"
          />
          <div className="space-y-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">
                Magnitud: <b className="font-mono text-slate-200">{scenarioMag.toFixed(1)}</b>
              </span>
              <input
                type="range"
                min={5}
                max={9}
                step={0.1}
                value={scenarioMag}
                onChange={(e) => setScenarioMag(Number(e.target.value))}
                className="mt-1 w-full accent-sky-500"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">
                Profundidad: <b className="font-mono text-slate-200">{scenarioDepth} km</b>
              </span>
              <input
                type="range"
                min={5}
                max={200}
                step={5}
                value={scenarioDepth}
                onChange={(e) => setScenarioDepth(Number(e.target.value))}
                className="mt-1 w-full accent-sky-500"
              />
            </label>
            <div className="max-h-[240px] overflow-y-auto rounded-xl border border-ink-800">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-ink-900">
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-2 py-1.5 text-left">Ciudad</th>
                    <th className="px-2 py-1.5 text-right">Dist.</th>
                    <th className="px-2 py-1.5 text-center">MMI</th>
                  </tr>
                </thead>
                <tbody>
                  {scenario.impacts.slice(0, 14).map((im) => (
                    <tr key={im.city.id} className="border-t border-ink-800/70">
                      <td className="px-2 py-1.5 text-slate-300">{im.city.name}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-500">
                        {im.distKm.toFixed(0)} km
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span
                          className="inline-block w-8 rounded font-mono text-[11px] font-bold text-slate-950"
                          style={{ background: mmiColor(im.mmi) }}
                        >
                          {mmiRoman(im.mmi)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500">
              Población expuesta a MMI ≥ VI:{' '}
              <b className="text-slate-300">
                {fmtNum(
                  scenario.impacts.filter((i) => i.mmi >= 6).reduce((s, i) => s + i.popK, 0) / 1000,
                  1,
                )}{' '}
                millones
              </b>{' '}
              (solo ciudades de la lista).
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="Calibración contra intensidad observada"
        subtitle="Cada modelo enfrentado a la intensidad que de verdad midió el USGS en cada sismo"
      >
        {validation.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2 text-left">Modelo</th>
                    <th className="px-3 py-2 text-right">Eventos</th>
                    <th className="px-3 py-2 text-right">Sesgo</th>
                    <th className="px-3 py-2 text-right">Dispersión</th>
                    <th className="px-3 py-2 text-right">RMSE</th>
                    <th className="px-3 py-2 text-right">Dentro de ±1</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.map((v) => (
                    <tr
                      key={v.ipe}
                      className={`cursor-pointer border-t border-ink-800/70 transition hover:bg-ink-900/60 ${
                        v.ipe === ipeId ? 'bg-sky-500/5' : ''
                      }`}
                      onClick={() => setIpeId(v.ipe)}
                    >
                      <td className="px-3 py-2 text-slate-200">
                        {v.name}
                        {v.ipe === ipeId && <span className="ml-2 text-[11px] text-sky-400">activo</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">{v.n}</td>
                      <td
                        className="px-3 py-2 text-right font-mono"
                        style={{ color: Math.abs(v.bias) < 0.5 ? '#4ade80' : '#f97316' }}
                      >
                        {v.bias > 0 ? '+' : ''}
                        {v.bias.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">
                        {v.scatter.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">
                        {v.rmse.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">
                        {(v.within1 * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 h-64">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid {...grid} />
                  <XAxis
                    type="number"
                    dataKey="predicho"
                    name="Predicho"
                    domain={[2, 10]}
                    ticks={[2, 4, 6, 8, 10]}
                    allowDataOverflow
                    {...axis}
                    label={{ value: 'MMI predicha', position: 'insideBottom', offset: -2, fill: '#475569', fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="observado"
                    name="Observado"
                    domain={[2, 10]}
                    ticks={[2, 4, 6, 8, 10]}
                    allowDataOverflow
                    {...axis}
                  />
                  <ZAxis type="number" dataKey="z" range={[24, 24]} />
                  <RTooltip
                    contentStyle={tooltipStyle}
                    cursor={{ strokeDasharray: '3 3' }}
                    formatter={(v: unknown, n: unknown) => [Number(v).toFixed(1), String(n)]}
                  />
                  <ReferenceLine
                    segment={[
                      { x: 2, y: 2 },
                      { x: 10, y: 10 },
                    ]}
                    stroke="#64748b"
                    strokeDasharray="4 4"
                  />
                  <Scatter data={scatterData} fill="#38bdf8" fillOpacity={0.5} isAnimationActive={false} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            <Note>
              Cada punto es un sismo real: en el eje horizontal lo que el modelo predice en el
              epicentro, en el vertical la intensidad máxima que registró el ShakeMap del USGS. La
              diagonal es el acierto perfecto. Por encima, el modelo se queda corto; por debajo,
              exagera.{' '}
              {score && (
                <>
                  El sesgo actual es de <b>{score.bias > 0 ? '+' : ''}{score.bias.toFixed(2)}</b>{' '}
                  grados sobre {score.n.toLocaleString('es-CO')} eventos con intensidad medida
                  {score.n > MAX_SCATTER_POINTS &&
                    ` (la nube dibuja ${MAX_SCATTER_POINTS.toLocaleString('es-CO')} de ellos)`}
                  {' '}({withObservations(quakes, 'cdi').length} tienen además reportes ciudadanos).
                </>
              )}
            </Note>
          </>
        ) : (
          <Empty>
            El catálogo cargado no trae intensidad observada. Amplía el rango de años o baja la
            magnitud mínima.
          </Empty>
        )}
      </Card>

      <Card title="Escala de Mercalli Modificada" subtitle="Lo que se siente y lo que se rompe">
        <div className="grid gap-2 md:grid-cols-2">
          {MMI_SCALE.slice(2).map((lvl) => (
            <div key={lvl.roman} className="flex gap-3 rounded-xl border border-ink-800 bg-ink-950/40 p-2.5">
              <span
                className="h-fit w-10 shrink-0 rounded-md py-1 text-center font-mono text-sm font-bold text-slate-950"
                style={{ background: lvl.color }}
              >
                {lvl.roman}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-200">{lvl.label}</div>
                <div className="text-[11px] leading-snug text-slate-500">
                  {lvl.perception !== '—' && <>{lvl.perception} </>}
                  {lvl.damage}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Magnitud no es intensidad" subtitle="La confusión más común">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-ink-800 bg-ink-950/40 p-3">
            <div className="font-mono text-sm" style={{ color: magColor(7) }}>
              Magnitud (Mw)
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Mide la energía liberada en la falla. Es <b>un solo número por sismo</b>, no depende de
              dónde estés. Cada punto de magnitud multiplica la energía por ~32.
            </p>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/40 p-3">
            <div className="font-mono text-sm text-amber-400">Intensidad (MMI)</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Mide la sacudida en un lugar concreto. <b>Cambia de barrio a barrio</b> según distancia,
              profundidad y suelo. Un M6 superficial y cercano hace más daño que un M7 profundo y
              lejano.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

import { useMemo, useState } from 'react'
import type { Quake } from '../types'
import { Badge, Empty, buttonClass } from './ui'
import { depthLabel, fmtAgo, fmtDateTime, magColor } from '../ui/format'
import { fmtEnergy } from '../science/stats'

type SortKey = 'time' | 'mag' | 'depth'

export default function EventsTable({
  quakes,
  onFocus,
}: {
  quakes: Quake[]
  onFocus?: (q: Quake) => void
}) {
  const [sort, setSort] = useState<SortKey>('time')
  const [limit, setLimit] = useState(100)

  const rows = useMemo(() => {
    const sorted = [...quakes].sort((a, b) => {
      if (sort === 'mag') return b.mag - a.mag
      if (sort === 'depth') return a.depth - b.depth
      return b.time - a.time
    })
    return sorted.slice(0, limit)
  }, [quakes, sort, limit])

  if (!quakes.length) return <Empty>Ningún sismo cumple los filtros actuales.</Empty>

  const th = (key: SortKey, label: string) => (
    <th
      className={`cursor-pointer select-none px-3 py-2 text-left font-medium transition hover:text-slate-200 ${
        sort === key ? 'text-sky-400' : 'text-slate-500'
      }`}
      onClick={() => setSort(key)}
    >
      {label}
      {sort === key ? ' ↓' : ''}
    </th>
  )

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-ink-800">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="bg-ink-900/80 text-[11px] uppercase tracking-wider">
            <tr>
              {th('mag', 'Mag')}
              <th className="px-3 py-2 text-left font-medium text-slate-500">Lugar</th>
              {th('time', 'Fecha')}
              {th('depth', 'Prof.')}
              <th className="px-3 py-2 text-left font-medium text-slate-500">Energía</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr
                key={q.id}
                className="border-t border-ink-800/70 transition hover:bg-ink-900/60"
              >
                <td className="px-3 py-2">
                  <Badge color={magColor(q.mag)} title={q.magType}>
                    {q.mag.toFixed(1)}
                  </Badge>
                </td>
                <td className="max-w-[280px] truncate px-3 py-2 text-slate-200" title={q.place}>
                  {q.place}
                  {q.tsunami && <span className="ml-2 text-[11px] text-amber-300">tsunami</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                  {fmtDateTime(q.time)}
                  <span className="ml-2 text-[11px] text-slate-600">{fmtAgo(q.time)}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-300">
                  {q.depth.toFixed(0)} km
                  <span className="ml-1 text-[11px] text-slate-600">{depthLabel(q.depth)}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-400">
                  {fmtEnergy(q.mag)}
                </td>
                <td className="px-3 py-2 text-right">
                  <button className={buttonClass} onClick={() => onFocus?.(q)}>
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Mostrando {rows.length} de {quakes.length.toLocaleString('es-CO')} eventos
        </span>
        {limit < quakes.length && (
          <button className={buttonClass} onClick={() => setLimit((l) => l + 200)}>
            Cargar más
          </button>
        )}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  Rectangle,
  TileLayer,
  Circle,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.heat'
import type { Quake } from '../types'
import { ALL_REGIONS } from '../data/regions'
import { CITIES } from '../data/cities'
import { depthColor, fmtAgo, fmtDateTime, magColor, magRadius } from '../ui/format'

/** Tope de marcadores dibujados a la vez. */
const MAX_MARKERS = 8000

/** Horas hacia atrás que se consideran "reciente" para animar el eco. */
const ECHO_HORAS = 24

/** Cuántos ecos como mucho: cada uno son tres anillos animándose. */
const MAX_ECOS = 14

export interface Ring {
  lat: number
  lon: number
  radiusKm: number
  color: string
  label: string
}

interface Props {
  quakes: Quake[]
  colorBy?: 'mag' | 'depth'
  showHeat?: boolean
  showRegions?: boolean
  showCities?: boolean
  selectedRegionId?: string | null
  onSelectRegion?: (id: string | null) => void
  rings?: Ring[]
  marker?: { lat: number; lon: number; label: string } | null
  onMapClick?: (lat: number, lon: number) => void
  focus?: { lat: number; lon: number; zoom: number } | null
  className?: string
  /** Anima con anillos los sismos de las últimas horas. */
  echo?: boolean
}

function HeatLayer({ quakes, enabled }: { quakes: Quake[]; enabled: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!enabled) return
    const points = quakes.map(
      (q) => [q.lat, q.lon, Math.min(1, 10 ** (q.mag - 6))] as [number, number, number],
    )
    const layer = L.heatLayer(points, {
      radius: 18,
      blur: 22,
      minOpacity: 0.25,
      max: 1,
      gradient: { 0.2: '#1d4ed8', 0.4: '#0ea5e9', 0.6: '#4ade80', 0.8: '#facc15', 1: '#ef4444' },
    })
    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [map, quakes, enabled])
  return null
}

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) })
  return null
}

function ClickHandler({ onMapClick }: { onMapClick?: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick?.(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function Focus({ focus }: { focus?: { lat: number; lon: number; zoom: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lon], focus.zoom, { duration: 0.8 })
  }, [map, focus])
  return null
}

export default function MapView({
  quakes,
  colorBy = 'mag',
  showHeat = false,
  showRegions = false,
  showCities = false,
  selectedRegionId = null,
  onSelectRegion,
  rings = [],
  marker = null,
  onMapClick,
  focus = null,
  className = '',
  echo = true,
}: Props) {
  const [zoom, setZoom] = useState(2)
  // Dibujamos los más fuertes al final para que queden por encima. Si hay
  // demasiados, se recortan por magnitud: 60.000 círculos ahogan el canvas.
  const { ordered, hidden } = useMemo(() => {
    const byMag = [...quakes].sort((a, b) => a.mag - b.mag)
    if (byMag.length <= MAX_MARKERS) return { ordered: byMag, hidden: 0 }
    return { ordered: byMag.slice(byMag.length - MAX_MARKERS), hidden: byMag.length - MAX_MARKERS }
  }, [quakes])
  const newest = useMemo(
    () => quakes.reduce<Quake | null>((mx, q) => (!mx || q.time > mx.time ? q : mx), null),
    [quakes],
  )

  const ecos = useMemo(() => {
    if (!echo) return []
    const desde = Date.now() - ECHO_HORAS * 3600_000
    return quakes
      .filter((q) => q.time >= desde)
      .sort((a, b) => b.mag - a.mag)
      .slice(0, MAX_ECOS)
  }, [quakes, echo])

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-ink-800 ${className}`}>
      <MapContainer
        center={[15, 0]}
        zoom={2}
        minZoom={2}
        maxZoom={12}
        worldCopyJump
        preferCanvas
        className="h-full w-full"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap &copy; CARTO · sismos: USGS'
          subdomains="abcd"
        />
        <ZoomWatcher onZoom={setZoom} />
        <ClickHandler onMapClick={onMapClick} />
        <Focus focus={focus} />
        <HeatLayer quakes={quakes} enabled={showHeat} />

        {showRegions &&
          ALL_REGIONS.map((r) => {
            const active = r.id === selectedRegionId
            return (
              <Rectangle
                key={r.id}
                bounds={[
                  [r.bbox.minLat, r.bbox.minLon],
                  [r.bbox.maxLat, r.bbox.maxLon],
                ]}
                pathOptions={{
                  color: active ? '#38bdf8' : '#475569',
                  weight: active ? 2 : 1,
                  fillOpacity: active ? 0.08 : 0.02,
                  dashArray: active ? undefined : '4 4',
                }}
                eventHandlers={{ click: () => onSelectRegion?.(active ? null : r.id) }}
              >
                <Tooltip sticky>
                  <span className="font-semibold">{r.name}</span> · {r.country}
                </Tooltip>
              </Rectangle>
            )
          })}

        {!showHeat &&
          ordered.map((q) => (
            <CircleMarker
              key={q.id}
              center={[q.lat, q.lon]}
              radius={magRadius(q.mag, zoom)}
              pathOptions={{
                color: colorBy === 'mag' ? magColor(q.mag) : depthColor(q.depth),
                weight: q.id === newest?.id ? 2 : 1,
                fillColor: colorBy === 'mag' ? magColor(q.mag) : depthColor(q.depth),
                fillOpacity: 0.45,
              }}
            >
              <Popup>
                <div className="space-y-1">
                  <div className="font-mono text-base font-bold" style={{ color: magColor(q.mag) }}>
                    M {q.mag.toFixed(1)}
                    <span className="ml-2 text-xs font-normal text-slate-400">{q.magType}</span>
                  </div>
                  <div className="text-slate-200">{q.place}</div>
                  <div className="text-slate-400">
                    {fmtDateTime(q.time)} · {fmtAgo(q.time)}
                  </div>
                  <div className="text-slate-400">
                    Profundidad {q.depth.toFixed(0)} km · {q.lat.toFixed(2)}, {q.lon.toFixed(2)}
                  </div>
                  {q.tsunami && <div className="text-amber-300">Con aviso de tsunami</div>}
                  <a
                    className="inline-block pt-1 text-sky-400 underline"
                    href={q.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ficha USGS
                  </a>
                </div>
              </Popup>
            </CircleMarker>
          ))}

        {ecos.map((q) => {
          const lado = Math.max(28, magRadius(q.mag, zoom) * 4)
          const color = magColor(q.mag)
          return (
            <Marker
              key={`eco-${q.id}`}
              position={[q.lat, q.lon]}
              interactive={false}
              icon={L.divIcon({
                className: '',
                iconSize: [lado, lado],
                iconAnchor: [lado / 2, lado / 2],
                html:
                  `<div class="quake-echo" style="width:${lado}px;height:${lado}px;color:${color}">` +
                  '<span></span><span></span><span></span></div>',
              })}
            />
          )
        })}

        {showCities &&
          CITIES.map((c) => (
            <CircleMarker
              key={c.id}
              center={[c.lat, c.lon]}
              radius={3}
              pathOptions={{ color: '#e2e8f0', weight: 1, fillColor: '#e2e8f0', fillOpacity: 0.9 }}
            >
              <Tooltip direction="top">{c.name}</Tooltip>
            </CircleMarker>
          ))}

        {rings.map((ring, i) => (
          <Circle
            key={`${ring.label}-${i}`}
            center={[ring.lat, ring.lon]}
            radius={ring.radiusKm * 1000}
            pathOptions={{ color: ring.color, weight: 1.2, fillOpacity: 0.06, fillColor: ring.color }}
          >
            <Tooltip sticky>{ring.label}</Tooltip>
          </Circle>
        ))}

        {marker && (
          <CircleMarker
            center={[marker.lat, marker.lon]}
            radius={7}
            pathOptions={{ color: '#f8fafc', weight: 2, fillColor: '#ef4444', fillOpacity: 0.9 }}
          >
            <Tooltip direction="top" permanent>
              {marker.label}
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>

      {hidden > 0 && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] rounded-lg border border-ink-700 bg-ink-950/85 px-2.5 py-1.5 text-[11px] text-slate-400">
          Se dibujan los {MAX_MARKERS.toLocaleString('es-CO')} de mayor magnitud ·{' '}
          {hidden.toLocaleString('es-CO')} ocultos. Sube la magnitud mínima o enfoca una zona.
        </div>
      )}
    </div>
  )
}

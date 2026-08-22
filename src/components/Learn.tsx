import { useState } from 'react'
import { Card, Note, Stat } from './ui'
import { tntTons } from '../science/stats'
import { fmtNum, magColor } from '../ui/format'
import { mmiAtkinsonWald, mmiColor, mmiRoman } from '../science/intensity'

const PLATES = [
  {
    name: 'Nazca bajo Sudamérica',
    rate: '~65 mm/año',
    detail: 'La convergencia más rápida del continente. Genera los megaterremotos de Chile, Perú y Ecuador.',
  },
  {
    name: 'Cocos bajo Norteamérica',
    rate: '~60 mm/año',
    detail: 'Fosa Mesoamericana: México, Guatemala, El Salvador.',
  },
  {
    name: 'Caribe vs Sudamérica',
    rate: '~20 mm/año',
    detail: 'Transcurrente. Falla Boconó (Venezuela) y Santa Marta–Bucaramanga (Colombia).',
  },
  {
    name: 'Caribe vs Norteamérica',
    rate: '~20 mm/año',
    detail: 'Falla Septentrional y Enriquillo: Haití 2010 salió de aquí.',
  },
  {
    name: 'Bloque de Panamá',
    rate: '~15 mm/año',
    detail: 'Se acuña entre Nazca, Caribe y Sudamérica; deforma el Chocó y Costa Rica.',
  },
]

const MYTHS = [
  {
    myth: '"El clima caluroso anuncia temblor"',
    truth:
      'La ruptura ocurre a kilómetros de profundidad, donde la atmósfera no llega. Ningún estudio con catálogos largos encuentra correlación.',
  },
  {
    myth: '"Los animales lo predicen"',
    truth:
      'Hay anécdotas, no señales reproducibles. Cuando se ha medido de forma sistemática, el comportamiento animal no distingue días con sismo de días sin él.',
  },
  {
    myth: '"Marcos de puertas son el lugar más seguro"',
    truth:
      'Cierto en casas de adobe de hace un siglo. En construcción moderna lo correcto es agacharse, cubrirse y agarrarse bajo una mesa firme.',
  },
  {
    myth: '"Los pequeños liberan energía y evitan el grande"',
    truth:
      'Harían falta unos 32 000 sismos M4 para igualar un M7. La sismicidad menor no descarga la falla.',
  },
  {
    myth: '"Existe una máquina que predice terremotos"',
    truth:
      'No. Lo que sí existe son alertas tempranas: detectan la onda P de un sismo ya ocurrido y dan segundos de ventaja antes de la onda S.',
  },
]

export default function Learn() {
  const [sp, setSp] = useState(12)
  const [mag, setMag] = useState(6.5)
  const [dist, setDist] = useState(50)

  // Regla clásica: distancia ≈ (ts − tp) × 8 km/s para distancias regionales.
  const distanceKm = sp * 8

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Por qué tiembla en Latinoamérica" subtitle="El Cinturón de Fuego pasa por casa">
          <div className="space-y-2">
            {PLATES.map((p) => (
              <div key={p.name} className="rounded-xl border border-ink-800 bg-ink-950/40 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-slate-200">{p.name}</span>
                  <span className="font-mono text-xs text-sky-400">{p.rate}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{p.detail}</p>
              </div>
            ))}
          </div>
          <Note>
            Las placas se mueven a la velocidad a la que crecen las uñas. El problema es que la
            falla se traba durante décadas y suelta todo el desplazamiento acumulado en segundos.
          </Note>
        </Card>

        <Card title="Ondas P y S" subtitle="La diferencia que dan los sistemas de alerta temprana">
          <div className="space-y-3">
            <div className="rounded-xl border border-ink-800 bg-ink-950/40 p-3">
              <div className="text-sm font-medium text-sky-300">Onda P — primaria, ~6 km/s</div>
              <p className="mt-1 text-xs text-slate-500">
                Compresional, viaja más rápido, hace poco daño. Es el golpe seco que llega primero.
              </p>
            </div>
            <div className="rounded-xl border border-ink-800 bg-ink-950/40 p-3">
              <div className="text-sm font-medium text-amber-300">Onda S — secundaria, ~3.5 km/s</div>
              <p className="mt-1 text-xs text-slate-500">
                De cizalla, mueve el suelo de lado. Es la que tumba edificios.
              </p>
            </div>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">
                Segundos entre P y S: <b className="font-mono text-slate-200">{sp} s</b>
              </span>
              <input
                type="range"
                min={1}
                max={60}
                value={sp}
                onChange={(e) => setSp(Number(e.target.value))}
                className="mt-1 w-full accent-sky-500"
              />
            </label>
            <Stat
              label="Distancia al epicentro"
              value={`≈ ${distanceKm.toFixed(0)} km`}
              hint="Regla de campo: (ts − tp) × 8 km/s. Contar los segundos entre el golpe y el vaivén da la distancia."
              accent="#38bdf8"
            />
            <Note>
              Un sistema de alerta temprana explota justo esta diferencia: detecta la P cerca del
              epicentro y avisa por radio (a la velocidad de la luz) antes de que llegue la S.
            </Note>
          </div>
        </Card>
      </div>

      <Card title="Cuánta energía es cada magnitud" subtitle="La escala es logarítmica: no es intuición, es aritmética">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">
            Magnitud: <b className="font-mono" style={{ color: magColor(mag) }}>{mag.toFixed(1)}</b>
          </span>
          <input
            type="range"
            min={3}
            max={9.5}
            step={0.1}
            value={mag}
            onChange={(e) => setMag(Number(e.target.value))}
            className="mt-1 w-full accent-sky-500"
          />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Energía equivalente"
            value={`${fmtNum(tntTons(mag) / 1000, 1)} kt`}
            hint="Kilotones de TNT (Hiroshima ≈ 15 kt)"
            accent="#f43f5e"
          />
          <Stat
            label="Equivale a"
            value={`${fmtNum(10 ** (1.5 * (mag - 5)), 0)} sismos M5`}
            hint="Cada punto de magnitud multiplica la energía por 32"
          />
          <Stat
            label="Ruptura típica"
            value={`≈ ${fmtNum(10 ** (0.59 * mag - 2.44), 0)} km de falla`}
            hint="Relación empírica de Wells & Coppersmith (1994)"
            accent="#facc15"
          />
        </div>
        <div className="mt-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">
              A qué distancia estás: <b className="font-mono text-slate-200">{dist} km</b>
            </span>
            <input
              type="range"
              min={5}
              max={500}
              step={5}
              value={dist}
              onChange={(e) => setDist(Number(e.target.value))}
              className="mt-1 w-full accent-sky-500"
            />
          </label>
          {(() => {
            const mmi = mmiAtkinsonWald(mag, Math.sqrt(dist ** 2 + 15 ** 2))
            return (
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-950/40 p-3">
                <span
                  className="w-12 rounded-md py-1.5 text-center font-mono text-lg font-bold text-slate-950"
                  style={{ background: mmiColor(mmi) }}
                >
                  {mmiRoman(mmi)}
                </span>
                <span className="text-xs text-slate-400">
                  Intensidad estimada a {dist} km de un M{mag.toFixed(1)} de 15 km de profundidad.
                  Mueve los controles: la distancia pesa más que la magnitud.
                </span>
              </div>
            )
          })()}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Qué hacer" subtitle="Lo que de verdad cambia el resultado">
          <ol className="space-y-2 text-xs leading-relaxed text-slate-400">
            <li>
              <b className="text-slate-200">Antes.</b> Anclar a la pared lo que puede caerte encima:
              biblioteca, televisor, calentador. Es la causa más común de heridos en sismos moderados.
            </li>
            <li>
              <b className="text-slate-200">Antes.</b> Kit con agua para 3 días, linterna, radio,
              copia de documentos y medicinas. Punto de encuentro familiar acordado, porque la red
              celular se cae.
            </li>
            <li>
              <b className="text-slate-200">Durante.</b> Agáchate, cúbrete y agárrate. No corras a la
              calle ni uses ascensores: la mayoría de golpes ocurren al intentar salir.
            </li>
            <li>
              <b className="text-slate-200">Durante, en la costa.</b> Si el sismo dura más de un
              minuto o cuesta mantenerse en pie, sube a terreno alto sin esperar aviso oficial. El
              tsunami local puede llegar en 15 minutos.
            </li>
            <li>
              <b className="text-slate-200">Después.</b> Cierra el gas, revisa estructura antes de
              volver a entrar, y cuenta con réplicas: la mayor suele estar ~1.2 magnitudes por debajo
              del principal y puede llegar días después.
            </li>
          </ol>
        </Card>

        <Card title="Mitos" subtitle="Que circulan cada vez que tiembla">
          <div className="space-y-2">
            {MYTHS.map((m) => (
              <div key={m.myth} className="rounded-xl border border-ink-800 bg-ink-950/40 p-3">
                <div className="text-xs font-medium text-rose-300">{m.myth}</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{m.truth}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Fuentes y modelos usados" subtitle="Todo el cálculo es reproducible">
        <ul className="space-y-1.5 text-xs text-slate-400">
          <li>
            <b className="text-slate-200">Catálogo:</b> USGS ComCat vía la API FDSN event, y el
            catálogo integrado del Servicio Geológico Colombiano, que llega hasta el año 1610 en
            Colombia. Se pueden fundir los dos quitando duplicados.
          </li>
          <li>
            <b className="text-slate-200">Gutenberg &amp; Richter (1944):</b> log N = a − bM. b por
            máxima verosimilitud (Aki 1965), error por Shi &amp; Bolt (1982), completitud por máxima
            curvatura (Wiemer &amp; Wyss 2000).
          </li>
          <li>
            <b className="text-slate-200">Omori–Utsu:</b> n(t) = K (t + c)^−p, ajustada por máxima
            verosimilitud sobre el proceso puntual. Modelo genérico de Reasenberg &amp; Jones (1989)
            cuando la secuencia es corta.
          </li>
          <li>
            <b className="text-slate-200">Desagrupamiento:</b> ventanas de Gardner &amp; Knopoff (1974).
          </li>
          <li>
            <b className="text-slate-200">ETAS:</b> Ogata (1988), en versión temporal simplificada
            calibrada con la razón de ramificación observada.
          </li>
          <li>
            <b className="text-slate-200">Intensidad:</b> IPE global de Allen, Wald &amp; Worden
            (2012), con Atkinson &amp; Wald (2007) como alternativa, y conversión MMI–PGA de Worden
            et al. (2012). Ambas se contrastan dentro de la app contra la intensidad que el USGS
            midió en cada sismo.
          </li>
        </ul>
      </Card>
    </div>
  )
}

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { Quake } from "../types";
import type { Lang } from "../i18n/shell";
import { Card, Empty, Note, Stat, inputClass } from "./ui";
import {
  fitGutenbergRichter,
  fmd,
  interpretB,
  magnitudeForReturnPeriod,
  returnPeriod,
} from "../science/gutenbergRichter";
import { decluster } from "../science/declustering";
import {
  buildCrossSection,
  type ProfileAxis,
} from "../science/crossSection";
import { energyJoules } from "../science/stats";
import { fmtNum, fmtYears, magColor } from "../ui/format";

const axis = { stroke: "#475569", fontSize: 11 };
const grid = { stroke: "#1e293b", strokeDasharray: "3 3" };
const tooltipStyle = {
  background: "#101a2c",
  border: "1px solid #1f3050",
  borderRadius: 12,
  fontSize: 12,
  color: "#e2e8f0",
};

export default function Analytics({
  quakes,
  onFocus,
  onIntensity,
  lang = "es",
}: {
  quakes: Quake[];
  onFocus?: (q: Quake) => void;
  onIntensity?: (q: Quake) => void;
  lang?: Lang;
}) {
  const [profileAxis, setProfileAxis] = useState<ProfileAxis>("WE");
  const en = lang === "en";

  const crossSection = useMemo(
    () => buildCrossSection(quakes, profileAxis, 2200),
    [quakes, profileAxis],
  );

  const crossGroups = useMemo(() => {
    const shallow = crossSection.points.filter((p) => p.depthKm < 70);
    const intermediate = crossSection.points.filter(
      (p) => p.depthKm >= 70 && p.depthKm < 300,
    );
    const deep = crossSection.points.filter((p) => p.depthKm >= 300);
    return { shallow, intermediate, deep };
  }, [crossSection]);
  const analysis = useMemo(() => {
    if (quakes.length < 30) return null;
    const gr = fitGutenbergRichter(quakes);
    const bins = fmd(
      quakes.map((q) => q.mag),
      0.1,
    );

    const fmdChart = bins
      .filter((b) => b.cumulative > 0)
      .map((b) => ({
        mag: b.mag,
        acumulado: b.cumulative,
        incremental: b.count || null,
        ajuste: gr && b.mag >= gr.mc ? 10 ** (gr.a - gr.b * b.mag) : null,
      }));

    const byYear = new Map<
      number,
      { eventos: number; energia: number; max: number }
    >();
    const byDepth = new Map<number, number>();
    const byHour = new Array(24).fill(0) as number[];
    for (const q of quakes) {
      const y = new Date(q.time).getUTCFullYear();
      const cur = byYear.get(y) ?? { eventos: 0, energia: 0, max: 0 };
      cur.eventos++;
      cur.energia += energyJoules(q.mag);
      cur.max = Math.max(cur.max, q.mag);
      byYear.set(y, cur);

      const dBin = Math.min(Math.floor(q.depth / 25) * 25, 700);
      byDepth.set(dBin, (byDepth.get(dBin) ?? 0) + 1);
      byHour[new Date(q.time).getUTCHours()]++;
    }

    const yearChart = [...byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([anio, v]) => ({
        anio,
        eventos: v.eventos,
        energia: v.energia / 1e15,
        max: v.max,
      }));

    const depthChart = [...byDepth.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([km, n]) => ({ km, eventos: n }));

    const hourChart = byHour.map((n, h) => ({ hora: h, eventos: n }));

    const scatter = quakes
      .filter((_, i) => i % Math.max(1, Math.floor(quakes.length / 2500)) === 0)
      .map((q) => ({ depth: q.depth, mag: q.mag, z: 1 }));

    const cluster = decluster(quakes);

    return { gr, fmdChart, yearChart, depthChart, hourChart, scatter, cluster };
  }, [quakes]);

  if (!analysis)
    return (
      <Empty>
        {en
          ? "At least 30 events are required for statistical analysis."
          : "Se necesitan al menos 30 eventos para el análisis estadístico."}
      </Empty>
    );
  const { gr, fmdChart, yearChart, depthChart, hourChart, scatter, cluster } =
    analysis;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={en ? "b-value" : "Valor b"}
          value={gr ? gr.b.toFixed(2) : "—"}
          hint={
            gr
              ? `± ${gr.bErr.toFixed(2)} · ${interpretB(gr.b).label}`
              : undefined
          }
          accent="#38bdf8"
        />
        <Stat
          label={en ? "Completeness Mc" : "Completitud Mc"}
          value={gr ? `M ${gr.mc.toFixed(1)}` : "—"}
          hint={
            en
              ? "Below this magnitude the catalog misses events"
              : "Bajo esta magnitud el catálogo pierde eventos"
          }
        />
        <Stat
          label={en ? "Clustered aftershocks" : "Réplicas del catálogo"}
          value={`${(cluster.clusteredFraction * 100).toFixed(0)}%`}
          hint={
            en
              ? `${cluster.clustered.length.toLocaleString("en-US")} dependent of ${quakes.length.toLocaleString("en-US")}`
              : `${cluster.clustered.length.toLocaleString("es-CO")} dependientes de ${quakes.length.toLocaleString("es-CO")}`
          }
          accent="#fb923c"
        />
        <Stat
          label={en ? "M6 return period" : "Retorno M6"}
          value={gr ? fmtYears(returnPeriod(gr, 6), lang) : "—"}
          hint={
            gr
              ? en
                ? `M ${magnitudeForReturnPeriod(gr, 100).toFixed(1)} every 100 yr`
                : `M ${magnitudeForReturnPeriod(gr, 100).toFixed(1)} cada 100 años`
              : undefined
          }
          accent="#facc15"
        />
      </div>

      <Card
        title={
          en
            ? `2D Hypocentral Cross-Section (${crossSection.startLabel} → ${crossSection.endLabel})`
            : `Perfil hipocentral en corte transversal 2D (${crossSection.startLabel} → ${crossSection.endLabel})`
        }
        subtitle={
          en
            ? "Horizontal distance along profile (km) vs depth (km). Reveals subduction slabs (Wadati–Benioff zones) and seismic nests."
            : "Distancia horizontal a lo largo del perfil (km) vs profundidad (km). Permite visualizar la placa subducida (Zona de Wadati–Benioff) o nidos sísmicos."
        }
        right={
          <select
            className={inputClass}
            value={profileAxis}
            onChange={(e) => setProfileAxis(e.target.value as ProfileAxis)}
            aria-label={en ? "Profile orientation" : "Orientación del perfil"}
          >
            <option value="WE">W → E</option>
            <option value="SN">S → N</option>
            <option value="NWSE">NW → SE</option>
            <option value="SWNE">SW → NE</option>
          </select>
        }
      >
        <div className="h-72">
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
              <CartesianGrid {...grid} />
              <XAxis
                type="number"
                dataKey="distKm"
                name={en ? "Distance" : "Distancia"}
                unit=" km"
                domain={[0, crossSection.lengthKm]}
                {...axis}
              />
              <YAxis
                type="number"
                dataKey="depthKm"
                name={en ? "Depth" : "Profundidad"}
                unit=" km"
                reversed
                domain={[0, "auto"]}
                {...axis}
              />
              <ZAxis type="number" dataKey="mag" range={[14, 90]} />
              <RTooltip
                contentStyle={tooltipStyle}
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(v: unknown, n: unknown) => [
                  `${Number(v).toFixed(1)} km`,
                  String(n),
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Scatter
                name={en ? "Shallow (<70 km)" : "Superficial (<70 km)"}
                data={crossGroups.shallow}
                fill="#f87171"
                fillOpacity={0.55}
                isAnimationActive={false}
              />
              <Scatter
                name={
                  en ? "Intermediate (70–300 km)" : "Intermedio (70–300 km)"
                }
                data={crossGroups.intermediate}
                fill="#facc15"
                fillOpacity={0.6}
                isAnimationActive={false}
              />
              <Scatter
                name={en ? "Deep (>300 km)" : "Profundo (>300 km)"}
                data={crossGroups.deep}
                fill="#60a5fa"
                fillOpacity={0.7}
                isAnimationActive={false}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <Note>
          {en
            ? "Select a subduction zone (e.g. Chile, Peru, Japan, Tonga, or Mariana) and choose the W→E or NW→SE axis to see how hypocenters dip into the mantle along the subducting oceanic slab."
            : "Selecciona una zona de subducción (p. ej. Chile, Perú, Japón, Tonga o Marianas) y prueba la orientación W→E o NW→SE para ver cómo se inclina la losa oceánica subducida hacia el manto."}
        </Note>
      </Card>

      <Card
        title="Ley de Gutenberg–Richter"
        subtitle="Cuántos sismos hay de cada tamaño. La recta del ajuste es log N = a − b·M"
      >
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart
              data={fmdChart}
              margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
            >
              <CartesianGrid {...grid} />
              <XAxis
                dataKey="mag"
                {...axis}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <YAxis
                scale="log"
                domain={["auto", "auto"]}
                allowDataOverflow
                {...axis}
              />
              <RTooltip
                contentStyle={tooltipStyle}
                formatter={(v: unknown, name: unknown) => [
                  fmtNum(Number(v), 1),
                  String(name),
                ]}
                labelFormatter={(v: unknown) => `M ${Number(v).toFixed(1)}`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="incremental"
                name="Por bin"
                fill="#1e40af"
                opacity={0.65}
              />
              <Line
                type="monotone"
                dataKey="acumulado"
                name="Acumulado (N ≥ M)"
                stroke="#38bdf8"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="ajuste"
                name="Ajuste G–R"
                stroke="#f97316"
                strokeDasharray="5 4"
                dot={false}
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Note>
          El valor b describe la proporción entre sismos pequeños y grandes.
          Alrededor de 1 es lo normal en corteza continental; valores bajos
          indican mayor peso relativo de los sismos grandes. El ajuste solo es
          válido por encima de Mc.
        </Note>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Actividad por año"
          subtitle="Conteo de eventos y energía liberada"
        >
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart
                data={yearChart}
                margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
              >
                <CartesianGrid {...grid} />
                <XAxis dataKey="anio" {...axis} />
                <YAxis yAxisId="l" {...axis} />
                <YAxis yAxisId="r" orientation="right" {...axis} />
                <RTooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: unknown, n: unknown) => [
                    n === "Energía (PJ)"
                      ? fmtNum(Number(v), 2)
                      : fmtNum(Number(v), 0),
                    String(n),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  yAxisId="l"
                  dataKey="eventos"
                  name="Eventos"
                  fill="#1d4ed8"
                />
                <Line
                  yAxisId="r"
                  type="monotone"
                  dataKey="energia"
                  name="Energía (PJ)"
                  stroke="#f43f5e"
                  dot={false}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Note>
            La energía crece 32 veces por cada unidad de magnitud: un solo M8
            libera más que todos los M6 de una década juntos.
          </Note>
        </Card>

        <Card title="Distribución de profundidad" subtitle="Bins de 25 km">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart
                data={depthChart}
                margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
              >
                <CartesianGrid {...grid} />
                <XAxis dataKey="km" {...axis} unit=" km" />
                <YAxis {...axis} />
                <RTooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(v: unknown) =>
                    `${Number(v)}–${Number(v) + 25} km`
                  }
                />
                <Bar dataKey="eventos" name="Eventos">
                  {depthChart.map((d) => (
                    <Cell
                      key={d.km}
                      fill={
                        d.km < 70
                          ? "#f87171"
                          : d.km < 300
                            ? "#facc15"
                            : "#60a5fa"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Note>
            Rojo = superficial (&lt; 70 km, el más dañino), amarillo =
            intermedio, azul = profundo dentro de la placa subducida.
          </Note>
        </Card>

        <Card title="Profundidad vs magnitud" subtitle="Muestra del catálogo">
          <div className="h-64">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis
                  type="number"
                  dataKey="depth"
                  name="Profundidad"
                  unit=" km"
                  {...axis}
                />
                <YAxis
                  type="number"
                  dataKey="mag"
                  name="Magnitud"
                  domain={["auto", "auto"]}
                  {...axis}
                />
                <ZAxis type="number" dataKey="z" range={[12, 12]} />
                <RTooltip
                  contentStyle={tooltipStyle}
                  cursor={{ strokeDasharray: "3 3" }}
                />
                <Scatter data={scatter} fill="#38bdf8" fillOpacity={0.35} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title="Hora del día (UTC)"
          subtitle="Prueba de que los sismos no prefieren la madrugada"
        >
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart
                data={hourChart}
                margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
              >
                <CartesianGrid {...grid} />
                <XAxis dataKey="hora" {...axis} />
                <YAxis {...axis} />
                <RTooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(v: unknown) => `${Number(v)}:00 UTC`}
                />
                <Bar dataKey="eventos" name="Eventos" fill="#0891b2" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Note>
            Un reparto plano confirma que no existe "hora sísmica": la sensación
            contraria viene de que de noche se sienten más.
          </Note>
        </Card>
      </div>

      <Card title="Los diez más fuertes del catálogo">
        <div className="grid gap-2 sm:grid-cols-2">
          {[...quakes]
            .sort((a, b) => b.mag - a.mag)
            .slice(0, 10)
            .map((q) => (
              <div
                key={q.id}
                className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-950/50 px-3 py-2 transition hover:border-ink-700"
              >
                <span
                  className="font-mono text-lg font-bold"
                  style={{ color: magColor(q.mag) }}
                >
                  {q.mag.toFixed(1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-200">
                    {q.place}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {new Date(q.time).getUTCFullYear()} · {q.depth.toFixed(0)}{" "}
                    km de profundidad
                  </span>
                </span>
                <div className="flex shrink-0 gap-1">
                  {onFocus && (
                    <button
                      type="button"
                      onClick={() => onFocus(q)}
                      className="rounded border border-ink-700 bg-ink-900 px-2 py-1 text-[11px] text-slate-300 transition hover:border-sky-500/50 hover:text-white"
                      title="Ver en el mapa"
                    >
                      Mapa
                    </button>
                  )}
                  {onIntensity && (
                    <button
                      type="button"
                      onClick={() => onIntensity(q)}
                      className="rounded border border-ink-700 bg-ink-900 px-2 py-1 text-[11px] text-slate-300 transition hover:border-sky-500/50 hover:text-white"
                      title="Estimar sacudida MMI"
                    >
                      MMI
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}

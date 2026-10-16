import { useEffect, useMemo, useState } from "react";
import type { Quake } from "../types";
import { CITIES } from "../data/cities";
import {
  DEFAULT_IPE,
  IPE_MODELS,
  SITE_CLASSES,
  buildResponseSpectrum,
  buildSyntheticWaveform,
  estimateWaveArrivals,
  hypocentralKm,
  inferTectonicRegime,
  mmiColor,
  mmiLevel,
  mmiRoman,
  mmiToPga,
  pgaToG,
  radiusForMmi,
  seismicMomentNm,
  siteClassById,
  wellsCoppersmithLength,
  type FocalStyle,
  type SiteClassId,
} from "../science/intensity";
import { fmtEnergy, haversineKm, tntTons } from "../science/stats";
import { fmtDateTime, fmtNum, magColor } from "../ui/format";
import { localeFor, type Lang } from "../i18n/shell";
import { downloadQuakeCardPng } from "../utils/quakeCardPng";

interface ImpactRow {
  city: (typeof CITIES)[number];
  distKm: number;
  rhypoKm: number;
  mmi: number;
  pgaPctG: number;
  label: string;
  nearRupture: boolean;
}

interface Props {
  quake: Quake;
  onClose: () => void;
  onFocus?: (q: Quake) => void;
  onShowRings?: (q: Quake) => void;
  userLocation?: { lat: number; lon: number } | null;
  lang?: Lang;
}

function FocalBeachball({
  style,
  color,
  title,
}: {
  style: FocalStyle;
  color: string;
  title: string;
}) {
  return (
    <svg
      viewBox="0 0 52 52"
      className="h-12 w-12 shrink-0"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <circle
        cx={26}
        cy={26}
        r={22}
        fill={style === "normal" || style === "intraslab" ? color : "#0f172a"}
        stroke="#64748b"
        strokeWidth={1.5}
      />
      {style === "thrust" && (
        <path
          d="M 26 4 Q 13 26 26 48 Q 39 26 26 4 Z"
          fill={color}
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      )}
      {(style === "normal" || style === "intraslab") && (
        <path
          d="M 26 4 Q 14 26 26 48 Q 38 26 26 4 Z"
          fill="#0f172a"
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      )}
      {style === "strike-slip" && (
        <>
          <path
            d="M 26 26 L 10.4 10.4 A 22 22 0 0 1 41.6 10.4 Z M 26 26 L 41.6 41.6 A 22 22 0 0 1 10.4 41.6 Z"
            fill={color}
          />
          <line
            x1={10.4}
            y1={10.4}
            x2={41.6}
            y2={41.6}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
          <line
            x1={41.6}
            y1={10.4}
            x2={10.4}
            y2={41.6}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        </>
      )}
      <circle
        cx={26}
        cy={26}
        r={22}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={1.2}
      />
    </svg>
  );
}

export default function QuakeIntensityPanel({
  quake,
  onClose,
  onFocus,
  onShowRings,
  userLocation = null,
  lang = "es",
}: Props) {
  const en = lang === "en";
  const locale = localeFor(lang);
  const ipe = IPE_MODELS[DEFAULT_IPE];
  const [customDistKm, setCustomDistKm] = useState(50);
  const [siteId, setSiteId] = useState<SiteClassId>("rock");
  const [waveTab, setWaveTab] = useState<"waves" | "spectrum">("waves");
  const site = siteClassById(siteId);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const rows = useMemo<ImpactRow[]>(() => {
    const srl = wellsCoppersmithLength(quake.mag);
    return CITIES.map((city) => {
      const distKm = haversineKm(quake.lat, quake.lon, city.lat, city.lon);
      const rhypoKm = hypocentralKm(distKm, quake.depth);
      const rawMmi = ipe.mmi(quake.mag, rhypoKm) + site.deltaMmi;
      const mmi = Math.max(1, Math.min(12, rawMmi));
      const pgaPctG = pgaToG(mmiToPga(mmi)) * 100;
      const nearRupture = quake.mag >= 7.0 && distKm < srl / 2;
      return {
        city,
        distKm,
        rhypoKm,
        mmi,
        pgaPctG,
        label: mmiLevel(mmi).label,
        nearRupture,
      };
    })
      .filter((r) => r.mmi >= 2)
      .sort((a, b) => b.mmi - a.mmi);
  }, [quake, ipe, site.deltaMmi]);

  const mmiFnWithSite = useMemo(
    () => (mag: number, rhypoKm: number) =>
      Math.max(1, Math.min(12, ipe.mmi(mag, rhypoKm) + site.deltaMmi)),
    [ipe, site.deltaMmi],
  );

  /** Radios de isosistas para mostrar en el subtítulo. */
  const iso6km = radiusForMmi(quake.mag, 6, quake.depth, mmiFnWithSite);
  const iso5km = radiusForMmi(quake.mag, 5, quake.depth, mmiFnWithSite);

  const epicentralMmi = mmiFnWithSite(quake.mag, hypocentralKm(0, quake.depth));
  const maxMmi = Math.max(rows[0]?.mmi ?? 0, epicentralMmi);

  const customRhypo = hypocentralKm(customDistKm, quake.depth);
  const customMmi = mmiFnWithSite(quake.mag, customRhypo);
  const customPgaPctG = pgaToG(mmiToPga(customMmi)) * 100;
  const customLvl = mmiLevel(customMmi);
  const arrivals = useMemo(
    () => estimateWaveArrivals(customRhypo, quake.depth),
    [customRhypo, quake.depth],
  );
  const waveform = useMemo(
    () =>
      buildSyntheticWaveform(
        quake.mag,
        customRhypo,
        quake.depth,
        site.deltaMmi,
      ),
    [quake.mag, customRhypo, quake.depth, site.deltaMmi],
  );
  const waveformPath = useMemo(() => {
    const w = 520;
    const h = 52;
    const mid = h / 2;
    return waveform.samples
      .map((v, i) => {
        const x = (i / Math.max(1, waveform.samples.length - 1)) * w;
        const y = mid - v * (mid - 4);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [waveform]);
  const srlKm = wellsCoppersmithLength(quake.mag);
  const m0 = seismicMomentNm(quake.mag);
  const m0Exp = Math.floor(Math.log10(m0));
  const m0Mantissa = m0 / 10 ** m0Exp;
  const regime = inferTectonicRegime(quake);

  const spectrum = useMemo(
    () => buildResponseSpectrum(quake.mag, customRhypo, siteId, ipe.mmi),
    [quake.mag, customRhypo, siteId, ipe.mmi],
  );
  const rockSpectrum = useMemo(
    () => buildResponseSpectrum(quake.mag, customRhypo, "rock", ipe.mmi),
    [quake.mag, customRhypo, ipe.mmi],
  );
  const spectrumPaths = useMemo(() => {
    const w = 520;
    const h = 56;
    const maxT = 3.0;
    const maxSa = Math.max(
      1e-4,
      spectrum.sdsG * 1.15,
      rockSpectrum.sdsG * 1.15,
    );
    const toPath = (pts: { periodSec: number; saG: number }[]) =>
      pts
        .map((p, i) => {
          const x = (p.periodSec / maxT) * w;
          const y = h - 6 - (p.saG / maxSa) * (h - 14);
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    return {
      sitePath: toPath(spectrum.points),
      rockPath: toPath(rockSpectrum.points),
      tsX: (spectrum.tsSec / maxT) * w,
    };
  }, [spectrum, rockSpectrum]);

  const userImpact = useMemo(() => {
    if (!userLocation) return null;
    const distKm = haversineKm(
      quake.lat,
      quake.lon,
      userLocation.lat,
      userLocation.lon,
    );
    const rhypoKm = hypocentralKm(distKm, quake.depth);
    const mmi = mmiFnWithSite(quake.mag, rhypoKm);
    const pgaPctG = pgaToG(mmiToPga(mmi)) * 100;
    return { distKm, mmi, pgaPctG, label: mmiLevel(mmi).label };
  }, [userLocation, quake, mmiFnWithSite]);

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center"
      onClick={onClose}
    >
      {/* Fondo difuminado */}
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-700/60 bg-slate-900 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-start gap-3 border-b border-slate-800 p-5">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-slate-950"
              style={{ background: magColor(quake.mag) }}
            >
              {quake.mag.toFixed(1)}
            </div>
            <FocalBeachball
              style={regime.style}
              color={magColor(quake.mag)}
              title={
                en
                  ? `${regime.mechanismEn} · Nodal plane φ=${regime.nodalPlane.strike}° δ=${regime.nodalPlane.dip}° λ=${regime.nodalPlane.rake}°`
                  : `${regime.mechanismEs} · Plano nodal φ=${regime.nodalPlane.strike}° δ=${regime.nodalPlane.dip}° λ=${regime.nodalPlane.rake}°`
              }
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-slate-100">
              {quake.place}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {fmtDateTime(quake.time)} · Prof. {quake.depth.toFixed(0)} km ·{" "}
              {quake.lat.toFixed(2)}°, {quake.lon.toFixed(2)}°
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
              <span>
                {en ? "Max est. intensity:" : "Intensidad máxima estimada:"}{" "}
                <b
                  className="rounded px-1.5 py-0.5 text-slate-950"
                  style={{ background: mmiColor(maxMmi) }}
                >
                  MMI {mmiRoman(maxMmi)}
                </b>
              </span>
              {iso6km > 2 && (
                <span>
                  {en ? "Radius MMI VI ≈" : "Radio MMI VI ≈"}{" "}
                  <b className="text-slate-200">{iso6km.toFixed(0)} km</b>
                </span>
              )}
              {iso5km > 2 && (
                <span>
                  {en ? "Radius MMI V ≈" : "Radio MMI V ≈"}{" "}
                  <b className="text-slate-200">{iso5km.toFixed(0)} km</b>
                </span>
              )}
              <span>
                {en ? "Energy:" : "Energía:"}{" "}
                <b className="font-mono text-slate-200">
                  {fmtEnergy(quake.mag)}
                </b>{" "}
                ({fmtNum(tntTons(quake.mag) / 1000, 1, locale)} kt TNT)
              </span>
              <span>
                M₀:{" "}
                <b className="font-mono text-slate-200">
                  {m0Mantissa.toFixed(1)}×10^{m0Exp} N·m
                </b>
              </span>
              {srlKm >= 1 && (
                <span>
                  {en ? "Est. rupture:" : "Ruptura est.:"}{" "}
                  <b className="font-mono text-slate-200">
                    ≈ {srlKm.toFixed(0)} km
                  </b>
                </span>
              )}
              <span title={en ? regime.mechanismEn : regime.mechanismEs}>
                {en ? "Regime:" : "Régimen:"}{" "}
                <b className="text-sky-300">
                  {en ? regime.labelEn : regime.labelEs}
                </b>{" "}
                <span className="font-mono text-[10px] text-slate-500">
                  (φ={regime.nodalPlane.strike}° δ={regime.nodalPlane.dip}° λ=
                  {regime.nodalPlane.rake}°)
                </span>
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
              {onFocus && (
                <button
                  type="button"
                  onClick={() => {
                    onFocus(quake);
                    onClose();
                  }}
                  className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-300 transition hover:bg-sky-500/20"
                >
                  {en ? "Focus on map" : "Enfocar en el mapa"}
                </button>
              )}
              {onShowRings && (
                <button
                  type="button"
                  onClick={() => {
                    onShowRings(quake);
                    onClose();
                  }}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20"
                >
                  ◎ {en ? "Map isoseismals" : "Isosistas en el mapa"}
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  downloadQuakeCardPng(
                    quake,
                    rows.map((r) => ({
                      name: r.city.name,
                      country: r.city.country,
                      distKm: r.distKm,
                      mmi: r.mmi,
                      pgaPctG: r.pgaPctG,
                    })),
                    maxMmi,
                    en ? site.nameEn : site.name,
                    lang,
                  )
                }
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
              >
                ↓ {en ? "Download PNG card" : "Descargar tarjeta PNG"}
              </button>
              <a
                href={quake.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300 transition hover:border-slate-600 hover:text-white"
              >
                {en ? "Official page" : "Ficha oficial"} (
                {quake.source ?? "USGS"}) ↗
              </a>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200 transition"
            aria-label={en ? "Close" : "Cerrar"}
            title={en ? "Close (Esc)" : "Cerrar (Esc)"}
          >
            ✕
          </button>
        </div>

        {/* Impacto en la ubicación del usuario (si está activa) */}
        {userImpact && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-sky-500/10 px-5 py-2.5 text-xs">
            <span className="text-sky-200">
              📍 {en ? "At your location" : "En tu ubicación"}:{" "}
              <b className="font-mono">{userImpact.distKm.toFixed(0)} km</b>{" "}
              {en ? "from epicenter" : "del epicentro"}
            </span>
            <div className="flex items-center gap-2">
              <span
                className="rounded px-2 py-0.5 font-mono text-xs font-bold text-slate-950"
                style={{ background: mmiColor(userImpact.mmi) }}
              >
                MMI {mmiRoman(userImpact.mmi)}
              </span>
              <span className="font-mono text-sky-300">
                {userImpact.pgaPctG < 1
                  ? `${userImpact.pgaPctG.toFixed(2)}% g`
                  : `${userImpact.pgaPctG.toFixed(1)}% g`}
              </span>
              <span className="text-slate-300">{userImpact.label}</span>
            </div>
          </div>
        )}

        {/* Calculadora rápida de distancia + selector de suelo Vs30 */}
        <div className="border-b border-slate-800 bg-slate-950/60 px-5 py-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <label className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-slate-400">
                {en ? "Soil (Vs30):" : "Suelo (Vs30):"}
              </span>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value as SiteClassId)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
              >
                {Object.values(SITE_CLASSES).map((s) => (
                  <option key={s.id} value={s.id}>
                    {en ? s.nameEn : s.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-[11px] text-slate-500">
              {en ? site.descriptionEn : site.description}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <label className="flex flex-1 items-center gap-3 min-w-[220px]">
              <span className="whitespace-nowrap text-[11px] uppercase tracking-wider text-slate-400">
                {en ? "Simulate at" : "Simular a"}{" "}
                <b className="font-mono text-slate-100">{customDistKm} km</b>:
              </span>
              <input
                type="range"
                min={0}
                max={600}
                step={5}
                value={customDistKm}
                onChange={(e) => setCustomDistKm(Number(e.target.value))}
                className="w-full accent-sky-500"
              />
            </label>
            <div className="flex items-center gap-2.5">
              <span
                className="rounded px-2 py-0.5 font-mono text-xs font-bold text-slate-950"
                style={{ background: mmiColor(customMmi) }}
              >
                MMI {mmiRoman(customMmi)}
              </span>
              <span className="font-mono text-xs text-sky-300">
                {customPgaPctG < 1
                  ? `${customPgaPctG.toFixed(2)}% g`
                  : `${customPgaPctG.toFixed(1)}% g`}
              </span>
              <span className="text-xs text-slate-400">{customLvl.label}</span>
            </div>
          </div>

          {/* Tiempos de llegada P/S + Sismograma sintético SVG / Espectro de Respuesta Sa(T) */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-900/70 px-3 py-2">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-3 text-slate-400">
                <span>
                  <b className="text-sky-400">P:</b>{" "}
                  <span className="font-mono text-slate-200">
                    +{arrivals.pSec.toFixed(1)} s
                  </span>
                </span>
                <span>
                  <b className="text-amber-400">S:</b>{" "}
                  <span className="font-mono text-slate-200">
                    +{arrivals.sSec.toFixed(1)} s
                  </span>
                </span>
                <span
                  title={
                    en
                      ? "Lead time between P-wave detection and destructive S-wave arrival"
                      : "Margen entre la detección de la onda P y la llegada de la onda S destructiva"
                  }
                >
                  ⚡ {en ? "EEW window (S−P):" : "Ventana alerta (S−P):"}{" "}
                  <b className="font-mono text-emerald-400">
                    {arrivals.warningLeadSec.toFixed(1)} s
                  </b>
                </span>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/80 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setWaveTab("waves")}
                  className={`rounded-md px-2 py-0.5 font-medium transition ${
                    waveTab === "waves"
                      ? "bg-sky-500/20 text-sky-300"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {en ? "P/S Seismogram" : "Sismograma P/S"}
                </button>
                <button
                  type="button"
                  onClick={() => setWaveTab("spectrum")}
                  className={`rounded-md px-2 py-0.5 font-medium transition ${
                    waveTab === "spectrum"
                      ? "bg-amber-500/20 text-amber-300"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {en ? "Spectrum Sa(T) · Buildings" : "Espectro Sa(T) · Edificios"}
                </button>
              </div>
            </div>

            {waveTab === "waves" ? (
              <svg
                viewBox="0 0 520 52"
                className="h-12 w-full overflow-visible"
                role="img"
                aria-label={
                  en ? "Synthetic seismic waveform" : "Traza sísmica sintética"
                }
              >
                <line
                  x1={0}
                  y1={26}
                  x2={520}
                  y2={26}
                  stroke="#1e293b"
                  strokeDasharray="2 2"
                />
                <line
                  x1={waveform.pRatio * 520}
                  y1={2}
                  x2={waveform.pRatio * 520}
                  y2={50}
                  stroke="#38bdf8"
                  strokeWidth={1}
                  strokeDasharray="3 2"
                />
                <text
                  x={waveform.pRatio * 520 + 4}
                  y={11}
                  fill="#38bdf8"
                  fontSize="9"
                  fontFamily="ui-monospace, monospace"
                >
                  P
                </text>
                <line
                  x1={waveform.sRatio * 520}
                  y1={2}
                  x2={waveform.sRatio * 520}
                  y2={50}
                  stroke="#f59e0b"
                  strokeWidth={1}
                  strokeDasharray="3 2"
                />
                <text
                  x={waveform.sRatio * 520 + 4}
                  y={11}
                  fill="#f59e0b"
                  fontSize="9"
                  fontFamily="ui-monospace, monospace"
                >
                  S
                </text>
                <path
                  d={waveformPath}
                  fill="none"
                  stroke={mmiColor(customMmi)}
                  strokeWidth={1.5}
                />
              </svg>
            ) : (
              <div className="space-y-1.5">
                <svg
                  viewBox="0 0 520 56"
                  className="h-14 w-full overflow-visible"
                  role="img"
                  aria-label={
                    en
                      ? "5%-damped elastic response spectrum Sa(T)"
                      : "Espectro de respuesta elástico Sa(T) al 5%"
                  }
                >
                  <line
                    x1={0}
                    y1={50}
                    x2={520}
                    y2={50}
                    stroke="#1e293b"
                    strokeWidth={1}
                  />
                  {[0.5, 1.0, 1.5, 2.0, 2.5].map((tSec) => {
                    const x = (tSec / 3.0) * 520;
                    return (
                      <g key={tSec}>
                        <line
                          x1={x}
                          y1={6}
                          x2={x}
                          y2={50}
                          stroke="#1e293b"
                          strokeDasharray="2 2"
                        />
                        <text
                          x={x - 8}
                          y={55}
                          fill="#64748b"
                          fontSize="8"
                          fontFamily="ui-monospace, monospace"
                        >
                          {tSec.toFixed(1)}s
                        </text>
                      </g>
                    );
                  })}
                  <line
                    x1={spectrumPaths.tsX}
                    y1={4}
                    x2={spectrumPaths.tsX}
                    y2={50}
                    stroke="#f59e0b"
                    strokeDasharray="3 2"
                  />
                  <text
                    x={spectrumPaths.tsX + 3}
                    y={12}
                    fill="#f59e0b"
                    fontSize="8"
                    fontFamily="ui-monospace, monospace"
                  >
                    Ts={spectrum.tsSec.toFixed(2)}s
                  </text>
                  {siteId !== "rock" && (
                    <path
                      d={spectrumPaths.rockPath}
                      fill="none"
                      stroke="#64748b"
                      strokeWidth={1.2}
                      strokeDasharray="3 2"
                    />
                  )}
                  <path
                    d={spectrumPaths.sitePath}
                    fill="none"
                    stroke={mmiColor(customMmi)}
                    strokeWidth={2}
                  />
                </svg>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                  <div className="flex flex-wrap gap-3 font-mono">
                    <span>
                      {en ? "1–3 stories (0.2s):" : "1–3 pisos (0.2s):"}{" "}
                      <b className="text-slate-200">
                        {(spectrum.resonance.lowRiseG * 100).toFixed(1)}% g
                      </b>
                    </span>
                    <span>
                      {en ? "5–10 stories (0.75s):" : "5–10 pisos (0.75s):"}{" "}
                      <b className="text-slate-200">
                        {(spectrum.resonance.midRiseG * 100).toFixed(1)}% g
                      </b>
                    </span>
                    <span>
                      {en ? "12–20+ stories (1.6s):" : "12–20+ pisos (1.6s):"}{" "}
                      <b className="text-slate-200">
                        {(spectrum.resonance.highRiseG * 100).toFixed(1)}% g
                      </b>
                    </span>
                  </div>
                  <span className="text-amber-300">
                    {en
                      ? spectrum.resonance.vulnerableClassEn
                      : spectrum.resonance.vulnerableClassEs}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modelo usado */}
        <div className="border-b border-slate-800 bg-slate-950/40 px-5 py-2 text-[10px] text-slate-500">
          IPE: {ipe.name} · {ipe.scope}
        </div>

        {/* Tabla de ciudades */}
        <div className="overflow-y-auto">
          {rows.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">
              Ninguna ciudad alcanza MMI II. El sismo es muy débil o muy
              profundo.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-slate-900/95 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Ciudad</th>
                  <th className="px-4 py-2 text-right">Distancia</th>
                  <th className="px-4 py-2 text-center">MMI</th>
                  <th className="px-4 py-2 text-right">PGA est.</th>
                  <th className="px-4 py-2 text-left">Percepción</th>
                  <th className="px-4 py-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = Math.min(100, ((r.mmi - 1) / 11) * 100);
                  return (
                    <tr
                      key={r.city.id}
                      onClick={() =>
                        setCustomDistKm(
                          Math.min(600, Math.max(0, Math.round(r.distKm / 5) * 5)),
                        )
                      }
                      title={
                        en
                          ? "Click to simulate wave arrivals at this distance"
                          : "Haz clic para simular las ondas a esta distancia"
                      }
                      className="cursor-pointer border-t border-slate-800/60 hover:bg-slate-800/30 transition"
                    >
                      <td className="px-4 py-2">
                        <span className="text-slate-200">{r.city.name}</span>
                        <span className="ml-1.5 text-[11px] text-slate-500">
                          {r.city.country}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-slate-400">
                        {r.distKm.toFixed(0)} km
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span
                          className="inline-block w-10 rounded-md py-0.5 text-center font-mono text-xs font-bold text-slate-950"
                          style={{ background: mmiColor(r.mmi) }}
                        >
                          {mmiRoman(r.mmi)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-slate-400">
                        {r.pgaPctG < 1
                          ? `${r.pgaPctG.toFixed(2)}% g`
                          : `${r.pgaPctG.toFixed(1)}% g`}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {r.label}
                        {r.nearRupture && (
                          <div
                            className="mt-1 text-[10px] font-medium text-amber-500"
                            title="Modelo de falla puntual subestima daños cerca de la ruptura (Wells & Coppersmith)"
                          >
                            ⚠️ Cerca de la ruptura
                          </div>
                        )}
                      </td>
                      {/* Barra visual de intensidad */}
                      <td className="px-4 py-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: mmiColor(r.mmi),
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Observado vs predicho (si viene del USGS) */}
        {(quake.mmi != null || quake.cdi != null) && (
          <div className="border-t border-slate-800 bg-slate-950/40 px-5 py-3 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">
              Observado por el USGS:{" "}
            </span>
            {quake.mmi != null && (
              <span className="mr-3">
                ShakeMap{" "}
                <b
                  className="rounded px-1 text-slate-950"
                  style={{ background: mmiColor(quake.mmi) }}
                >
                  MMI {mmiRoman(quake.mmi)}
                </b>
              </span>
            )}
            {quake.cdi != null && (
              <span>
                DYFI{" "}
                <b
                  className="rounded px-1 text-slate-950"
                  style={{ background: mmiColor(quake.cdi) }}
                >
                  CDI {mmiRoman(quake.cdi)}
                </b>
                {quake.felt != null &&
                  ` · ${quake.felt.toLocaleString("es-CO")} reportes`}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-800 px-5 py-3 text-[10px] text-slate-600">
          Intensidad estimada en el epicentro. No considera efecto de sitio
          (suelo blando amplifica). Solo ciudades de la lista interna (
          {CITIES.length} en total).
        </div>
      </div>
    </div>
  );
}

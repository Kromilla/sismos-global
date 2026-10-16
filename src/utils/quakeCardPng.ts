import type { Quake } from "../types";
import { mmiColor, mmiLevel, mmiRoman, wellsCoppersmithLength } from "../science/intensity";
import { fmtEnergy, tntTons } from "../science/stats";
import { fmtDateTime, fmtNum, magColor } from "../ui/format";

export interface CardCityImpact {
  name: string;
  country: string;
  distKm: number;
  mmi: number;
  pgaPctG: number;
}

/**
 * Genera y descarga una tarjeta infográfica en PNG (1200×630) de un sismo
 * usando el API Canvas 2D del navegador.
 */
export function downloadQuakeCardPng(
  quake: Quake,
  impacts: CardCityImpact[],
  maxMmi: number,
  siteLabel: string,
  lang: "es" | "en" = "es",
): void {
  const width = 1200;
  const height = 630;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Fondo oscuro
  ctx.fillStyle = "#070b14";
  ctx.fillRect(0, 0, width, height);

  // Resplandor radial en la esquina derecha (ilustración de ondas/isosistas)
  const accent = magColor(quake.mag);
  const cx = 940;
  const cy = 260;
  const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 260);
  grad.addColorStop(0, `${accent}44`);
  grad.addColorStop(0.5, `${accent}18`);
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Anillos concéntricos de isosistas decorativas
  [210, 155, 105, 60].forEach((r, idx) => {
    const ringMmi = Math.max(3, Math.round(maxMmi) - (3 - idx));
    ctx.strokeStyle = `${mmiColor(ringMmi)}88`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Epicentro central
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fill();

  // Marca superior
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 20px Inter, system-ui, sans-serif";
  ctx.fillText(
    lang === "en" ? "QUAKES GLOBAL · SEISMIC REPORT" : "SISMOS GLOBAL · REPORTE SÍSMICO",
    56,
    58,
  );

  // Insignia de magnitud
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(56, 84, 130, 110, 20);
  ctx.fill();

  ctx.fillStyle = "#070b14";
  ctx.font = "bold 54px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(quake.mag.toFixed(1), 121, 156);
  ctx.textAlign = "left";

  // Lugar y metadatos principales
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 34px Inter, system-ui, sans-serif";
  const placeText =
    quake.place.length > 40 ? `${quake.place.slice(0, 38)}…` : quake.place;
  ctx.fillText(placeText, 210, 128);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "20px Inter, system-ui, sans-serif";
  ctx.fillText(
    `${fmtDateTime(quake.time)} · ${lang === "en" ? "Depth" : "Prof."} ${quake.depth.toFixed(0)} km · (${quake.lat.toFixed(2)}°, ${quake.lon.toFixed(2)}°)`,
    210,
    166,
  );

  // Tarjetas de métricas físicas
  const srl = wellsCoppersmithLength(quake.mag);
  const kt = tntTons(quake.mag) / 1000;
  const stats = [
    {
      label: lang === "en" ? "MAX EST. INTENSITY" : "INTENSIDAD MÁX. EST.",
      value: `MMI ${mmiRoman(maxMmi)} (${mmiLevel(maxMmi).label})`,
      color: mmiColor(maxMmi),
    },
    {
      label: lang === "en" ? "RADIATED ENERGY" : "ENERGÍA LIBERADA",
      value: `${fmtEnergy(quake.mag)} (${fmtNum(kt, 1)} kt TNT)`,
      color: "#f43f5e",
    },
    {
      label: lang === "en" ? "FAULT RUPTURE / SITE" : "RUPTURA / SUELO",
      value:
        srl >= 1
          ? `≈ ${srl.toFixed(0)} km · ${siteLabel.split("(")[0].trim()}`
          : siteLabel.split("(")[0].trim(),
      color: "#38bdf8",
    },
  ];

  stats.forEach((st, i) => {
    const x = 56 + i * 365;
    const y = 224;
    ctx.fillStyle = "#0b1220";
    ctx.strokeStyle = "#1f3050";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, 345, 86, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "bold 13px Inter, system-ui, sans-serif";
    ctx.fillText(st.label, x + 18, y + 28);

    ctx.fillStyle = st.color;
    ctx.font = "bold 21px ui-monospace, monospace";
    ctx.fillText(st.value.slice(0, 28), x + 18, y + 62);
  });

  // Tabla de ciudades cercanas
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 15px Inter, system-ui, sans-serif";
  ctx.fillText(
    lang === "en"
      ? "ESTIMATED SHAKING IN NEARBY CITIES (ALLEN ET AL. 2012 IPE)"
      : "SACUDIDA ESTIMADA EN CIUDADES CERCANAS (IPE ALLEN ET AL. 2012)",
    56,
    352,
  );

  const topCities = impacts.slice(0, 5);
  if (topCities.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = "18px Inter, system-ui, sans-serif";
    ctx.fillText(
      lang === "en"
        ? "No reference cities reach MMI II for this event."
        : "Ninguna ciudad de referencia alcanza MMI II para este sismo.",
      56,
      395,
    );
  } else {
    topCities.forEach((c, idx) => {
      const y = 372 + idx * 40;
      ctx.fillStyle = "#101a2c";
      ctx.beginPath();
      ctx.roundRect(56, y, 1088, 34, 8);
      ctx.fill();

      // Badge MMI
      ctx.fillStyle = mmiColor(c.mmi);
      ctx.beginPath();
      ctx.roundRect(66, y + 5, 56, 24, 6);
      ctx.fill();

      ctx.fillStyle = "#070b14";
      ctx.font = "bold 14px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(mmiRoman(c.mmi), 94, y + 22);
      ctx.textAlign = "left";

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 16px Inter, system-ui, sans-serif";
      ctx.fillText(`${c.name} (${c.country})`, 138, y + 23);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "15px ui-monospace, monospace";
      ctx.fillText(`${c.distKm.toFixed(0)} km`, 560, y + 23);
      ctx.fillText(
        `PGA ≈ ${c.pgaPctG < 1 ? c.pgaPctG.toFixed(2) : c.pgaPctG.toFixed(1)}% g`,
        680,
        y + 23,
      );
      ctx.fillText(mmiLevel(c.mmi).label, 870, y + 23);
    });
  }

  // Pie de tarjeta
  ctx.fillStyle = "#475569";
  ctx.font = "14px Inter, system-ui, sans-serif";
  ctx.fillText(
    lang === "en"
      ? `Source: ${quake.source ?? "USGS"} (${quake.id}) · Empirical estimation, not an official ShakeMap`
      : `Fuente: ${quake.source ?? "USGS"} (${quake.id}) · Estimación empírica, no sustituye a un ShakeMap oficial`,
    56,
    604,
  );

  const dataUrl = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `sismo-M${quake.mag.toFixed(1)}-${quake.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
  a.click();
}

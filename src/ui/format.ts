import { DAY_MS } from "../science/stats";

/** Paleta por magnitud, alineada con la usada en los mapas sísmicos. */
export function magColor(mag: number): string {
  if (mag < 3) return "#38bdf8";
  if (mag < 4) return "#22d3ee";
  if (mag < 5) return "#4ade80";
  if (mag < 6) return "#facc15";
  if (mag < 7) return "#fb923c";
  if (mag < 8) return "#ef4444";
  return "#d946ef";
}

export function depthColor(depthKm: number): string {
  if (depthKm < 30) return "#f87171";
  if (depthKm < 70) return "#fb923c";
  if (depthKm < 150) return "#facc15";
  if (depthKm < 300) return "#4ade80";
  return "#60a5fa";
}

export function depthLabel(depthKm: number, lang: "es" | "en" = "es"): string {
  if (lang === "en") {
    if (depthKm < 70) return "shallow";
    if (depthKm < 300) return "intermediate";
    return "deep";
  }
  if (depthKm < 70) return "superficial";
  if (depthKm < 300) return "intermedia";
  return "profunda";
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
const dtfShortCache = new Map<string, Intl.DateTimeFormat>();

function dateTimeFmt(locale = "es-CO"): Intl.DateTimeFormat {
  let f = dtfCache.get(locale);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    dtfCache.set(locale, f);
  }
  return f;
}

function dateFmt(locale = "es-CO"): Intl.DateTimeFormat {
  let f = dtfShortCache.get(locale);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { dateStyle: "short" });
    dtfShortCache.set(locale, f);
  }
  return f;
}

export function fmtDateTime(ms: number, locale = "es-CO"): string {
  return dateTimeFmt(locale).format(new Date(ms));
}

export function fmtDate(ms: number, locale = "es-CO"): string {
  return dateFmt(locale).format(new Date(ms));
}

/** "hace 3 h" / "3 h ago". */
export function fmtAgo(
  ms: number,
  now = Date.now(),
  lang: "es" | "en" = "es",
): string {
  const diff = Math.max(now - ms, 0);
  const min = diff / 60000;
  if (lang === "en") {
    if (min < 1) return "just now";
    if (min < 60) return `${Math.round(min)} min ago`;
    const h = min / 60;
    if (h < 24) return `${Math.round(h)} h ago`;
    const d = diff / DAY_MS;
    if (d < 30) return `${Math.round(d)} d ago`;
    const mo = d / 30.44;
    if (mo < 12) {
      const n = Math.round(mo);
      return n === 1 ? "1 month ago" : `${n} months ago`;
    }
    return `${(d / 365.25).toFixed(1)} yr ago`;
  }
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${Math.round(min)} min`;
  const h = min / 60;
  if (h < 24) return `hace ${Math.round(h)} h`;
  const d = diff / DAY_MS;
  if (d < 30) return `hace ${Math.round(d)} d`;
  const mo = d / 30.44;
  if (mo < 12) {
    const n = Math.round(mo);
    return n === 1 ? "hace 1 mes" : `hace ${n} meses`;
  }
  return `hace ${(d / 365.25).toFixed(1)} años`;
}

export function fmtNum(x: number, digits = 2, locale = "es-CO"): string {
  if (!Number.isFinite(x)) return "—";
  if (x !== 0 && Math.abs(x) < 0.001) return x.toExponential(1);
  return x.toLocaleString(locale, { maximumFractionDigits: digits });
}

export function fmtPct(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p >= 0.995) return ">99%";
  if (p > 0 && p < 0.001) return "<0.1%";
  return `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
}

/** Color de una probabilidad, de verde (baja) a rojo (alta). */
export function probColor(p: number): string {
  if (p < 0.02) return "#334155";
  if (p < 0.1) return "#1d4ed8";
  if (p < 0.25) return "#0891b2";
  if (p < 0.5) return "#ca8a04";
  if (p < 0.75) return "#ea580c";
  return "#dc2626";
}

export function fmtYears(y: number, lang: "es" | "en" = "es"): string {
  if (!Number.isFinite(y)) return "—";
  if (lang === "en") {
    if (y >= 1000) return `${Math.round(y / 100) / 10}k yr`;
    if (y >= 1) return y < 2 ? "1 yr" : `${Math.round(y)} yr`;
    const days = y * 365.25;
    if (days < 1) return `${Math.round(days * 24)} h`;
    if (days < 45) return `${Math.round(days)} days`;
    const months = Math.round(y * 12);
    return months <= 1 ? "1 mo" : `${months} mo`;
  }
  if (y >= 1000) return `${Math.round(y / 100) / 10} mil años`;
  if (y >= 1) return y < 2 ? "1 año" : `${Math.round(y)} años`;
  const days = y * 365.25;
  if (days < 1) return `${Math.round(days * 24)} h`;
  if (days < 45) return `${Math.round(days)} días`;
  const months = Math.round(y * 12);
  return months <= 1 ? "1 mes" : `${months} meses`;
}

/**
 * Radio del marcador en píxeles.
 *
 * La escala es lineal y acotada a propósito. Una escala exponencial es fiel a
 * la energía liberada, pero a zoom de planeta un M8 pedía 450 px de radio y
 * tapaba un continente entero. Aquí el tamaño solo ordena visualmente, y el
 * color hace el trabajo de comunicar la magnitud.
 */
export function magRadius(mag: number, zoom = 4): number {
  const base = clamp(2.4 + (mag - 2) * 1.5, 2.4, 14);
  const porZoom = clamp(0.55 + zoom * 0.1, 0.6, 1.9);
  return base * porZoom;
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

/** Clase de magnitud entera a la que pertenece un sismo: 3, 4, 5… y 8 para todo lo mayor. */
export function magClass(mag: number): number {
  return Math.min(8, Math.max(3, Math.floor(mag)));
}

export const MAG_CLASSES = [3, 4, 5, 6, 7, 8];

export function magClassLabel(clase: number): string {
  return clase === 8 ? "M8+" : `M${clase}`;
}

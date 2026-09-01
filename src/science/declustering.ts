import type { Quake } from "../types";
import { DAY_MS, haversineKm } from "./stats";

export type QuakeRole = "fondo" | "principal" | "replica" | "premonitor";

export interface DeclusterResult {
  /** Rol asignado a cada evento, por id. */
  roles: Map<string, QuakeRole>;
  /** Sismicidad de fondo: principales + eventos aislados. */
  background: Quake[];
  /** Réplicas y premonitores. */
  clustered: Quake[];
  /** Réplicas agrupadas por id del sismo principal. */
  clusters: Map<string, Quake[]>;
  /** Fracción del catálogo que es dependiente (proxy de razón de ramificación). */
  clusteredFraction: number;
}

/** Ventana espacial de Gardner & Knopoff (1974), en km. */
export function gkRadiusKm(mag: number): number {
  return 10 ** (0.1238 * mag + 0.983);
}

/** Ventana temporal de Gardner & Knopoff (1974), en días. */
export function gkWindowDays(mag: number): number {
  return mag >= 6.5
    ? 10 ** (0.032 * mag + 2.7389)
    : 10 ** (0.5409 * mag - 0.547);
}

/**
 * Desagrupamiento por ventanas de Gardner–Knopoff. Recorre el catálogo de
 * mayor a menor magnitud; cada evento aún libre se vuelve principal y absorbe
 * los eventos dentro de su ventana espacio-temporal.
 */
export function decluster(quakes: Quake[]): DeclusterResult {
  const roles = new Map<string, QuakeRole>();
  const clusters = new Map<string, Quake[]>();
  const byMag = [...quakes].sort((a, b) => b.mag - a.mag);
  const byTime = [...quakes].sort((a, b) => a.time - b.time);
  const taken = new Set<string>();

  for (const main of byMag) {
    if (taken.has(main.id)) continue;
    taken.add(main.id);
    const radius = gkRadiusKm(main.mag);
    const windowMs = gkWindowDays(main.mag) * DAY_MS;
    // Los premonitores se buscan en una ventana previa más corta (10%).
    const from = main.time - windowMs * 0.1;
    const to = main.time + windowMs;

    const members: Quake[] = [];
    // byTime está ordenado: acotamos con búsqueda binaria por el extremo bajo.
    let lo = 0;
    let hi = byTime.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (byTime[mid].time < from) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < byTime.length && byTime[i].time <= to; i++) {
      const ev = byTime[i];
      if (taken.has(ev.id) || ev.mag > main.mag) continue;
      if (haversineKm(main.lat, main.lon, ev.lat, ev.lon) > radius) continue;
      taken.add(ev.id);
      roles.set(ev.id, ev.time < main.time ? "premonitor" : "replica");
      members.push(ev);
    }

    roles.set(main.id, members.length ? "principal" : "fondo");
    if (members.length) clusters.set(main.id, members);
  }

  const background: Quake[] = [];
  const clustered: Quake[] = [];
  for (const q of quakes) {
    const role = roles.get(q.id) ?? "fondo";
    if (role === "replica" || role === "premonitor") clustered.push(q);
    else background.push(q);
  }

  return {
    roles,
    background,
    clustered,
    clusters,
    clusteredFraction: quakes.length ? clustered.length / quakes.length : 0,
  };
}

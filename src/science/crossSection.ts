import type { Quake } from "../types";

export type ProfileAxis = "WE" | "SN" | "NWSE" | "SWNE";

export interface CrossSectionPoint {
  id: string;
  distKm: number;
  depthKm: number;
  mag: number;
  place: string;
}

export interface CrossSectionResult {
  axis: ProfileAxis;
  points: CrossSectionPoint[];
  lengthKm: number;
  startLabel: string;
  endLabel: string;
}

const DEG_TO_KM = 111.195;

const AXIS_VECTORS: Record<
  ProfileAxis,
  { dx: number; dy: number; startLabel: string; endLabel: string }
> = {
  WE: { dx: 1, dy: 0, startLabel: "W", endLabel: "E" },
  SN: { dx: 0, dy: 1, startLabel: "S", endLabel: "N" },
  NWSE: {
    dx: Math.SQRT1_2,
    dy: -Math.SQRT1_2,
    startLabel: "NW",
    endLabel: "SE",
  },
  SWNE: {
    dx: Math.SQRT1_2,
    dy: Math.SQRT1_2,
    startLabel: "SW",
    endLabel: "NE",
  },
};

/**
 * Proyecta un conjunto de sismos sobre un perfil vertical 2D (distancia horizontal vs profundidad)
 * a lo largo del eje cardinal u oblicuo indicado.
 */
export function buildCrossSection(
  quakes: Quake[],
  axis: ProfileAxis = "WE",
  maxPoints = 2500,
): CrossSectionResult {
  const vec = AXIS_VECTORS[axis];
  if (quakes.length === 0) {
    return {
      axis,
      points: [],
      lengthKm: 0,
      startLabel: vec.startLabel,
      endLabel: vec.endLabel,
    };
  }

  let sumLat = 0;
  let sumLon = 0;
  for (const q of quakes) {
    sumLat += q.lat;
    sumLon += q.lon;
  }
  const lat0 = sumLat / quakes.length;
  const lon0 = sumLon / quakes.length;
  const cosLat = Math.max(0.15, Math.cos((lat0 * Math.PI) / 180));

  const step = Math.max(1, Math.floor(quakes.length / maxPoints));
  const raw: Array<{ q: Quake; projKm: number }> = [];
  let minProj = Infinity;
  let maxProj = -Infinity;

  for (let i = 0; i < quakes.length; i += step) {
    const q = quakes[i];
    const xKm = (q.lon - lon0) * DEG_TO_KM * cosLat;
    const yKm = (q.lat - lat0) * DEG_TO_KM;
    const projKm = xKm * vec.dx + yKm * vec.dy;
    if (projKm < minProj) minProj = projKm;
    if (projKm > maxProj) maxProj = projKm;
    raw.push({ q, projKm });
  }

  const lengthKm = Math.max(1, Math.round(maxProj - minProj));
  const points: CrossSectionPoint[] = raw.map(({ q, projKm }) => ({
    id: q.id,
    distKm: Number((projKm - minProj).toFixed(1)),
    depthKm: q.depth,
    mag: q.mag,
    place: q.place,
  }));

  return {
    axis,
    points,
    lengthKm,
    startLabel: vec.startLabel,
    endLabel: vec.endLabel,
  };
}

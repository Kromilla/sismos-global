/**
 * useAlerts — Alertas sísmicas en tiempo real sin servidor.
 *
 * Estrategia: compara el catálogo "en vivo" (últimos 7 días) contra una
 * lista de IDs ya vistos en localStorage. Cada ciclo de 60 s detecta IDs
 * nuevos y, si superan el umbral del usuario, dispara una Notification web.
 *
 * No requiere WebSocket ni back-end: solo la API pública del USGS + la
 * Notification API del navegador.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Quake } from "../types";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface AlertPrefs {
  enabled: boolean;
  /** Magnitud mínima para notificar (default 5.0). */
  minMag: number;
  /** ID de región para filtrar, '' = global. */
  regionId: string;
  /** Reproducir sonido con la notificación. */
  sound: boolean;
}

export interface AlertEvent {
  quake: Quake;
  seenAt: number; // timestamp en que la app lo detectó
}

const PREFS_KEY = "sismos:alert-prefs";
const SEEN_KEY = "sismos:alert-seen";
/** Cuántos IDs recordamos como máximo para no crecer indefinidamente. */
const MAX_SEEN = 500;

// ─── Persistencia ─────────────────────────────────────────────────────────────

function loadPrefs(): AlertPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as AlertPrefs;
  } catch {
    /* ignore */
  }
  return { enabled: false, minMag: 5.0, regionId: "", sound: true };
}

function savePrefs(p: AlertPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
}

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveSeen(seen: Set<string>) {
  // Truncar al máximo para no crecer indefinidamente
  const arr = [...seen].slice(-MAX_SEEN);
  localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
}

// ─── Sonido de alerta ─────────────────────────────────────────────────────────

function playAlertSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    // Tres pulsos descendentes (beep de alerta)
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(440, ctx.currentTime + 0.30);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {
    /* AudioContext no disponible — silencioso */
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseAlertsReturn {
  prefs: AlertPrefs;
  setPrefs: (p: Partial<AlertPrefs>) => void;
  permission: NotificationPermission | "unsupported";
  requestPermission: () => Promise<void>;
  /** Los últimos N eventos que dispararon alerta (más reciente primero). */
  recent: AlertEvent[];
  /** Limpiar el historial de alertas recientes. */
  clearRecent: () => void;
}

/**
 * @param liveQuakes - Lista de sismos "en vivo" del useCatalog (últimos 7 días).
 *                     Se re-evalúa cada vez que el catálogo se actualiza.
 */
export function useAlerts(liveQuakes: Quake[]): UseAlertsReturn {
  const [prefs, setPrefsState] = useState<AlertPrefs>(loadPrefs);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [recent, setRecent] = useState<AlertEvent[]>([]);
  const seenRef = useRef<Set<string>>(loadSeen());

  // Inicializar: marcar todos los sismos actuales como ya vistos
  // para que la primera carga no genere una avalancha de notificaciones.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current || liveQuakes.length === 0) return;
    initializedRef.current = true;
    for (const q of liveQuakes) seenRef.current.add(q.id);
    saveSeen(seenRef.current);
  }, [liveQuakes]);

  // Detectar sismos nuevos cada vez que liveQuakes cambia
  useEffect(() => {
    if (!initializedRef.current) return;
    if (!prefs.enabled || permission !== "granted") return;

    const newAlerts: AlertEvent[] = [];

    for (const q of liveQuakes) {
      if (seenRef.current.has(q.id)) continue;
      seenRef.current.add(q.id);

      // Filtrar por magnitud
      if (q.mag < prefs.minMag) continue;

      // Filtrar por región (simplificado: el place del evento)
      // La integración con regionId se hace en el hook que consume esto.
      newAlerts.push({ quake: q, seenAt: Date.now() });
    }

    saveSeen(seenRef.current);

    if (newAlerts.length === 0) return;

    // Disparar notificaciones
    for (const { quake } of newAlerts) {
      const mag = quake.mag.toFixed(1);
      const depth = quake.depth.toFixed(0);
      const title = `🌍 Sismo M${mag} — ${quake.place}`;
      const body = `Profundidad: ${depth} km${quake.tsunami ? " · ⚠️ Alerta de tsunami" : ""}`;

      try {
        new Notification(title, {
          body,
          icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%23070b14'/%3E%3Ctext y='.9em' font-size='80' x='10'%3E%F0%9F%8C%8E%3C/text%3E%3C/svg%3E",
          tag: quake.id,
          silent: !prefs.sound,
        });
      } catch {
        /* Notification API bloqueada */
      }
    }

    if (prefs.sound && newAlerts.length > 0) {
      playAlertSound();
    }

    setRecent((prev) => [...newAlerts, ...prev].slice(0, 20));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveQuakes, prefs.enabled, prefs.minMag, prefs.sound, permission]);

  const setPrefs = useCallback((partial: Partial<AlertPrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...partial };
      savePrefs(next);
      return next;
    });
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  const clearRecent = useCallback(() => setRecent([]), []);

  return { prefs, setPrefs, permission, requestPermission, recent, clearRecent };
}

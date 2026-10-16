import { useCallback, useEffect, useState } from "react";
import type { Quake } from "../types";

export interface AlertPrefs {
  enabled: boolean;
  minMag: number;
  sound: boolean;
  browserNotify: boolean;
}

const STORAGE_KEY = "sismos-global-alerts-v1";

const DEFAULT_PREFS: AlertPrefs = {
  enabled: false,
  minMag: 5.0,
  sound: true,
  browserNotify: false,
};

function loadPrefs(): AlertPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<AlertPrefs>;
    return {
      enabled: Boolean(parsed.enabled),
      minMag:
        typeof parsed.minMag === "number" && Number.isFinite(parsed.minMag)
          ? parsed.minMag
          : DEFAULT_PREFS.minMag,
      sound: parsed.sound !== undefined ? Boolean(parsed.sound) : true,
      browserNotify: Boolean(parsed.browserNotify),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * Reproduce un aviso sonoro sintetizado con Web Audio API (sin archivos externos).
 */
export function playAlertChime(mag = 5.5): void {
  if (typeof window === "undefined") return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const baseFreq = mag >= 6.5 ? 587.33 : 523.25; // D5 o C5

    [0, 0.18].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(
        idx === 0 ? baseFreq : baseFreq * 1.25,
        now + offset,
      );
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.34);
    });

    window.setTimeout(() => {
      void ctx.close();
    }, 900);
  } catch {
    /* ignore audio autoplay restrictions */
  }
}

export function useAlerts(liveQuakes: Quake[], _lang: "es" | "en" = "es") {
  const [settings, setSettings] = useState<AlertPrefs>(() => loadPrefs());
  const [tracker, setTracker] = useState<{
    seen: Set<string> | null;
    lastTriggered: Quake | null;
    notifyCandidate: Quake | null;
  }>({ seen: null, lastTriggered: null, notifyCandidate: null });

  // Ajustar estado durante el render cuando llegan nuevos sismos en vivo
  if (liveQuakes.length > 0) {
    if (tracker.seen === null) {
      setTracker({
        seen: new Set(liveQuakes.map((q) => q.id)),
        lastTriggered: null,
        notifyCandidate: null,
      });
    } else {
      let hasNewId = false;
      for (const q of liveQuakes) {
        if (!tracker.seen.has(q.id)) {
          hasNewId = true;
          break;
        }
      }
      if (hasNewId) {
        const nextSeen = new Set(tracker.seen);
        const newcomers: Quake[] = [];
        for (const q of liveQuakes) {
          if (!nextSeen.has(q.id)) {
            nextSeen.add(q.id);
            if (settings.enabled && q.mag >= settings.minMag) {
              newcomers.push(q);
            }
          }
        }
        newcomers.sort((a, b) => b.mag - a.mag);
        const top = newcomers[0] ?? null;
        setTracker({
          seen: nextSeen,
          lastTriggered: top ?? tracker.lastTriggered,
          notifyCandidate: top,
        });
      }
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  useEffect(() => {
    const top = tracker.notifyCandidate;
    if (!top) return;
    if (settings.sound) {
      playAlertChime(top.mag);
    }
    if (
      settings.browserNotify &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification(`M ${top.mag.toFixed(1)} · ${top.place}`, {
          body: `Profundidad ${top.depth.toFixed(0)} km · ${new Date(top.time).toUTCString()}`,
        });
      } catch {
        /* ignore */
      }
    }
  }, [tracker.notifyCandidate, settings.sound, settings.browserNotify]);

  const update = useCallback((patch: Partial<AlertPrefs>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (
        next.browserNotify &&
        typeof Notification !== "undefined" &&
        Notification.permission === "default"
      ) {
        void Notification.requestPermission();
      }
      return next;
    });
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setSettings((prev) => ({ ...prev, browserNotify: true }));
    }
  }, []);

  const dismissLast = useCallback(() => {
    setTracker((prev) => ({ ...prev, lastTriggered: null }));
  }, []);

  return {
    settings,
    update,
    requestPermission,
    lastTriggered: tracker.lastTriggered,
    dismissLast,
  };
}

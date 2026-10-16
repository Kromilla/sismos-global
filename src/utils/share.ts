/**
 * share.ts — Utilidades de compartición y enlaces canónicos para eventos sísmicos.
 *
 * Soporta:
 *  - Generación de URL canónica limpia (?quake=id)
 *  - Formateo de texto descriptivo para redes
 *  - Copia robusta al portapapeles (Async Clipboard API + fallback execCommand)
 *  - Enlaces directos a WhatsApp, X (Twitter) y Telegram
 *  - Web Share API nativo opcional
 */

import type { Quake } from "../types";

/**
 * Compara dos IDs de sismos considerando prefijos de red (e.g. USGS:us6000u0n5 vs us6000u0n5).
 */
export function quakesMatchId(quakeId: string, targetId: string): boolean {
  if (quakeId === targetId) return true;
  if (quakeId.endsWith(`:${targetId}`) || targetId.endsWith(`:${quakeId}`)) return true;
  if (`USGS:${targetId}` === quakeId || `USGS:${quakeId}` === targetId) return true;
  return false;
}

/**
 * Genera la URL canónica para compartir un sismo individual.
 * Limpia otros parámetros irrelevantes y deja únicamente ?quake=ID.
 */
export function buildQuakeShareUrl(quakeId: string, customOrigin?: string): string {
  if (typeof window === "undefined" && !customOrigin) return "";
  const origin =
    customOrigin ||
    (typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}`
      : "");

  try {
    const url = new URL(origin);
    url.search = "";
    url.searchParams.set("quake", quakeId);
    return url.toString();
  } catch {
    return `${origin}?quake=${encodeURIComponent(quakeId)}`;
  }
}

/**
 * Construye el texto descriptivo del sismo para redes y mensajería.
 */
export function buildQuakeShareText(
  quake: Pick<Quake, "mag" | "magType" | "place" | "depth">,
): string {
  const magStr = `M ${quake.mag.toFixed(1)}${quake.magType ? ` (${quake.magType})` : ""}`;
  const depthStr = `${Math.round(quake.depth)} km`;
  return `🌍 Sismo ${magStr} en ${quake.place} · Profundidad ${depthStr}. Vía Sismos Global:`;
}

/**
 * Enlace directo para compartir vía WhatsApp.
 */
export function getWhatsAppShareUrl(text: string, url: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(`${text}\n${url}`)}`;
}

/**
 * Enlace directo para publicar en X / Twitter.
 */
export function getTwitterShareUrl(text: string, url: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

/**
 * Enlace directo para compartir en Telegram.
 */
export function getTelegramShareUrl(text: string, url: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

/**
 * Copia texto al portapapeles de manera infalible en cualquier navegador.
 * Intenta navigator.clipboard y cae a un textarea con document.execCommand('copy').
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  // 1. Intentar Async Clipboard API
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback si fue bloqueado por permisos, falta de foco o iframe
    }
  }

  // 2. Fallback síncrono con textarea y execCommand('copy')
  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.left = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (successful) return true;
    } catch {
      // Fallback falló
    }

    // 3. Prompt de rescate para que el usuario no pierda el enlace
    try {
      window.prompt("Copia este enlace directo (Ctrl+C / Cmd+C):", text);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

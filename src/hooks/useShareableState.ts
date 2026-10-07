import { useCallback, useEffect, useRef } from "react";

/**
 * Sincroniza un subconjunto de estado de la UI con la query string para que
 * la vista sea compartible y enlazable. Usa replaceState para no llenar el
 * historial en cada slider.
 */
export function useShareableState<T extends Record<string, string>>(
  state: T,
  applyFromUrl: (params: URLSearchParams) => void,
): { shareUrl: () => string; copyShareUrl: () => Promise<boolean> } {
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    applyFromUrl(new URLSearchParams(window.location.search));
  }, [applyFromUrl]);

  useEffect(() => {
    if (!applied.current) return;
    const url = new URL(window.location.href);
    const next = new URLSearchParams(url.search);
    for (const [key, value] of Object.entries(state)) {
      if (value === "" || value == null) next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    const nextHref = qs ? `${url.pathname}?${qs}${url.hash}` : `${url.pathname}${url.hash}`;
    const current = `${url.pathname}${url.search}${url.hash}`;
    if (nextHref !== current) {
      window.history.replaceState(null, "", nextHref);
    }
  }, [state]);

  const shareUrl = useCallback(() => {
    const url = new URL(window.location.href);
    const next = new URLSearchParams(url.search);
    for (const [key, value] of Object.entries(state)) {
      if (value === "" || value == null) next.delete(key);
      else next.set(key, value);
    }
    url.search = next.toString();
    return url.toString();
  }, [state]);

  const copyShareUrl = useCallback(async () => {
    const href = shareUrl();
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url: href });
        return true;
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return false;
    }
    try {
      await navigator.clipboard.writeText(href);
      return true;
    } catch {
      return false;
    }
  }, [shareUrl]);

  return { shareUrl, copyShareUrl };
}

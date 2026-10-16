import { describe, it, expect, vi } from "vitest";
import {
  buildQuakeShareUrl,
  buildQuakeShareText,
  getWhatsAppShareUrl,
  getTwitterShareUrl,
  getTelegramShareUrl,
  copyTextToClipboard,
  quakesMatchId,
} from "./share";

describe("share utils", () => {
  it("compara IDs con o sin prefijo de red correctamente", () => {
    expect(quakesMatchId("USGS:us6000u0n5", "us6000u0n5")).toBe(true);
    expect(quakesMatchId("us6000u0n5", "USGS:us6000u0n5")).toBe(true);
    expect(quakesMatchId("EMSC:20240101", "20240101")).toBe(true);
    expect(quakesMatchId("USGS:us6000u0n5", "USGS:us6000u0n5")).toBe(true);
    expect(quakesMatchId("USGS:us6000u0n5", "us99999999")).toBe(false);
  });
  it("genera URL canónica limpia eliminando params innecesarios", () => {
    const url = buildQuakeShareUrl(
      "USGS:us6000u0n5",
      "https://sismos-global.test/app?tab=analisis&region=co-santander",
    );
    expect(url).toBe("https://sismos-global.test/app?quake=USGS%3Aus6000u0n5");
  });

  it("construye texto formateado con magnitud, tipo, lugar y profundidad", () => {
    const text = buildQuakeShareText({
      mag: 5.6,
      magType: "mww",
      place: "Los Santos, Santander, Colombia",
      depth: 150.4,
    });
    expect(text).toContain("M 5.6 (mww)");
    expect(text).toContain("Los Santos, Santander, Colombia");
    expect(text).toContain("150 km");
  });

  it("genera URLs de WhatsApp, X y Telegram correctamente", () => {
    const text = "Sismo M 5.0";
    const url = "https://sismos-global.test/?quake=123";

    const wa = getWhatsAppShareUrl(text, url);
    expect(wa).toContain("https://api.whatsapp.com/send?text=");
    expect(wa).toContain(encodeURIComponent(text + "\n" + url));

    const tw = getTwitterShareUrl(text, url);
    expect(tw).toContain("https://twitter.com/intent/tweet?");
    expect(tw).toContain(encodeURIComponent(text));
    expect(tw).toContain(encodeURIComponent(url));

    const tg = getTelegramShareUrl(text, url);
    expect(tg).toContain("https://t.me/share/url?");
  });

  it("copia al portapapeles usando navigator.clipboard", async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: mockWriteText,
      },
    });

    const result = await copyTextToClipboard("https://sismos-global.test/?quake=123");
    expect(result).toBe(true);
    expect(mockWriteText).toHaveBeenCalledWith("https://sismos-global.test/?quake=123");

    vi.unstubAllGlobals();
  });
});

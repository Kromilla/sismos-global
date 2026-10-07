import { describe, expect, it } from "vitest";
import { SHELL, detectLang, localeFor } from "../i18n/shell";
import { fmtAgo } from "../ui/format";

describe("i18n shell", () => {
  it("expone las mismas pestañas en ES y EN", () => {
    expect(SHELL.es.tabs.map((t) => t.id)).toEqual(
      SHELL.en.tabs.map((t) => t.id),
    );
  });

  it("localeFor elige es-CO / en-US", () => {
    expect(localeFor("es")).toBe("es-CO");
    expect(localeFor("en")).toBe("en-US");
  });

  it("detectLang cae a es fuera del navegador", () => {
    expect(detectLang()).toBe("es");
  });
});

describe("fmtAgo i18n", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  it("forma relativa en inglés", () => {
    expect(fmtAgo(now - 3 * 3600_000, now, "en")).toBe("3 h ago");
    expect(fmtAgo(now - 2 * 86400_000, now, "en")).toBe("2 d ago");
  });

  it("forma relativa en español", () => {
    expect(fmtAgo(now - 3 * 3600_000, now, "es")).toBe("hace 3 h");
  });
});

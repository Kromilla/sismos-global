import { describe, expect, it } from "vitest";
import {
  FDSN_NETWORKS,
  parseFdsnCount,
  parseFdsnGeoJson,
  parseFdsnText,
  parseFdsnTime,
} from "./fdsn";

describe("parseFdsnTime", () => {
  it("acepta epoch ms numéricos y cadenas ISO con o sin sufijo Z", () => {
    expect(parseFdsnTime(1735689600000)).toBe(1735689600000);
    expect(parseFdsnTime("2025-01-01T00:00:00Z")).toBe(1735689600000);
    expect(parseFdsnTime("2025-01-01T00:00:00.000000")).toBe(1735689600000);
    expect(Number.isNaN(parseFdsnTime(""))).toBe(true);
    expect(Number.isNaN(parseFdsnTime(null))).toBe(true);
  });
});

describe("parseFdsnCount", () => {
  it("extrae el conteo desde texto plano, JSON y XML", () => {
    expect(parseFdsnCount("38\n")).toBe(38);
    expect(parseFdsnCount('{"count":24,"maxAllowed":20000}')).toBe(24);
    expect(
      parseFdsnCount(
        '<?xml version="1.0"?>\n<Counts>\n<Events>\n24\n</Events>\n</Counts>',
      ),
    ).toBe(24);
    expect(parseFdsnCount("<!doctype html><html></html>")).toBeNull();
  });
});

describe("parseFdsnGeoJson", () => {
  it("normaliza eventos de EMSC con tiempo ISO, flynn_region y profundidad positiva", () => {
    const sample = {
      type: "FeatureCollection",
      features: [
        {
          id: "20250104_0000245",
          properties: {
            unid: "20250104_0000245",
            time: "2025-01-04T22:23:38.23Z",
            mag: 5.3,
            magtype: "mw",
            flynn_region: "VANUATU",
            depth: 36,
          },
          geometry: { coordinates: [167.3485, -16.1299, -36.0] },
        },
      ],
    };

    const quakes = parseFdsnGeoJson(sample, FDSN_NETWORKS.EMSC);
    expect(quakes).toHaveLength(1);
    expect(quakes[0]).toMatchObject({
      id: "EMSC:20250104_0000245",
      time: Date.parse("2025-01-04T22:23:38.23Z"),
      lat: -16.1299,
      lon: 167.3485,
      depth: 36,
      mag: 5.3,
      magType: "mw",
      place: "VANUATU",
      source: "EMSC",
    });
  });

  it("normaliza eventos de INGV donde el identificador viene en properties.eventId", () => {
    const sample = {
      type: "FeatureCollection",
      features: [
        {
          properties: {
            eventId: 41289112,
            time: "2025-01-03T14:56:07.140000",
            mag: 3.0,
            magType: "ML",
            place: "8 km E Minervino Murge (BT)",
          },
          geometry: { coordinates: [16.1613, 41.1223, 27.6] },
        },
      ],
    };

    const quakes = parseFdsnGeoJson(sample, FDSN_NETWORKS.INGV);
    expect(quakes).toHaveLength(1);
    expect(quakes[0].id).toBe("INGV:41289112");
    expect(quakes[0].time).toBe(Date.parse("2025-01-03T14:56:07.140000Z"));
    expect(quakes[0].url).toBe("https://terremoti.ingv.it/event/41289112");
  });
});

describe("parseFdsnText", () => {
  it("parsea el formato pipe-delimited estándar FDSN (GeoNet / GFZ / IPGP)", () => {
    const text = [
      "#EventID | Time | Latitude | Longitude | Depth/km | Author | Catalog | Contributor | ContributorID | MagType | Magnitude | MagAuthor | EventLocationName | EventType",
      "2025p000380|2025-01-01T03:22:49|-37.007|177.616|135.9|GNS|GNS|GNS|2025p000380|MLv|3.4|GNS|80 km north of Te Kaha|earthquake",
      "gfz2025ahev|2025-01-04T22:23:34.02|-16.154|167.412|10.0|||GFZ|gfz2025ahev|Mw|5.21||Vanuatu Islands|",
    ].join("\n");

    const quakes = parseFdsnText(text, FDSN_NETWORKS.GEONET);
    expect(quakes).toHaveLength(2);
    expect(quakes[0]).toMatchObject({
      id: "GEONET:2025p000380",
      time: Date.parse("2025-01-01T03:22:49Z"),
      lat: -37.007,
      lon: 177.616,
      depth: 135.9,
      mag: 3.4,
      magType: "MLv",
      place: "80 km north of Te Kaha",
      source: "GEONET",
    });
  });

  it("lanza error si el servidor devuelve HTML en lugar de texto FDSN", () => {
    expect(() =>
      parseFdsnText("<!doctype html><html><body>Error</body></html>", FDSN_NETWORKS.GA),
    ).toThrow();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { useQuakeStore, MIN_MAG_MUNDO, MIN_MAG_ZONA } from "./useQuakeStore";
import type { Quake } from "../types";

describe("useQuakeStore", () => {
  beforeEach(() => {
    useQuakeStore.setState({
      tab: "mapa",
      source: "reciente",
      minMag: 0,
      maxDepth: 800,
      regionId: "",
      histMinMag: MIN_MAG_MUNDO,
      clasesOcultas: [],
      decada: null,
      selectedQuake: null,
      urlQuakeId: null,
      focus: null,
      showAlerts: false,
      showLiveFeed: false,
    });
  });

  it("cambia de pestaña correctamente", () => {
    useQuakeStore.getState().setTab("eventos");
    expect(useQuakeStore.getState().tab).toBe("eventos");
  });

  it("actualiza región y ajusta histMinMag automáticamente", () => {
    useQuakeStore.getState().setRegionId("co-santander");
    expect(useQuakeStore.getState().regionId).toBe("co-santander");
    expect(useQuakeStore.getState().histMinMag).toBe(MIN_MAG_ZONA);

    useQuakeStore.getState().setRegionId("");
    expect(useQuakeStore.getState().regionId).toBe("");
    expect(useQuakeStore.getState().histMinMag).toBe(MIN_MAG_MUNDO);
  });

  it("permite alternar clases de magnitud ocultas y resetear filtros", () => {
    const store = useQuakeStore.getState();
    store.toggleClaseOculta(3);
    expect(useQuakeStore.getState().clasesOcultas).toContain(3);

    store.setDecada(2010);
    expect(useQuakeStore.getState().decada).toBe(2010);

    store.resetFiltros();
    expect(useQuakeStore.getState().clasesOcultas).toEqual([]);
    expect(useQuakeStore.getState().decada).toBeNull();
  });

  it("enfoca un sismo seleccionándolo y cambiando a pestaña mapa", () => {
    const mockQuake: Quake = {
      id: "USGS:us7000test",
      time: Date.now(),
      lat: 6.8,
      lon: -73.1,
      depth: 150,
      mag: 5.6,
      magType: "mww",
      place: "6 km SW of Mesa de Los Santos, Colombia",
      tsunami: false,
      url: "https://earthquake.usgs.gov/test",
      source: "USGS",
    };

    useQuakeStore.getState().setTab("eventos");
    useQuakeStore.getState().focusOn(mockQuake);

    const state = useQuakeStore.getState();
    expect(state.tab).toBe("mapa");
    expect(state.selectedQuake).toEqual(mockQuake);
    expect(state.urlQuakeId).toBe("USGS:us7000test");
    expect(state.focus).toEqual({ lat: 6.8, lon: -73.1, zoom: 8 });
  });
});

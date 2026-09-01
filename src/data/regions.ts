import type { Bbox, Region } from "../types";

/** El planeta entero: alcance por defecto del catálogo. */
export const WORLD_BBOX: Bbox = {
  minLat: -90,
  maxLat: 90,
  minLon: -180,
  maxLon: 180,
};

/** Recuadro de Latinoamérica, disponible como enfoque rápido. */
export const LATAM_BBOX: Bbox = {
  minLat: -57,
  maxLat: 33,
  minLon: -120,
  maxLon: -30,
};

/**
 * Zonas sismogénicas de Latinoamérica. Los recuadros son aproximaciones
 * operativas (no fronteras tectónicas formales): sirven para agrupar el
 * catálogo por fuente sísmica dominante y calcular tasas por zona.
 */
export const REGIONS: Region[] = [
  {
    id: "mx-baja",
    name: "Baja California",
    country: "México",
    bbox: { minLat: 22, maxLat: 33, minLon: -118, maxLon: -108 },
    blurb:
      "Transformante Pacífico–Norteamérica: falla Imperial y sistema del Golfo.",
  },
  {
    id: "mx-guerrero",
    name: "Guerrero–Oaxaca",
    country: "México",
    bbox: { minLat: 14, maxLat: 20, minLon: -103, maxLon: -94 },
    blurb:
      "Subducción de Cocos bajo Norteamérica. Aloja la brecha sísmica de Guerrero.",
  },
  {
    id: "mx-jalisco",
    name: "Jalisco–Michoacán",
    country: "México",
    bbox: { minLat: 17, maxLat: 22, minLon: -107, maxLon: -101 },
    blurb:
      "Bloque Jalisco y placa Rivera; origen del sismo de Michoacán 1985 (M8.0).",
  },
  {
    id: "ca-guate",
    name: "Guatemala–El Salvador",
    country: "Centroamérica",
    bbox: { minLat: 12, maxLat: 17.5, minLon: -93, maxLon: -87 },
    blurb:
      "Subducción de Cocos más la falla de Motagua (límite Norteamérica–Caribe).",
  },
  {
    id: "ca-nicacr",
    name: "Nicaragua–Costa Rica",
    country: "Centroamérica",
    bbox: { minLat: 8, maxLat: 13.5, minLon: -88, maxLon: -82 },
    blurb:
      "Fosa Mesoamericana y arco volcánico; sismicidad somera muy frecuente.",
  },
  {
    id: "ca-panama",
    name: "Panamá–Chocó",
    country: "Panamá / Colombia",
    bbox: { minLat: 5, maxLat: 10, minLon: -83, maxLon: -76 },
    blurb:
      "Choque del bloque de Panamá contra Sudamérica; cinturón deformado del Norte.",
  },
  {
    id: "co-caribe",
    name: "Caribe colombiano · Santa Marta",
    country: "Colombia",
    bbox: { minLat: 9, maxLat: 13.5, minLon: -76.5, maxLon: -71 },
    blurb: "Falla Santa Marta–Bucaramanga y cinturón deformado del Caribe Sur.",
  },
  {
    id: "co-nido",
    name: "Nido de Bucaramanga",
    country: "Colombia",
    bbox: { minLat: 6, maxLat: 8.5, minLon: -74.5, maxLon: -72 },
    blurb:
      "Enjambre profundo (~150 km) único en el mundo por su tasa constante.",
  },
  {
    id: "co-pacifico",
    name: "Pacífico colombiano",
    country: "Colombia",
    bbox: { minLat: 1, maxLat: 6, minLon: -80, maxLon: -75 },
    blurb: "Subducción de Nazca; zona del megaterremoto de 1906 (M8.8).",
  },
  {
    id: "ec-costa",
    name: "Ecuador",
    country: "Ecuador",
    bbox: { minLat: -5, maxLat: 1.5, minLon: -82, maxLon: -75 },
    blurb:
      "Subducción de Nazca frente a Esmeraldas–Manabí y fallas interandinas.",
  },
  {
    id: "pe-norte",
    name: "Perú norte y centro",
    country: "Perú",
    bbox: { minLat: -14, maxLat: -3, minLon: -82, maxLon: -74 },
    blurb:
      "Subducción plana (flat slab) frente a Lima; recurrencia histórica alta.",
  },
  {
    id: "pe-sur",
    name: "Perú sur–Arica",
    country: "Perú / Chile",
    bbox: { minLat: -20, maxLat: -14, minLon: -76, maxLon: -68 },
    blurb: "Codo de Arica; ruptura de 1868 y 2001 (M8.4).",
  },
  {
    id: "cl-norte",
    name: "Norte de Chile",
    country: "Chile",
    bbox: { minLat: -27, maxLat: -20, minLon: -73, maxLon: -67 },
    blurb:
      "Brecha de Atacama; Iquique 2014 (M8.2) liberó solo parte del déficit.",
  },
  {
    id: "cl-centro",
    name: "Chile central",
    country: "Chile",
    bbox: { minLat: -35, maxLat: -30, minLon: -74, maxLon: -69 },
    blurb:
      "Valparaíso–Santiago: 1906, 1985 y déficit acumulado desde entonces.",
  },
  {
    id: "cl-sur",
    name: "Chile sur",
    country: "Chile",
    bbox: { minLat: -46, maxLat: -35, minLon: -77, maxLon: -70 },
    blurb: "Segmento de Valdivia 1960 (M9.5) y Maule 2010 (M8.8).",
  },
  {
    id: "ar-cuyo",
    name: "Cuyo (San Juan–Mendoza)",
    country: "Argentina",
    bbox: { minLat: -36, maxLat: -28, minLon: -70, maxLon: -66 },
    blurb: "Subducción plana pampeana; fallas corticales sobre zonas pobladas.",
  },
  {
    id: "car-espanola",
    name: "La Española–Puerto Rico",
    country: "Caribe",
    bbox: { minLat: 16, maxLat: 21, minLon: -75, maxLon: -63 },
    blurb: "Falla Septentrional y fosa de Puerto Rico; Haití 2010 (M7.0).",
  },
  {
    id: "car-menores",
    name: "Antillas Menores",
    country: "Caribe",
    bbox: { minLat: 10, maxLat: 19, minLon: -63, maxLon: -58 },
    blurb: "Subducción atlántica bajo el arco de las Antillas.",
  },
];

/**
 * Zonas sismogénicas del resto del mundo. Igual que las americanas, son
 * recuadros operativos —no fronteras tectónicas formales— elegidos para agrupar
 * el catálogo por fuente sísmica dominante.
 */
export const WORLD_REGIONS: Region[] = [
  {
    id: "na-alaska",
    name: "Alaska y Aleutianas",
    country: "Estados Unidos",
    bbox: { minLat: 50, maxLat: 63, minLon: -180, maxLon: -130 },
    blurb:
      "Subducción del Pacífico bajo Norteamérica; el M9.2 de 1964 salió de aquí.",
  },
  {
    id: "na-cascadia",
    name: "Cascadia",
    country: "EE. UU. / Canadá",
    bbox: { minLat: 39, maxLat: 51, minLon: -130, maxLon: -119 },
    blurb:
      "Subducción silenciosa de Juan de Fuca; último megaterremoto en 1700.",
  },
  {
    id: "na-california",
    name: "California",
    country: "Estados Unidos",
    bbox: { minLat: 32, maxLat: 42, minLon: -125, maxLon: -114 },
    blurb:
      "Falla de San Andrés: transformante entre el Pacífico y Norteamérica.",
  },
  {
    id: "pa-kamchatka",
    name: "Kamchatka y Kuriles",
    country: "Rusia",
    bbox: { minLat: 43, maxLat: 61, minLon: 145, maxLon: 170 },
    blurb: "Uno de los arcos más activos del planeta; M9.0 en 1952.",
  },
  {
    id: "pa-japon-ne",
    name: "Japón nororiental",
    country: "Japón",
    bbox: { minLat: 35, maxLat: 46, minLon: 138, maxLon: 148 },
    blurb: "Fosa de Japón. Tohoku 2011 (M9.1) y su tsunami.",
  },
  {
    id: "pa-japon-so",
    name: "Japón suroccidental y Nankai",
    country: "Japón",
    bbox: { minLat: 29, maxLat: 36, minLon: 130, maxLon: 141 },
    blurb: "Fosa de Nankai: recurrencia histórica de M8 cada 100–150 años.",
  },
  {
    id: "pa-ryukyu",
    name: "Ryukyu y Taiwán",
    country: "Japón / Taiwán",
    bbox: { minLat: 21, maxLat: 30, minLon: 119, maxLon: 132 },
    blurb: "Choque de la placa filipina contra Eurasia; Chi-Chi 1999 (M7.6).",
  },
  {
    id: "pa-filipinas",
    name: "Filipinas",
    country: "Filipinas",
    bbox: { minLat: 4, maxLat: 20, minLon: 118, maxLon: 128 },
    blurb: "Doble subducción y la falla filipina atravesando el archipiélago.",
  },
  {
    id: "pa-marianas",
    name: "Marianas",
    country: "Micronesia",
    bbox: { minLat: 11, maxLat: 23, minLon: 140, maxLon: 150 },
    blurb:
      "La fosa más profunda del planeta; sismicidad intensa y lejos de costa.",
  },
  {
    id: "as-sumatra",
    name: "Sumatra",
    country: "Indonesia",
    bbox: { minLat: -7, maxLat: 7, minLon: 92, maxLon: 107 },
    blurb:
      "Ruptura de 2004 (M9.1) y la falla de Sumatra en el interior de la isla.",
  },
  {
    id: "as-java",
    name: "Java y mar de Banda",
    country: "Indonesia",
    bbox: { minLat: -11, maxLat: -4, minLon: 105, maxLon: 132 },
    blurb: "Subducción australiana bajo Sonda, con la isla más poblada encima.",
  },
  {
    id: "as-sulawesi",
    name: "Sulawesi y Molucas",
    country: "Indonesia",
    bbox: { minLat: -5, maxLat: 5, minLon: 118, maxLon: 132 },
    blurb: "Nudo tectónico de cuatro placas; Palu 2018 (M7.5) y su tsunami.",
  },
  {
    id: "oc-papua",
    name: "Papúa Nueva Guinea",
    country: "Papúa N. Guinea",
    bbox: { minLat: -12, maxLat: 0, minLon: 130, maxLon: 152 },
    blurb:
      "Choque de Australia con el Pacífico; de las tasas más altas del mundo.",
  },
  {
    id: "oc-vanuatu",
    name: "Salomón y Vanuatu",
    country: "Melanesia",
    bbox: { minLat: -23, maxLat: -6, minLon: 152, maxLon: 172 },
    blurb: "Arco de Nuevas Hébridas: convergencia de más de 100 mm al año.",
  },
  {
    id: "oc-tonga",
    name: "Tonga y Kermadec",
    country: "Polinesia",
    bbox: { minLat: -36, maxLat: -14, minLon: -180, maxLon: -170 },
    blurb:
      "La subducción más rápida del planeta y el slab más profundo que se conoce.",
  },
  {
    id: "oc-nz",
    name: "Nueva Zelanda",
    country: "Nueva Zelanda",
    bbox: { minLat: -48, maxLat: -34, minLon: 165, maxLon: 180 },
    blurb: "Falla alpina y subducción de Hikurangi; Christchurch 2011.",
  },
  {
    id: "as-himalaya",
    name: "Himalaya",
    country: "Nepal / India",
    bbox: { minLat: 26, maxLat: 36, minLon: 74, maxLon: 97 },
    blurb:
      "Colisión India–Eurasia. Gorkha 2015 (M7.8) liberó solo parte del déficit.",
  },
  {
    id: "as-hindukush",
    name: "Hindu Kush",
    country: "Afganistán",
    bbox: { minLat: 33, maxLat: 39, minLon: 67, maxLon: 75 },
    blurb:
      "Enjambre profundo a unos 200 km, comparable al nido de Bucaramanga.",
  },
  {
    id: "as-tianshan",
    name: "Tian Shan y Pamir",
    country: "Asia Central",
    bbox: { minLat: 35, maxLat: 45, minLon: 66, maxLon: 83 },
    blurb:
      "Deformación intracontinental a 2.000 km de cualquier límite de placa.",
  },
  {
    id: "as-zagros",
    name: "Irán y Zagros",
    country: "Irán",
    bbox: { minLat: 25, maxLat: 40, minLon: 44, maxLon: 63 },
    blurb:
      "Convergencia Arabia–Eurasia; sismos someros bajo construcción frágil.",
  },
  {
    id: "eu-anatolia",
    name: "Anatolia y Egeo",
    country: "Turquía / Grecia",
    bbox: { minLat: 33, maxLat: 43, minLon: 20, maxLon: 45 },
    blurb: "Falla norte de Anatolia; Kahramanmaraş 2023 (M7.8) e İzmit 1999.",
  },
  {
    id: "eu-italia",
    name: "Italia y Mediterráneo central",
    country: "Italia",
    bbox: { minLat: 36, maxLat: 47, minLon: 6, maxLon: 19 },
    blurb:
      "Apeninos y arco calabrés: sismos moderados sobre patrimonio frágil.",
  },
  {
    id: "eu-caucaso",
    name: "Cáucaso",
    country: "Georgia / Armenia",
    bbox: { minLat: 38, maxLat: 45, minLon: 38, maxLon: 50 },
    blurb: "Spitak 1988 (M6.8) mostró lo que hace la mala construcción.",
  },
  {
    id: "eu-islandia",
    name: "Islandia",
    country: "Islandia",
    bbox: { minLat: 62, maxLat: 68, minLon: -26, maxLon: -12 },
    blurb: "Dorsal atlántica emergida: sismicidad somera ligada al volcanismo.",
  },
  {
    id: "af-magreb",
    name: "Magreb",
    country: "Argelia / Marruecos",
    bbox: { minLat: 28, maxLat: 38, minLon: -12, maxLon: 11 },
    blurb: "Cierre África–Iberia; Al Haouz 2023 (M6.8) y Boumerdés 2003.",
  },
  {
    id: "af-rift",
    name: "Rift de África oriental",
    country: "África oriental",
    bbox: { minLat: -14, maxLat: 14, minLon: 27, maxLon: 43 },
    blurb: "Un continente partiéndose en dos: sismicidad somera y moderada.",
  },
  {
    id: "as-china-sichuan",
    name: "Sichuan y Longmenshan",
    country: "China",
    bbox: { minLat: 26, maxLat: 36, minLon: 98, maxLon: 108 },
    blurb: "Borde oriental del Tíbet; Wenchuan 2008 (M7.9).",
  },
  {
    id: "as-china-norte",
    name: "Norte de China",
    country: "China",
    bbox: { minLat: 34, maxLat: 43, minLon: 108, maxLon: 123 },
    blurb: "Fallas intraplaca bajo megaciudades; Tangshan 1976.",
  },
  {
    id: "as-birmania",
    name: "Birmania y Assam",
    country: "Myanmar / India",
    bbox: { minLat: 18, maxLat: 29, minLon: 89, maxLon: 99 },
    blurb: "Falla de Sagaing y la esquina oriental del Himalaya.",
  },
  {
    id: "as-andaman",
    name: "Andamán y Nicobar",
    country: "India",
    bbox: { minLat: 5, maxLat: 17, minLon: 90, maxLon: 98 },
    blurb: "Extremo norte de la ruptura de 2004; expansión de tras-arco.",
  },
  {
    id: "an-scotia",
    name: "Arco de Escocia",
    country: "Atlántico sur",
    bbox: { minLat: -63, maxLat: -53, minLon: -65, maxLon: -20 },
    blurb: "Subducción austral entre Sudamérica y la Antártida.",
  },
];

/** Todas las zonas: las americanas primero, el resto del mundo después. */
export const ALL_REGIONS: Region[] = [...REGIONS, ...WORLD_REGIONS];

export function regionById(id: string): Region | undefined {
  return ALL_REGIONS.find((r) => r.id === id);
}

export function inBbox(lat: number, lon: number, b: Bbox): boolean {
  return (
    lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon
  );
}

export function bboxCenter(b: Bbox): [number, number] {
  return [(b.minLat + b.maxLat) / 2, (b.minLon + b.maxLon) / 2];
}

/** Área aproximada del recuadro en km², corrigiendo por latitud. */
export function bboxAreaKm2(b: Bbox): number {
  const midLat = ((b.minLat + b.maxLat) / 2) * (Math.PI / 180);
  const dLat = (b.maxLat - b.minLat) * 111.32;
  const dLon = (b.maxLon - b.minLon) * 111.32 * Math.cos(midLat);
  return Math.abs(dLat * dLon);
}

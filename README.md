# Sismos Global

Catálogo sísmico mundial, almacén analítico y **pronóstico probabilístico**.
Todo corre en el navegador: sin servidor, sin base de datos remota, sin costo mensual.

49 zonas sismogénicas, 98 ciudades de referencia y múltiples redes de datos interconectables vía FDSN (USGS, EMSC, GeoNet, GA, INGV) para el planeta entero, más el Servicio Geológico Colombiano, que aporta catálogo desde el año **1610** en Colombia.

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. Para publicar: `npm run build` genera `dist/` con rutas relativas,
listo para GitHub Pages, Netlify o Vercel.

---

## Lo primero, sin rodeos

**Esta app no predice terremotos.** Nadie puede: no existe método validado que anticipe fecha,
lugar y magnitud exactos de un sismo. Lo que sí hace, y es lo que publican el USGS y los servicios
geológicos nacionales, es **pronóstico probabilístico**: "en esta zona, la probabilidad de al menos
un M≥6 en los próximos 30 días es X%". Cada pantalla que da un número lleva escrito el modelo con
el que se calculó.

---

## Qué trae

| Pestaña | Qué hace |
|---|---|
| **Mapa** | Sismicidad mundial de los últimos 30 días o del catálogo histórico. Color por magnitud o profundidad, mapa de calor, las 49 zonas dibujadas. |
| **Eventos** | Catálogo tabulado con orden por magnitud, fecha o profundidad, energía liberada en TNT, y acceso a un panel de intensidad estimada (MMI) por ciudad para cada sismo. |
| **Análisis** | Gutenberg–Richter con ajuste, valor b, completitud, actividad anual, perfil de profundidad, hora del día. |
| **Pronóstico** | ETAS a corto plazo, Poisson de fondo a largo plazo, secuencias de réplicas activas con Omori–Utsu, validación retrospectiva y ranking de las 49 zonas. |
| **Intensidad** | PSHA por ciudad: curva de amenaza, MMI y PGA de diseño (475 y 2475 años), desagregación magnitud–distancia y escenarios "¿qué pasaría si…?" con anillos de intensidad. |
| **Almacén** | DuckDB-WASM: esquema estrella cargado en el navegador y consola SQL con exportación a CSV. |
| **Aprender** | Tectónica de la región, ondas P/S, escalas, qué hacer, mitos desmontados. |

## Modelos implementados

Todos en `src/science/`, sin dependencias externas de cálculo:

- **Gutenberg–Richter** (`gutenbergRichter.ts`) — log N = a − b·M. Valor b por máxima verosimilitud
  (Aki 1965), error por Shi & Bolt (1982), magnitud de completitud por máxima curvatura
  (Wiemer & Wyss 2000).
- **Desagrupamiento** (`declustering.ts`) — ventanas espacio-temporales de Gardner & Knopoff (1974)
  para separar réplicas y premonitores de la sismicidad de fondo.
- **Omori–Utsu** (`omori.ts`) — n(t) = K (t + c)^−p ajustada por máxima verosimilitud sobre el
  proceso puntual (K analítico, malla en p y c). Modelo genérico de Reasenberg & Jones (1989)
  cuando la secuencia es corta. Ley de Båth para la réplica mayor esperada.
- **ETAS temporal** (`etas.ts`) — Ogata (1988) simplificado: tasa = fondo + disparo de cada evento
  pasado, con la productividad calibrada contra la razón de ramificación observada en la zona.
- **PSHA** (`psha.ts`) — amenaza en un sitio sumando fuentes puntuales del catálogo desagrupado,
  G–R truncada entre Mc y Mmax, y la dispersión que dicte la IPE elegida. Cada fuente pesa según
  los años en que su magnitud fue observable, no según el lapso total del catálogo. Devuelve curva
  de amenaza, intensidad de diseño y desagregación.
- **Intensidad** (`intensity.ts`) — IPE global de Allen, Wald & Worden (2012) por defecto, con
  Atkinson & Wald (2007) seleccionable, y conversión MMI↔PGA de Worden et al. (2012). La primera
  usa dispersión dependiente de la distancia, que es lo correcto dentro de un PSHA.
- **Completitud y Weichert** (`completeness.ts`) — estima desde qué año es completo el catálogo
  para cada banda de magnitud y ajusta G–R con el método de Weichert (1980), que es la
  generalización de Aki para periodos de observación desiguales. Sin esto, mezclar el registro
  histórico con el instrumental hunde las tasas: en pruebas con catálogo sintético el método
  ingenuo subestima la tasa de M≥5 en un 64 %, mientras Weichert acierta dentro del 3 %.
- **Validación de intensidad** (`ipeValidation.ts`) — enfrenta cada IPE a la intensidad que el USGS
  midió de verdad, y calcula sesgo, dispersión y RMSE. La corrección medida se puede aplicar al
  PSHA desde la interfaz. Solo entran sismos de menos de 70 km: la IPE está formulada para corteza
  somera y los eventos de slab profundo falsearían el sesgo.
- **Validación** (`forecast.ts`) — `backtest()` ajusta el modelo con los datos previos a una fecha y
  compara la tasa proyectada contra lo que realmente pasó después. Si esa tabla falla, las demás
  también.

## Datos

- **Redes FDSN**: Soporte genérico para múltiples agencias mundiales (USGS, EMSC, INGV, GeoNet, Geoscience Australia). Las
  consultas grandes se parten solas en ventanas temporales para esquivar el tope de eventos
  por petición (ej. 20 000 en el USGS). La app soporta la carga multired en paralelo y la fusión sin duplicados. De cada evento se extrae además la intensidad observada (cuando existe): `mmi` del ShakeMap
  instrumental y `cdi` de los reportes ciudadanos.
- **Servicio Geológico Colombiano**, catálogo integrado desde **1610**, servido como capa ArcGIS
  abierta. Se puede usar solo o fundido con el USGS quitando duplicados. Dos rarezas del servicio
  están resueltas en `src/data/sgc.ts`: hay que consultar el `MapServer` porque el
  `FeatureServer` falla al pedir atributos, y **las marcas de tiempo vienen en hora local de
  Colombia**, cinco horas por delante del UTC del USGS.
- **Cobertura y umbral por niveles.** El catálogo mundial completo desde 1990 son 230.000 eventos
  con M≥4.5 y solo 62.000 con M≥5.0, así que el planeta entero se pide a M≥5.0 y el umbral baja a
  M≥4.5 únicamente al enfocar una zona, recortando la consulta a su recuadro. El mapa en vivo sí
  baja a M≥2.5: son apenas 2.300 eventos en 30 días en todo el mundo.
- **Caché:** IndexedDB, 10 minutos para el catálogo reciente y 24 horas para el histórico. Se eligió
  frente a `localStorage` porque este corta en unos 5 MB y un catálogo global ocupa el doble. Si la
  base tarda más de tres segundos en abrir —otra pestaña bloqueándola, por ejemplo— la app sigue sin
  caché en vez de quedarse colgada. El botón *Actualizar* la vacía.
- **Aviso de calidad:** el servicio del SGC corta en 1000 registros por consulta y no admite
  paginación. Cuando una ventana de un solo día topa ese límite, la app lo dice en pantalla en vez
  de dar el catálogo por completo.

## Almacén de datos

`src/warehouse/duckdb.ts` levanta DuckDB en WebAssembly y monta un esquema estrella:

```
fact_sismo ──┬── dim_zona          (49 zonas sismogénicas)
             ├── dim_tiempo        (fecha, año, mes, trimestre)
             ├── dim_magnitud      (micro … grande)
             └── dim_profundidad   (superficial / intermedia / profunda)

vistas: vw_sismos · vw_resumen_zona · vw_tasa_anual
```

Cada fila del hecho trae ya la energía liberada y el rol del evento (fondo, principal, réplica,
premonitor) que sale del desagrupamiento. El motor pesa ~35 MB y solo se descarga al abrir la
pestaña *Almacén*; al recargar la página hay que reconstruir el almacén.

## Estructura

```
src/
├─ data/        usgs.ts · sgc.ts (catálogo colombiano) · cache.ts · regions.ts · cities.ts
├─ science/     stats · gutenbergRichter · completeness · declustering · omori · etas
│               psha · intensity · ipeValidation · forecast
├─ warehouse/   duckdb.ts (esquema estrella + consola SQL)
├─ hooks/       useCatalog.ts
├─ components/  MapView · EventsTable · Analytics · Forecast · Hazard · Warehouse · Learn · ui
└─ ui/          format.ts (colores, fechas, unidades)
```

Stack: React 19 + TypeScript + Vite, Tailwind 4, Leaflet, Recharts, DuckDB-WASM.

### Números de referencia

Medidos en el navegador con el catálogo real, no estimados:

| Operación | Volumen | Tiempo |
|---|---|---|
| Mapa en vivo, mundial | 2.300 eventos | ~2 s |
| Histórico mundial M≥5.0 desde 1990 | 62.472 eventos | ~10 s |
| Enfoque en una zona, M≥4.5 | 10.760 eventos (Japón NE) | ~6 s |
| Ranking de las 49 zonas | 62.472 eventos | ~3 s |
| Ingesta al almacén DuckDB | 62.472 filas · 16 MB | ~12 s |
| Amenaza de una ciudad | 62.472 eventos | ~2 s |

El valor b del catálogo mundial sale **1,05 ± 0,01**, que es el valor canónico de la sismicidad
global: una comprobación gratis de que la tubería de datos no miente.

## Límites conocidos

- Ninguna de las dos IPE está calibrada para la subducción andina, y el sesgo medido contra el
  ShakeMap del USGS ronda un grado de intensidad. Los valores de amenaza son comparativos y
  **no sustituyen la NSR-10 ni ninguna norma sismorresistente**.
- Con solo el USGS desde 1990 el catálogo es corto para estimar M≥8. Activar el SGC y retroceder
  el inicio a 1610 alivia el problema en Colombia: en el Caribe colombiano el periodo de retorno de
  un M≥7 pasa de miles de años a ~117, y la intensidad de diseño de Santa Marta sube de MMI V a
  MMI VII (~20 % g), ya en el orden de magnitud de la NSR-10. Fuera de Colombia no hay equivalente:
  el resto del mundo depende del catálogo instrumental del USGS.
- El PSHA es síncrono y con el catálogo mundial cargado tarda uno o dos segundos por ciudad.
  Moverlo a un Web Worker es el siguiente paso de rendimiento.
- El PSHA no incluye efecto de sitio (tipo de suelo), que en ciudades como México DF o Bogotá
  cambia la respuesta por completo.
- El ETAS se calibra por razón de ramificación, no por máxima verosimilitud completa.

## Documentación

`docs/Bitacora-SismosLatam.pdf` es el informe de construcción de la primera fase, cuando el
alcance era solo Latinoamérica: decisiones, modelos, verificación y errores corregidos. Se
regenera desde su fuente HTML con `node docs/build-pdf.mjs <fuente.html> informe.html` y luego
imprimiendo con Chrome en modo headless.

## Grafo del código

`graphify-out/` contiene el grafo AST del proyecto (371 nodos, 868 aristas, 16 comunidades,
generado sin coste de tokens). `graph.html` se abre en cualquier navegador y `GRAPH_REPORT.md`
lista los nodos más conectados. Para regenerarlo tras cambios grandes:

```bash
graphify . --update
```

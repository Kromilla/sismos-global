# Guía de Contribución (Contributing Guide)

¡Gracias por tu interés en contribuir a **Sismos Global**! Este es un proyecto **Open Source (MIT)** enfocado en sismología estadística, amenaza sísmica probabilística (PSHA) e ingeniería de datos en el navegador.

---

## Cómo empezar en local

1. Haz un **fork** del repositorio y clónalo:
   ```bash
   git clone https://github.com/<tu-usuario>/sismos-global.git
   cd sismos-global
   npm install
   ```
2. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```
3. Antes de abrir un Pull Request, verifica que la suite completa pase sin errores ni advertencias:
   ```bash
   npm run lint
   npm test
   npm run build
   ```

---

## Áreas donde puedes contribuir

- **Nuevas redes sismológicas FDSN (`src/data/fdsn.ts`)**: Añadir conectores para catálogos regionales compatibles con FDSN Event Web Service v1.
- **Ecuaciones de predicción de intensidad / movimiento fuerte (`src/science/intensity.ts`)**: Incorporar nuevas IPEs o GMPEs regionales (subducción andina, intraplaca, cortical) con sus pruebas en `src/science/intensity.test.ts`.
- **Nuevas zonas sismogénicas o ciudades (`src/data/regions.ts`, `src/data/cities.ts`)**: Ampliar la cobertura geográfica con sus parámetros poblacionales y tectónicos.
- **Consultas analíticas SQL (`src/warehouse/duckdb.ts`)**: Proponer consultas de ejemplo interesantes sobre el esquema estrella en DuckDB-WASM.

---

## Estándares de código

- **TypeScript estricto**: Evita el uso de `any`; mantén las funciones geofísicas puras y deterministas en `src/science/`.
- **Rendimiento en el hilo principal**: Cualquier cálculo intensivo sobre catálogos grandes ($>10\,000$ sismos) debe ejecutarse en un **Web Worker** (`*.worker.ts`).
- **Pruebas unitarias**: Toda nueva fórmula matemática o parser de datos debe incluir su test correspondiente en Vitest (`*.test.ts`).

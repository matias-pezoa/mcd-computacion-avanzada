# Proyecto: Plataforma de Modelado Parametrico Textil (impresion 3D + corte laser)

## Vision
Herramienta web para diseno de moda experimental que permite:
1. Modelar volumenes parametricos (perfil 2D + curva guia + escalado) pensados para
   impresion 3D sobre textil.
2. Generar patrones de corte laser en 2D, incluyendo geometrias auxeticas
   (re-entrantes, cuadrados rotantes, quirales) que permiten que una lamina plana
   se adapte a una superficie corporal curva.
3. Distribuir elementos (escamas, plumas, celdas) sobre una superficie 3D usando
   mapas de atraccion: campos escalares/vectoriales que controlan densidad, escala
   y rotacion de forma continua y no uniforme, siguiendo lineas anatomicas.
4. Extraer datos de imagenes de referencia (contornos vectorizables, mapas de
   luminancia usables como campos de atraccion).
5. Compensar el ancho de corte (kerf) segun material antes de exportar.
6. Exportar: STL/OBJ/glTF para impresion 3D, SVG/DXF para corte laser.

Referencia estetica: Iris van Herpen y diseno computacional de moda.

## Stack tecnico (decision tomada, no reevaluar sin discutirlo)
- React + Vite + TypeScript estricto
- Three.js via React Three Fiber (@react-three/fiber) + @react-three/drei
- zustand para estado global
- three-mesh-bvh para queries espaciales (se usara al importar mallas reales)
- vitest para tests de los modulos puros de geometry/
- oxlint (viene con la plantilla de Vite) + prettier

### Dependencias previstas por el roadmap, aun NO instaladas
Se agregan en la fase que las necesita, no antes:
- manifold-3d (WASM) -> booleans 3D robustos (fases avanzadas de volumen)
- Paper.js + Clipper2 (WASM) -> paths 2D y offset de kerf (Fases 3 y 5)
- Maker.js -> generacion de paths de corte / utilidades de kerf (evaluar en Fase 5)
- OpenCV.js -> bordes, contornos, luminancia (Fase 4)

## Convenciones de codigo
- TypeScript estricto (`strict: true`). No usar `any` sin justificacion en comentario.
- `verbatimModuleSyntax` esta activo: importar tipos con `import type`.
- Unidades: internamente en milimetros (mm) para todo lo fabricable. El viewport
  usa unidades de Three.js; la conversion pasa SIEMPRE por `src/utils/units.ts`
  (definicion actual: 1 unidad Three = 1 cm = 10 mm).
- Cada modulo de geometria (loft, campos, sampler, auxeticos, kerf) es una funcion
  pura, testeable sin React. La logica de geometria no se mezcla con UI/render.
- Todo parametro de UI tiene descriptor `NumberParam` (nombre, min/max, step,
  default, unidad) en `src/utils/params.ts` o junto a su modulo.
- Preferir composicion de funciones puras sobre clases.
- La geometria (BufferGeometry) se calcula en `App.tsx` con `useMemo` y se libera
  con `useDisposePrevious`; los componentes de escena solo renderizan.

## Estructura de carpetas
```
src/
  geometry/       # funciones puras: profile, scaleProfiles, loft, surfaces,
                  #   attractionField, sampler  (+ __tests__/)
  components/     # componentes React (escenas y paneles)
  scene/          # setup de R3F (Viewport: canvas, luces, grid, OrbitControls)
  io/             # exportadores (exportSTL) e importadores
  state/          # store de zustand
  utils/          # units, params, random
```

## Como correr
- `npm install`
- `npm run dev` -> http://localhost:5173
- `npm test` -> tests de geometry/
- `npm run build` -> `dist/` estatico (base relativa, deployable a GitHub Pages)

## Estado del proyecto

- Fase actual: 3 (geometria auxetica) — pendiente
- Ultima fase completada: 2

### Fase 0 (setup) — COMPLETA
- Proyecto Vite React-TS, estructura de carpetas, tsconfig estricto, prettier.
- `src/utils/units.ts` (Three<->mm), `src/utils/params.ts`, `src/utils/random.ts`.
- `src/scene/Viewport.tsx`: canvas R3F con luces, grid infinito, OrbitControls.

### Fase 1 (volumen parametrico) — COMPLETA
- `src/geometry/profile.ts`: perfil 2D parametrico (ancho/alto en mm, dientes),
  salida en unidades Three, CCW, cerrado. Helpers `signedArea`, `profileBounds`.
- `src/geometry/scaleProfiles.ts`: presets de escalado constante / lineal / campana.
- `src/geometry/loft.ts`: `loftProfile(profile, curve, scaleFn, options)` barre el
  perfil por una `THREE.Curve` usando marcos de Frenet; colapsa secciones con
  escala ~0 y descarta triangulos degenerados; tapas opcionales. Devuelve
  BufferGeometry + rings + stats.
- `src/io/exportSTL.ts`: `downloadStl` / `geometryToStlBlob` (escala a mm).
- UI: `LoftScene` (malla + edicion de la curva guia con TransformControls) y
  `LoftPanel` (perfil, escalado, malla, export, stats).
- Tests: `profile.test.ts`, `loft.test.ts` (seccion uniforme, campana, colapso
  sin degenerados, malla valida).

### Fase 2 (mapas de atraccion) — COMPLETA
- `src/geometry/attractionField.ts`: `Attractor` (posicion, radio, strength,
  falloff linear/inverseSquare/gaussian), `sampleField(point, attractors, combine)`
  -> { value in [0,1], direction }. Combine 'max' | 'sum'.
- `src/geometry/surfaces.ts`: superficies parametricas de prueba (esfera, cilindro
  deformado tipo torso) con interfaz `ParametricSurface` + `surfaceToGeometry`.
  (En Fase 6 se reemplaza por malla importada + three-mesh-bvh, misma interfaz.)
- `src/geometry/sampler.ts`: `sampleSurface` — grilla UV filtrada
  probabilisticamente por el campo; escala y orientacion (normal + gradiente
  proyectado) por instancia; determinista por seed; tope `maxCount`.
  `instanceMatrix` compone la matriz de cada instancia.
- UI: `FieldScene` (superficie translucida, `InstancedMesh` con color por campo,
  gizmos de atractores; clic en la superficie agrega, arrastre mueve el
  seleccionado) y `FieldPanel` (superficie, lista de atractores, combine, sampler).
- Tests: `attractionField.test.ts`, `sampler.test.ts` (determinismo, densidad vs
  atractor, maxCount, ortonormalidad de ejes).

### Pendiente / notas para retomar
- El instanciado usa un placeholder (cono). Fase 6: usar la "pluma" real de Fase 1
  como geometria instanciada.
- Frenet frames pueden torcer en curvas casi planas; si molesta, cambiar loft a
  rotation-minimizing frames (parallel transport).
- Deploy a GitHub Pages: ver `.github/workflows/` y README. El repo padre ya
  publica su propio sitio; este subproyecto se sirve con `base: './'`.

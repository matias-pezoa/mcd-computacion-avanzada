# Proyecto: Plataforma de Modelado Parametrico Textil (impresion 3D + corte laser)

## Vision
Herramienta web para diseno de moda experimental. Dos modos, dos fabricaciones:

1. **Volumen (3D):** TODO emerge de un plano 2D (la base de tela). Sobre ese plano
   se siembran "puas": piezas solidas (cono truncado) que crecen desde el plano;
   altura, radios, inclinacion y densidad salen de un mapa de atractores. Se
   exporta un unico STL para imprimir en 3D sobre la tela. NO hay edicion de
   curvas 3D a mano: la forma es 100% parametrica, y esta constrenida por
   construccion a lo que FDM puede imprimir sin soporte (ver mas abajo).
2. **Corte laser (2D):** se trabaja SOLO desde el vector. Cortes parametricos con
   distintas familias de geometria (huella de las puas, retícula auxetica,
   escamas), export SVG/DXF con compensacion de kerf. (En preparacion.)

Ademas (roadmap): extraer datos de imagenes de referencia (contornos, luminancia
como campo de atraccion) y libreria de materiales para el kerf.

Referencia estetica: Iris van Herpen — piezas rigidas que se despliegan desde
una base de malla/tul siguiendo la anatomia, densidad variable. El modo Volumen
la reinterpreta con una geometria simple y estructuralmente solida (no una
pared delgada arqueada) para que sea realmente imprimible.

## Factibilidad de impresion (modo Volumen) — restriccion de diseno, no detalle de implementacion
El primer intento (Fase "pluma": perfil 2D hueco barrido por una curva que se
arqueaba hasta ~150°) era visualmente interesante pero NO imprimible: vuelo
extremo sin soporte, punta mas fina que una linea de extrusion, base sin area
de contacto para adherirse a la tela. Se reemplazo por una "pua" solida (cono
truncado, ver `geometry/spike.ts`) que es imprimible **por construccion**:
- Inclinacion siempre <= `SAFE_OVERHANG_DEG` (45°, el limite generico de vuelo
  autosoportado en FDM). La pua es una linea recta de base a punta con angulo
  CONSTANTE, asi que ningun tramo vuela mas que el resto.
- Radio de punta y de base con piso en mm (`MIN_TIP_RADIUS_MM`,
  `MIN_ROOT_RADIUS_MM`) para que la punta no colapse y la base tenga area de
  adherencia real sobre la tela.
- Las puas nunca se solapan entre si (rechazo por colision en el sampler).
No relajar estos limites sin discutirlo — son la razon de ser de este modulo.

## Stack tecnico (decision tomada, no reevaluar sin discutirlo)
- React + Vite + TypeScript estricto
- Three.js via React Three Fiber (@react-three/fiber) + @react-three/drei
- zustand para estado global
- three-mesh-bvh para queries espaciales (se usara al importar mallas reales)
- vitest para tests de los modulos puros de geometry/
- oxlint (viene con la plantilla de Vite) + prettier

### Dependencias previstas por el roadmap, aun NO instaladas
Se agregan en la fase que las necesita, no antes:
- manifold-3d (WASM) -> booleans 3D robustos (si se necesitan mas adelante)
- Paper.js + Clipper2 (WASM) -> paths 2D y offset de kerf (modo Corte laser)
- Maker.js -> generacion de paths de corte / utilidades de kerf (evaluar despues)
- OpenCV.js -> bordes, contornos, luminancia (imagen -> vector/campo)

## Convenciones de codigo
- TypeScript estricto (`strict: true`). No usar `any` sin justificacion en comentario.
- `verbatimModuleSyntax` esta activo: importar tipos con `import type`.
- Unidades: internamente en milimetros (mm) para todo lo fabricable. El viewport
  usa unidades de Three.js; la conversion pasa SIEMPRE por `src/utils/units.ts`
  (definicion actual: 1 unidad Three = 1 cm = 10 mm).
- Cada modulo de geometria (spike, spikeField, attractionField) es una funcion
  pura, testeable sin React. La logica de geometria no se mezcla con UI/render.
- Todo parametro de UI tiene descriptor `NumberParam` (nombre, min/max, step,
  default, unidad) en `src/utils/params.ts` o junto a su modulo.
- Preferir composicion de funciones puras sobre clases.
- La geometria (BufferGeometry) se calcula en `App.tsx` con `useMemo` y se libera
  con `useDisposePrevious`; los componentes de escena solo renderizan.

## Estructura de carpetas
```
src/
  geometry/       # funciones puras (+ __tests__/):
                  #   spike           una pua: cono truncado autosoportado
                  #   spikeField      plano + atractores -> campo de puas sin solape
                  #   attractionField atractores + sampleField
  components/     # SpikeFieldScene, SpikeFieldPanel, ParamSlider
  scene/          # Viewport (canvas R3F, luces, grid, OrbitControls)
  io/             # exportSTL
  state/          # store de zustand
  utils/          # units, params, random
```

## Como correr
- `npm install`
- `npm run dev` -> http://localhost:5173
- `npm test` -> tests de geometry/
- `npm run build` -> genera el sitio en `../../plataforma-parametrica/` (raiz del
  repo). Esa carpeta es lo que sirve GitHub Pages: commitearla a `main` + push.
  URL: https://<usuario>.github.io/mcd-computacion-avanzada/plataforma-parametrica/

## Estado del proyecto

- Modo Volumen: COMPLETO (campo de puas solidas desde el plano, dirigido por
  atractores, imprimible por construccion).
- Modo Corte laser: PENDIENTE (solo un placeholder en la UI).

### Setup — COMPLETO
- Vite React-TS, estructura de carpetas, tsconfig estricto, prettier, vitest.
- `utils/units.ts` (Three<->mm, 1u=1cm), `utils/params.ts`, `utils/random.ts`.
- `scene/Viewport.tsx`: canvas R3F con luces, grid infinito, OrbitControls.

### Modo Volumen — COMPLETO (2a iteracion: puas solidas, no plumas huecas)
La 1a iteracion (pluma: perfil 2D barrido por una curva arqueada, ver seccion
de factibilidad arriba) se descarto por no ser imprimible. Reemplazada por:

- `geometry/spike.ts`: `buildSpike(base, leanDir, params)` -> `Spike` (base,
  punta, eje, radios YA con piso aplicado, `footprintRadius`, `leanDegApplied`
  YA recortado a `[0, min(maxOverhangDeg, SAFE_OVERHANG_DEG)]`). `spikeGeometry`
  construye el cono truncado (CylinderGeometry orientado + trasladado), solido
  y cerrado. `segments` bajo (3-6) da piramides/prismas; alto da un cono liso.
- `geometry/attractionField.ts`: sin cambios — `Attractor`, `sampleField`.
- `geometry/spikeField.ts`: `buildSpikeField(attractors, params)` — siembra
  puntos en el plano por densidad del campo (grilla + jitter, como antes);
  cada pua toma altura/radios/inclinacion del campo, se inclina ALEJANDOSE del
  atractor, y se **rechaza si su huella se solapa con una ya colocada**
  (`rejectedByOverlap` queda en el resultado). Fusiona todas las puas en una
  sola malla (`geometry`), lista para exportar sin pasos adicionales.
  Determinista por seed, tope `maxCount`.
- UI: `SpikeFieldScene` (base de tela + malla solida + gizmos de atractores;
  clic en el plano agrega atractor, arrastre lo mueve) y `SpikeFieldPanel`
  (seccion "Factibilidad de impresion" con los limites explicados, base y
  distribucion, forma de la pua, atractores, export STL + stats incluyendo
  cuantas puas se descartaron por solape).
- Tests: `spike.test.ts` (angulo constante en toda la longitud, pisos de radio,
  techo `SAFE_OVERHANG_DEG` defensivo, malla solida sin NaN),
  `spikeField.test.ts` (determinismo, densidad vs atractor, maxCount, CERO
  solapes entre pares de puas, pisos de fabricacion respetados),
  `attractionField.test.ts`. 20 casos.

### Pendiente / notas para retomar
- **Modo Corte laser** (siguiente): 2D puro. Familias parametricas — empezar por
  la huella vectorial del campo de puas (circulo de base + circulo de punta
  proyectados, para que el corte calce con la pieza 3D si se pega por separado),
  luego reticula auxetica y escamas. Render en canvas/SVG aparte del viewport
  3D. Export SVG (grupos por capa) y DXF. Kerf con Clipper2 mas adelante.
- `SAFE_OVERHANG_DEG = 45` es un valor generico razonable para FDM sin soporte;
  si se calibra con la impresora/material real del usuario, exponerlo como
  configuracion en vez de constante — hoy es deliberadamente no editable mas
  alla del slider `maxOverhangDeg` (que nunca puede superarlo).
- Los `default` de algunos `NumberParam` no coinciden 1:1 con
  `DEFAULT_SPIKE_FIELD` (la fuente de verdad es la constante; el descriptor solo
  alimenta tooltips). Alinear si se agrega "reset por slider".
- Variedad de formas futura: `segments` ya permite piramide/prisma/cono desde el
  mismo codigo; si se quiere una familia distinta (domo, etc.) evaluar si vale
  la pena antes de agregar mas parametros.
- Deploy: `npm run build` -> `../../plataforma-parametrica/`; commit + push a `main`.

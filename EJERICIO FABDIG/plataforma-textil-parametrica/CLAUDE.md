# Proyecto: Plataforma de Modelado Parametrico Textil (impresion 3D + corte laser)

## Vision
Herramienta web para diseno de moda experimental. Dos modos, dos fabricaciones:

1. **Volumen (3D):** TODO emerge de un plano 2D (la base de tela). Sobre ese plano
   se siembran elementos tipo pluma (perfil 2D + nervadura) que crecen y se
   arquean hacia arriba; altura, ancho, curvatura, orientacion y densidad salen
   de un mapa de atractores. Se exporta un unico STL para imprimir en 3D sobre
   la tela. NO hay edicion de curvas 3D a mano: la forma es 100% parametrica.
2. **Corte laser (2D):** se trabaja SOLO desde el vector. Cortes parametricos con
   distintas familias de geometria (huella de las plumas, retícula auxetica,
   escamas), export SVG/DXF con compensacion de kerf. (En preparacion.)

Ademas (roadmap): extraer datos de imagenes de referencia (contornos, luminancia
como campo de atraccion) y libreria de materiales para el kerf.

Referencia estetica: Iris van Herpen — piezas rigidas translucidas que se
despliegan desde una base de malla/tul siguiendo la anatomia, densidad variable.

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
  geometry/       # funciones puras (+ __tests__/):
                  #   profile        perfil 2D de la seccion
                  #   loft           barrido perfil->malla (marco Frenet | reference)
                  #   quill          espina procedural de una pluma desde el plano
                  #   attractionField atractores + sampleField
                  #   featherField   plano + atractores -> campo de plumas fusionado
  components/     # FeatherFieldScene, FeatherFieldPanel, ParamSlider
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

- Modo Volumen: COMPLETO (campo de plumas desde el plano, dirigido por atractores).
- Modo Corte laser: PENDIENTE (solo un placeholder en la UI).

### Setup — COMPLETO
- Vite React-TS, estructura de carpetas, tsconfig estricto, prettier, vitest.
- `utils/units.ts` (Three<->mm, 1u=1cm), `utils/params.ts`, `utils/random.ts`.
- `scene/Viewport.tsx`: canvas R3F con luces, grid infinito, OrbitControls.

### Modo Volumen — COMPLETO
Reemplaza el enfoque anterior (curva-guia 3D editable + instanciado sobre
superficie). Ahora TODO emerge de un plano.

- `geometry/profile.ts`: perfil 2D parametrico (ancho/alto mm, dientes), salida
  en unidades Three, CCW, cerrado.
- `geometry/loft.ts`: `loftProfile(profile, curve, scaleFn, options)`. `options.frame`
  = `{type:'frenet'}` (default) o `{type:'reference', up}` (eje ancho fijo cercano
  a `up`, sin giros — necesario para las plumas). Colapsa secciones con escala ~0,
  descarta triangulos degenerados, tapas opcionales.
- `geometry/quill.ts`: `buildQuillSpine(base, leanDir, params)` -> espina que sale
  vertical del plano y se arquea hacia `leanDir` segun `curvature`. Devuelve la
  curva + `crossAxis` (eje ancho horizontal para el marco reference del loft).
- `geometry/attractionField.ts`: `Attractor` (pos, radio, strength, falloff
  linear/inverseSquare/gaussian), `sampleField(point, attractors, combine)` ->
  `{ value 0..1, direction }`. combine 'max' | 'sum'.
- `geometry/featherField.ts`: `buildFeatherField(attractors, params)` — siembra
  puntos en el plano por densidad del campo; en cada uno genera una pluma cuya
  altura/ancho/curvatura salen del campo y que se arquea ALEJANDOSE del atractor;
  fusiona todas las palas y (opcional) nervaduras en una malla. Determinista por
  seed, tope `maxCount`. `mergeForExport(result)` fusiona palas+nervaduras para
  un unico STL (bajo demanda, no en cada recalculo).
- UI: `FeatherFieldScene` (base de tela + malla translucida + nervaduras + gizmos
  de atractores; clic en el plano agrega atractor, arrastre lo mueve) y
  `FeatherFieldPanel` (base/distribucion, forma de pluma, perfil, atractores,
  export STL + stats).
- Tests: `profile`, `loft` (incl. marco reference), `quill`, `attractionField`,
  `featherField`. 28 casos.

### Pendiente / notas para retomar
- **Modo Corte laser** (siguiente): 2D puro. Familias parametricas — empezar por
  la huella vectorial del campo de plumas (contorno + linea de nervadura de cada
  pluma proyectada al plano, para que el corte calce con la pieza 3D), luego
  reticula auxetica y escamas. Render en canvas/SVG aparte del viewport 3D.
  Export SVG (grupos por capa) y DXF. Kerf con Clipper2 mas adelante.
- `material transmission` se cambio por `opacity` simple (mas predecible y sin
  render target); si se quiere vidrio real, volver a `meshPhysicalMaterial`.
- Los `default` de algunos `NumberParam` no coinciden 1:1 con
  `DEFAULT_FEATHER_FIELD` (la fuente de verdad es la constante; el descriptor solo
  alimenta tooltips). Alinear si se agrega "reset por slider".
- Deploy: `npm run build` -> `../../plataforma-parametrica/`; commit + push a `main`.

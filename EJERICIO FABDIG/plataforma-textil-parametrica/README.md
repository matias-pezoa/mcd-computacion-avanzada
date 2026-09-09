# Plataforma parametrica textil — impresion 3D + corte laser

Herramienta web para diseno de moda experimental: modelado de volumenes
parametricos, distribucion de elementos por mapas de atraccion, geometria
auxetica y exportacion para fabricacion digital (STL / SVG / DXF).

Construida siguiendo una guia por fases (`docs/guia-fases.md`). Ver `CLAUDE.md`
para la vision completa, el stack y el estado por fases.

## Estado

| Fase | Que | Estado |
|---|---|---|
| 0 | Setup + viewport 3D | ✅ |
| 1 | Motor de volumen parametrico (perfil 2D + curva guia + escalado, export STL) | ✅ |
| 2 | Mapas de atraccion + instanciado dirigido por campo | ✅ |
| 3 | Geometria auxetica | pendiente |
| 4 | Imagen → vector / dato | pendiente |
| 5 | Kerf + exportacion laser | pendiente |
| 6 | Integracion | pendiente |
| 7 | Pulido | pendiente |

## Requisitos

- Node.js 20+ (probado con Node 24). El resto del repo no tiene build step;
  este subproyecto si, por el stack React/Vite/TS elegido en la guia.

## Uso

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests unitarios de src/geometry/
npm run build      # genera dist/ (estatico)
npm run lint       # oxlint
npm run format     # prettier
```

### Fase 1 — Volumen

Pestana **1 · Volumen**. Un perfil 2D (seccion de "pluma") se barre a lo largo
de una curva guia editable, con un perfil de escalado (constante / lineal /
campana). Clic en un punto de control del viewport para seleccionarlo y
arrastrar los ejes. "Descargar STL (mm)" exporta la malla convertida a
milimetros.

### Fase 2 — Atractores

Pestana **2 · Atractores**. Sobre una superficie de prueba (cilindro tipo torso
o esfera) se distribuyen instancias con densidad, escala y orientacion
controladas por atractores. Clic en la superficie agrega un atractor; clic en
una esfera roja lo selecciona y permite arrastrarlo; el panel ajusta radio,
intensidad y tipo de caida.

## Deploy a GitHub Pages

El Pages del repo sirve la rama `main` desde la raiz, sin build step. Este
subproyecto se publica como carpeta estatica:

- `npm run build` genera el sitio directamente en `../../plataforma-parametrica/`
  (raiz del repo), con `base: './'` (rutas relativas).
- Commitear esa carpeta a `main` y pushear. Queda en
  `https://<usuario>.github.io/mcd-computacion-avanzada/plataforma-parametrica/`.
- **Rebuild = re-`npm run build` + commit** de `plataforma-parametrica/`.

Alternativa con GitHub Actions: `.github/workflows/deploy-plataforma.yml`
(incluido, inerte). Habria que moverlo a la raiz del repo y cambiaria la fuente
de Pages a "GitHub Actions", desplazando el sitio raiz actual. No recomendado
mientras el repo publique su About desde la raiz.

## Estructura

Ver `CLAUDE.md`. Resumen: `src/geometry/` = funciones puras (con tests),
`src/components/` = escenas y paneles React, `src/scene/` = setup de R3F,
`src/io/` = exportadores, `src/state/` = store zustand, `src/utils/` = unidades
y helpers.

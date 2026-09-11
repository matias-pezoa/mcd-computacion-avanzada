# Plataforma parametrica textil — impresion 3D + corte laser

Herramienta web para diseno de moda experimental: modelado de volumenes
parametricos, distribucion de elementos por mapas de atraccion, geometria
auxetica y exportacion para fabricacion digital (STL / SVG / DXF).

Construida siguiendo una guia por fases (`docs/guia-fases.md`). Ver `CLAUDE.md`
para la vision completa, el stack y el estado por fases.

## Estado

| Modo | Que | Estado |
|---|---|---|
| Volumen (3D) | Puas solidas y autosoportadas que emergen de un plano, dirigidas por un mapa de atractores. Imprimibles por construccion. Export STL. | ✅ |
| Corte laser (2D) | Cortes parametricos solo-vector (huella de puas, auxetico, escamas). Export SVG/DXF. | pendiente |

Roadmap posterior: imagen → vector / campo, kerf por material, importar maniqui.
Ver `docs/guia-fases.md`.

## Requisitos

- Node.js 20+ (probado con Node 24). El resto del repo no tiene build step;
  este subproyecto si, por el stack React/Vite/TS elegido en la guia.

## Uso

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests unitarios de src/geometry/
npm run build      # compila a ../../plataforma-parametrica/ (ver Deploy)
npm run lint       # oxlint
npm run format     # prettier
```

### Modo Volumen (3D)

Todo emerge de un plano (la base de tela). Sobre el se siembran **puas**: piezas
solidas (cono truncado, no una pared delgada) que crecen desde el plano. La
**altura, los radios, la inclinacion y la densidad** salen del **mapa de
atractores**, no de edicion manual — y estan limitados por construccion a lo
que una impresora FDM puede imprimir sin soporte:

- **Vuelo autosoportado ≤ 45°**: cada pua es una linea recta de base a punta con
  angulo constante, asi que ningun tramo vuela mas que el resto.
- **Radio minimo en la punta y en la base**: la punta nunca se afina por debajo
  del ancho de una linea de extrusion; la base nunca baja de un area de
  contacto real para adherirse a la tela.
- **Sin solapes**: una pua candidata se descarta si su huella invade la de una
  ya colocada (el panel muestra cuantas se descartaron por esto).

Ajustando `Caras` (en "Forma de la pua") de 3 a ~32 la pua pasa de piramide a
prisma a cono liso — variedad de forma sin agregar parametros nuevos.

- Clic en el plano agrega un atractor; clic en una esfera roja la selecciona y
  permite arrastrarla (su altura tambien influye).
- El panel ajusta la base y distribucion, la forma de la pua y cada atractor
  (radio, intensidad, tipo de caida).
- "Descargar STL (mm)" exporta **todas las puas fusionadas** en un unico
  archivo, convertido a milimetros.

### Modo Corte laser (2D) — en preparacion

Trabajara solo desde el vector: cortes parametricos con distintas familias de
geometria y export SVG/DXF con compensacion de kerf.

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

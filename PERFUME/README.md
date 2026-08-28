# Ejercicio 02 — VRTG SCENT

Computación Avanzada · Magíster en Ciencias del Diseño · Universidad Adolfo Ibáñez

Atlas generativo de perfumes: cada fragancia de `perfume_visualization.json` se traduce en una naturaleza muerta 3D biomórfica y abstracta — un mapa morfológico de su identidad olfativa, inspirado en composiciones de objetos independientes (glossy, cromados, chenille, concreto, vidrio) ensamblados alrededor de una columna central — construida procedimentalmente a partir de sus propios datos, sin geometría decorativa ni valores inventados. Cada nota olfativa aporta su propio elemento a la composición de forma independiente; la combinación de notas de cada perfume es lo que vuelve única a cada pieza.

## Pregunta guía

> ¿Cómo puede el perfil olfativo de un perfume traducirse en un territorio tridimensional único y comparable?

## Dataset

`perfume_visualization.json` (fuente: [Perfumes_Recommender](https://github.com/rawanalqarni/Perfumes_Recommender)). Se lee con D3 (`d3.json`); las notas (`top_notes`/`middle_notes`/`base_notes`) ya vienen como arrays y se limpian en el cliente: sin espacios/duplicados/mayúsculas, descartando el valor centinela `unknown`; `rate`/`rating_count` ya vienen como `null` (no `"none"`) en las filas sin dato; `year` tiene un puñado de outliers muy antiguos (hasta 1792) que se recortan por percentil solo para la escala espacial, no para el dato mostrado.

## Mappings dato → geometría

| Dato | Regla | Propiedad geométrica |
|---|---|---|
| nota individual (top/middle/base) | hash determinístico de su nombre → arquetipo (blob glossy, cromo, chenille/fuzz, concreto, vidrio) + dirección fija en la esfera | elemento 3D propio, independiente de los demás — la misma nota siempre genera el mismo objeto en el mismo lugar relativo, en cualquier perfume (permite comparar) |
| `top_notes` / `middle_notes` / `base_notes` | zona vertical de anclaje a la columna central | periferia superior · anillo medio · núcleo inferior |
| cantidad de notas por capa | escala inversa (D3) | tamaño de cada elemento — más notas en la capa, elementos más pequeños, para que la composición no se sature |
| `fragrance_family` | tabla de parámetros por familia | color de cada elemento (tintado por nota) y de la columna central; metalness/roughness/clearcoat de la columna |
| `year` | escala D3 (recortada en percentil bajo) | profundidad Z del conjunto + marcador sobre una línea temporal en la escena |
| `rate` / `rating_count` | escalas normalizadas y clampeadas (D3) | escala global de los elementos de la composición |

La geometría es reproducible: el mismo `perfume_id` siempre genera la misma combinación de elementos (arquetipo, forma y orientación de cada nota seedeados por hash del dato, no por `Math.random`); sólo color, tamaño y posición exacta cambian según el perfume que contiene esa nota. La cámara se reencuadra automáticamente a la caja que envuelve la composición activa, porque el tamaño y la dispersión de cada conjunto de notas varía mucho de un perfume a otro.

## Interacción

- Buscar por nombre/marca, filtrar por familia y por rango de año.
- Seleccionar un perfume → transición suave de entrada/actualización/salida por nota: los elementos de notas compartidas con el perfume anterior se mueven a su nueva posición/color, los nuevos crecen desde la columna central y los que ya no aplican se retraen y desaparecen.
- Rotar (drag) y hacer zoom (scroll) sobre el objeto.
- Activar/desactivar TOP / HEART / BASE.
- Hover sobre el volumen → tooltip con la nota (o la familia) que generó esa zona.
- Perfumes relacionados (misma familia/marca/año cercano) y línea temporal en la propia escena.
- **Mapa de notas** (botón superior derecho): red 3D expandible de perfumes vinculados por similitud de composición (notas en común ponderadas por si coinciden en la misma capa top/middle/base — no un simple cruce de conjuntos), con layout por simulación de fuerzas (repulsión + resortes + centrado en el foco). Cada nodo es una versión reducida de la propia composición 3D del perfume (mismos arquetipos/color por familia/columna central que la vista individual, con un tope de notas moderado); dentro de cada nodo, las notas que no comparte con el foco se achican y atenúan. Parte del perfume activo; click en un nodo muestra su ficha y las notas que comparte con el foco; doble click lo convierte en el nuevo foco y expande sus vecinos (hasta 60 nodos por sesión de exploración). Leyenda propia con vista previa 3D de cada arquetipo. "Ver composición 3D" vuelve a la vista principal con ese perfume seleccionado.

## Estructura

```text
exercise-02/
├── README.md
├── index.html
├── style.css
├── script.js
└── perfume_visualization.json
```

## Cómo ejecutarlo

Usa módulos JS (`import`) + `fetch` del JSON, así que necesita un servidor local (no funciona con `file://`).

### Opción recomendada — VS Code + Live Server

1. Abre esta carpeta (o la raíz del repositorio) en VS Code.
2. Click derecho sobre `exercise-02/index.html` → **Open with Live Server**.

## Qué mirar en `script.js`

```text
01 — PALETA Y REGLAS DE FAMILIA   ← tabla color/curvatura/elongación/densidad/transmisión por familia
02 — UTILIDADES                  ← hash, PRNG seedeable (mulberry32), ruido 3D (Perlin, seedeado), dirección de nota
03 — CARGA Y LIMPIEZA DE DATOS   ← parseo/limpieza de notas, family, rate, rating_count, year
04 — ESCALAS (D3)                ← year, rate, rating_count
05 — ESCENA THREE.JS             ← incluye entorno PMREM (RoomEnvironment) para reflejos PBR
06 — ARQUETIPOS DE NOTA          ← geometría + material por arquetipo: blob, cromo, fuzz/chenille, concreto, vidrio
07 — COLUMNA CENTRAL Y CACHÉ     ← columna que atraviesa las capas, caché persistente de objetos por nota (tendón de anclaje)
08 — OBJETIVO POR NOTA           ← posición/escala/color de cada nota para el perfume activo
09 — TRANSICIÓN                  ← tween de entrada/actualización/salida por nota + reencuadre automático de cámara
10 — RAYCASTING / TOOLTIP        ← hit-test directo contra el objeto de cada nota
11 — ANIMACIÓN
12-13 — ESTADO / UI / INIT
```

## GitHub Pages

Rutas relativas, sin build step; se publica en `/exercise-02/` dentro del sitio del curso.

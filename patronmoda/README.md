# Patrón de moda paramétrico — patrón de cuerpo base

Primer módulo de un sistema paramétrico de generación de patrones de moda:
a partir de un set de medidas, genera el patrón de cuerpo base (delantero +
espalda) y lo exporta a `.dxf`. Sin build step — HTML/CSS/JS con módulos ES
nativos, como el resto de los ejercicios del repo.

Método de trazado de referencia: [thecopycat.blog — Cómo hacer un patrón de
cuerpo base](https://thecopycat.blog/2021/03/01/como-hacer-un-patron-de-cuerpo-base/).

## Uso

Necesita servirse por HTTP (los `import` de ES modules no cargan sobre
`file://` en la mayoría de los navegadores). Con Live Server, o:

```bash
python -m http.server 8642 --directory patron-moda
```

y abrir `http://localhost:8642`.

- El panel izquierdo tiene las medidas del cuerpo (arriba) y los valores de
  patronaje/tabla (abajo, colapsados por defecto — son ajuste fino).
- El patrón se redibuja en vivo.
- "Ver/exportar pieza completa" espeja la mitad trazada sobre el centro
  delantero/espalda para mostrar la pieza entera (útil para cortar; la línea
  de doblez queda como guía punteada interior).
- "Exportar DXF" descarga `patron-cuerpo-base.dxf` (delantero + espalda, en
  el modo mitad o pieza completa según el toggle).

## Estructura

- `measurements.js` — catálogo de medidas paramétricas (clave, etiqueta,
  rango, valor por defecto) agrupadas en "cuerpo" (se toman directo sobre la
  persona) y "tabla" (valores que el artículo saca de una tabla estándar en
  vez de derivarlos por fórmula — acá quedan expuestos para ajustarlos).
- `bodice.js` — motor geométrico: traduce las medidas a los puntos/curvas
  del delantero y la espalda, paso a paso según el artículo.
- `render.js` — dibuja las piezas como SVG.
- `dxf.js` — exporta las piezas a DXF (AC1015, 1 unidad = 1 cm).
- `script.js` / `index.html` / `style.css` — interfaz.

## Del artículo al código: qué es literal y qué es aproximado

El artículo describe el trazado como se enseña a mano (con instrucciones
como "curva suave" o "curva más pronunciada"), sin coordenadas exactas ni
imágenes con medidas anotadas. Esta implementación traduce cada paso a una
fórmula concreta; donde el artículo no da un número exacto, se documenta acá
la elección tomada — todas son parámetros ajustables en el panel "valores de
patronaje", no constantes escondidas:

- **Cuello, hombro y sisa** (pasos 3-5, 9): literales — `cuello/6 + 0,5`,
  `cuello/6 + 2` (delantero) / `2 cm` (espalda), bajada de hombro `4 cm`.
  El punto de "aplomo de sisa" (paso 9) se usa como guía para que la curva de
  la sisa salga vertical desde el costado.
- **Curvas** (cuello, sisa, cadera): el artículo pide "curva suave" a mano
  alzada; acá son Bézier cuadráticas/cúbicas con puntos de control elegidos
  para pasar cerca de las esquinas de construcción (esquina del cuello para
  el escote, esquina de la caja de sisa para la sisa). Son una interpretación
  razonable, no un trazado idéntico al del artículo — el "grosor" de cada
  curva es tunable cambiando esos puntos de control en `bodice.js` si hace
  falta calzar contra un patrón de referencia real.
- **Pinza de busto** (pasos 6-9): literal — vértices a `profundidad/2` sobre
  y bajo la altura de busto, sobre el costado; el vértice de la pinza se
  "despega" del ápice real (`dartRelease`, 2-3 cm sugeridos por el artículo)
  para evitar un pico filoso en la tela.
- **Pinza de talle delantera** (paso 8): literal — ancho `1 cm a cada lado`
  del centro de busto, largo 9-10 cm.
- **Pinza de talle espalda**: el artículo da el largo (11-12 cm) pero no la
  posición horizontal exacta ni el ancho. Se asume centrada bajo el ancho de
  espalda (`backWidth/2`) con ancho por defecto de 3 cm — **supuesto, no dato
  del artículo**.
- **Holgura de cintura** (`+2 cm` delantero, paso 8): el artículo solo da
  esta cifra para el delantero. Se usa la misma holgura por defecto en la
  espalda (`backWaistExtra`) — **supuesto simétrico, no confirmado por el
  artículo**.
- **Tramo cintura→cadera**: el artículo dice "proyectar la pinza hacia abajo
  con una curva suave" además de unir cintura con cadera con curva suave, sin
  coordenadas. Esta versión simplifica esa etapa: dibuja una única curva de
  costado entre cintura y cadera, y dibuja la pinza de talle solo por encima
  de la cintura (no proyecta sus líneas hacia la cadera). Es la simplificación
  más grande respecto al artículo — si se necesita el paneo de la pinza hacia
  la cadera, es el próximo punto a extender en `buildPiece()`.
- **Ancho de cadera**: el artículo usa `1/4 circunferencia de cadera` sin
  distinguir delantero/espalda; acá se aplica igual a ambas piezas.

## Extender el sistema (siguientes piezas)

`bodice.js` expone segmentos tipados (`line`, `quad`, `cubic`) con puntos
`{x,y}` — el mismo formato que consumen `render.js` (SVG) y `dxf.js` (DXF).
Una pieza nueva (manga, falda, etc.) solo necesita:

1. Agregar sus medidas a `MEASUREMENT_GROUPS` en `measurements.js`.
2. Escribir su propia función `buildPiece(...)` que devuelva
   `{ id, label, outline, darts, points, bounds }`.
3. Reusar `renderBodiceSvg`/`buildDxf` (o generalizarlos a N piezas en vez de
   front/back fijos — hoy están especializados a dos piezas).

## Estado de verificación

- Geometría verificada leyendo el `d` del SVG generado (continuidad de cada
  tramo, valores de puntos clave contra el cálculo a mano) y visualmente en
  navegador, en modo mitad y en modo pieza completa espejada (sin
  autointersecciones).
- El DXF exportado se verificó por estructura (secciones balanceadas, sin
  `NaN`, cantidad de entidades esperada) leyendo el texto generado — **no se
  probó abriendo el archivo en un CAD real (AutoCAD/LibreCAD/Illustrator)**;
  antes de cortar un patrón real, ábrelo primero en el programa que vayas a
  usar para confirmar escala y capas (`CORTE`, `PINZAS`, `GUIAS`,
  `ETIQUETAS`).
- No se validó el patrón contra un cuerpo/maniquí real ni contra un patrón
  de referencia impreso — los valores por defecto son una talla de referencia
  típica (aprox. talla M), no una medición verificada.

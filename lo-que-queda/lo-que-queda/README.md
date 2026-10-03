# Lo que queda — prototipo de desgaste por mirada (v2)

Un feed vertical en que **las zonas que miras se gastan**: se pixelan, sus colores se mezclan hasta volverse manchones y al final se blanquean hasta quedar completamente blancas. Si una imagen no provoca respuesta en la piel, las zonas que miraste en ella se gastan más. Cuando el cuerpo deja de responder durante varias imágenes seguidas, el feed se cierra y aparece un informe con los mapas de calor de la mirada.

Usa el sistema de diseño de *Desnaturalización IA* (Computación Avanzada 2026): monocromo, líneas de 1 px, sin esquinas redondeadas, grano fino, barras fijas arriba y abajo, dock numerado a la derecha, lectura en vivo abajo a la izquierda y título en verde lima.

## Archivos

- `index.html`: la experiencia completa y el dock del operador.
- `corpus/`: imágenes del feed y `manifest.json` con su lista (ver `corpus/LEEME.md`). Si la lista está vacía se usan 12 imágenes de demostración.
- `assets/fonts/`: tipografías (ver `assets/fonts/LEEME.md`). Si faltan, se usan fuentes del sistema.
- `vendor/webgazer/`: WebGazer 3.5.3 y su modelo de rostro (MediaPipe), incluidos para que el eye tracking funcione sin conexión. Licencia GPL v3.
- `lo_que_queda_entrada/lo_que_queda_entrada.ino`: sketch del Arduino (potenciómetro y encoder). No se ejecuta en la web.
- `LICENSE`: GPL v3 (necesaria por incluir WebGazer).

## Publicación en GitHub Pages

En el repositorio: Settings → Pages → Deploy from a branch → `main` → `/ (root)`. El sitio queda en https://fefeliperoar.github.io/lo-que-queda/. Pages usa HTTPS, así que la cámara y el USB funcionan sin `localhost`.

Los datos (desgaste, mapas, sesiones) se guardan en el `localStorage` del navegador: cada dispositivo tiene los suyos y no pasan de `localhost` a `github.io`. Exporten con frecuencia.

## Cómo abrirlo en local

La cámara y el Arduino solo funcionan desde `localhost` o https:

```
cd lo-que-queda
python3 -m http.server 8000
```

Abran `http://localhost:8000` en Chrome o Edge y den permiso de cámara. La tecla **D** muestra el dock durante la experiencia del visitante. El Arduino (Web Serial) solo funciona en Chrome o Edge de escritorio.

## Flujo del visitante

1. **Inicio**: explica la regla.
2. **Calibración de la mirada** (solo con cámara): nueve puntos, cinco clics en cada uno mirándolo. Después, un punto verde se mira sin hacer clic durante 2,5 s y se calcula la **precisión** en píxeles. Bajo 150 px es aceptable; si no, conviene repetir.
3. **Calibración de la piel**: 20 s de reposo para fijar el umbral personal.
4. **Feed**: las zonas miradas se gastan en tiempo real.
5. **Cierre** e **informe**.

## Cómo se gasta una imagen

La imagen se divide en una grilla de 27 × 48 celdas. Cada lectura de la mirada deja una mancha gaussiana (porque el eye tracking por cámara tiene un error de 100 a 200 px) que suma desgaste en esas celdas. Según su nivel de desgaste, cada celda:

| Desgaste | Efecto |
|---|---|
| 0 a 0,4 | Pixelado creciente (bloques de 1 a 60 px; cada bloque promedia sus colores) |
| 0,2 a 0,5 | Los bloques se funden en manchones de color: imagen reducida a pocos tonos, desenfocada y más saturada |
| 0,75 a 1 | Blanqueo; en 1 la celda queda blanca |

Cuando todas las celdas llegan a 1, la imagen queda completamente blanca. El desgaste se guarda por imagen y se **comparte entre todos los visitantes**: cada persona recibe las imágenes como las dejó la anterior.

Si una imagen no provoca respuesta en la piel, se le suma un desgaste extra proporcional a cuánto se miró cada zona durante esa vista (por defecto, el doble del desgaste normal).

## Fabricación: la visita como figura abstracta y G-code (07 · Fabricación)

Cada visita se materializa como **una sola figura abstracta**, y el G-code (la trayectoria de la boquilla) se genera directamente desde los datos, sin pasar por un slicer. La figura crece con el tiempo de la visita: cada capa es un instante, y su contorno es una curva cerrada alrededor de un centro.

| Dato de la visita | Qué le hace a la figura |
|---|---|
| Posición de la mirada (trayectoria suavizada) | Mueve el centro de la capa: la figura se inclina hacia donde se miró |
| Velocidad de la mirada | Pliegues: una mirada inquieta da más pliegues y más profundos |
| Desgaste de la imagen vista (leído de arriba abajo mientras se la miraba) | Hunde el contorno donde la imagen está gastada |
| Desgaste medio de la imagen | Adelgaza la figura |
| Imagen sin respuesta en la piel | La contrae y la tuerce; la torsión se acumula |
| Respuesta en la piel | La hincha según la amplitud |

Después la forma se suaviza en altura (≈ 1,5 mm) y se limita el voladizo para que se imprima sin soportes: cada punto puede salirse de la capa anterior como máximo `altura de capa × tan(ángulo máximo)`.

**G-code**: para Marlin, en coordenadas absolutas. Calienta la cama y la boquilla, hace home y una línea de purga. Imprime un fondo macizo en anillos concéntricos y luego **una espiral continua de una sola pared** (modo jarrón): la Z sube sin detenerse a lo largo de cada vuelta. La figura se centra en la cama y no se exporta si no cabe.

| Parámetro | Por defecto |
|---|---|
| Intensidad de la deformación | 0,8 (0–1) |
| Cuánto sigue a la mirada | 0,6 (0–1) |
| Alto / radio base | 120 mm / 30 mm |
| Ángulo máximo de voladizo | 50° |
| Capa / boquilla / filamento | 0,2 / 0,4 / 1,75 mm |
| Temperaturas | 210 °C boquilla, 60 °C cama |
| Velocidad | 25 mm/s |
| Cama | 220 × 220 mm |

**Antes de imprimir**, revisa temperaturas, filamento y tamaño de cama para tu impresora, y mira el archivo en la vista previa de G-code del slicer (PrusaSlicer y Cura la tienen). También se exporta la misma forma en **3MF** (formato recomendado: malla indexada, en milímetros, se abre directo en PrusaSlicer, Cura, Bambu Studio u OrcaSlicer) y en **STL**, para verla en un visor o laminarla en modo jarrón con tu propio perfil.

Dónde se descarga:
- **Informe final**: vista previa de la figura de la visita, **Descargar G-code de tu figura**, **Descargar figura 3D (3MF)** y **(STL)**.
- **Panel 07** (tecla D): elegir cualquier visita registrada, ajustar los parámetros, ver la vista previa y exportar G-code, 3MF o STL. Las visitas sin trayectoria (anteriores a que se guardara) salen sin inclinación ni pliegues de mirada.

## Validación y pruebas (02 · Mirada)

| Opción | Para qué sirve |
|---|---|
| Fuente: cámara o mouse | El mouse simula la mirada para probar todo sin cámara |
| Mostrar punto de mirada | "Imprime" en pantalla dónde cree el sistema que estás mirando |
| Mapa de calor en vivo | Superpone sobre la imagen el mapa de la sesión en curso |
| Mostrar cámara | Vista previa de WebGazer con el recuadro de la cara |
| Mostrar lectura en vivo | Señal, umbral, imágenes sin respuesta, coordenadas de la mirada, % de mirada dentro de la imagen y precisión |
| Suavizar mirada (Kalman) | Reduce el temblor del punto estimado |

Para validar el eye tracking: activen el punto de mirada, miren esquinas y objetos concretos de la imagen y comprueben que el punto los sigue. Anoten la precisión de cada calibración; queda guardada en los datos.

## El informe

- **01 Respuesta de tu piel**: una barra por imagen, con el umbral personal y la línea del cierre.
- **02 Mapas de calor**: por cada imagen vista, cuatro paneles: original, tu mirada, mirada acumulada de todos los visitantes y cómo la dejaste. Debajo, los segundos de mirada y la **zona más vista** (en una división de 3 × 3) con su porcentaje. Cada fila se descarga como PNG.
- **03 Desgaste**: cuánto más gastadas quedaron las imágenes.

Botones: descargar todos los mapas en una lámina PNG, exportar los datos de la sesión (incluida la trayectoria de la mirada en cada imagen y la señal completa), exportar la trayectoria de la mirada de la visita (CSV), descargar el G-code, el 3MF y el STL de la figura abstracta de la visita, imprimir el informe, borrar el registro y terminar. Borrar elimina la sesión y su mapa personal; el desgaste de las imágenes se mantiene, y el informe lo dice.

## Datos (06 · Datos)

- **Sesiones (JSON o CSV)**: una fila por imagen vista, con fuente de la mirada, precisión, condición, umbral, motivo de cierre, amplitud de la respuesta, si respondió, permanencia, segundos de mirada dentro y fuera de la imagen y si se aplicó desgaste extra.
- **Trayectorias de la mirada (CSV)**: el recorrido de la mirada, no el mapa: una fila cada 50 ms con sesión, visitante, imagen, tiempo desde el inicio del feed (s) y posición `x, y` en fracción de la imagen (0–1, origen arriba a la izquierda). Una fila con `x, y` vacíos marca que la mirada salió de la imagen. Si el almacenamiento del navegador (~5 MB) se llena, se descartan primero las trayectorias de las sesiones más antiguas.
- **Mapas acumulados**: lámina PNG con la mirada acumulada de todos los visitantes sobre cada imagen del corpus.
- **Reiniciar desgaste y mapas** (05 · Corpus): devuelve todas las imágenes al original y borra la mirada acumulada.

Todo se guarda en el navegador del computador de la exposición. Exporten con frecuencia.

## Simular la piel sin sensor GSR

Igual que antes: el potenciómetro en A0 simula la piel y el encoder avanza el feed. Sin Arduino, usen el control deslizante de **03 · Señal** o la tecla **R**. Registren qué protocolo usaron (Mago de Oz o autorreporte).

## Limitaciones que hay que declarar

- WebGazer estima la mirada con una cámara web común. Es suficiente para zonas amplias de la imagen, no para detalles finos. Por eso el desgaste y los mapas trabajan con manchas de unos 50 px de radio (ajustable en 04 · Parámetros).
- La precisión empeora si la persona mueve la cabeza o cambia la luz. Mantengan una distancia y una iluminación constantes, y recalibren por cada visitante.
- El desgaste es procesamiento de imagen (pixelado, mezcla de color en manchones y blanqueo), no IA generativa. Es una decisión de prototipo que conviene explicitar en la tesis.

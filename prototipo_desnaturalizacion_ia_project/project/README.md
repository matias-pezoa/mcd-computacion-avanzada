# Proyecto final — Desnaturalización IA (prototipo de baja resolución)

Sistema conectado que traduce una señal biométrica en distorsión de imagen en tiempo real, vía MQTT. Ver el brief completo en `Prototipo_baja_resolucion_Desnaturalizacion_IA.docx` (carpeta de Taller de Prototipos) para el contexto de tesis, la hipótesis y el sistema de testing.

## Arquitectura

```
ESP32 (ADXL345 + TCS34725 + potenciómetro) --- MQTT (publish) ---> BROKER --MQTT (subscribe)--> web/ (Canvas)
                                                                                                    │
                                                              main.js decide la distorsión por sensor
```

El ESP32 se conecta **directamente al broker por WiFi**: no hace falta puente Node ni puerto serie durante una sesión. Cada sensor se publica como un campo independiente; la regla de qué distorsión aplicar vive del lado de la web (`main.js`), no en el instrumento.

- **arduino/instrumento_esp32_multisensor/** — sketch activo (el que consume `web/main.js`): acelerómetro ADXL345 (inclinación + cambio brusco), sensor de color TCS34725 (filtro de color) y potenciómetro/SoftPot (dial de amplitud), más una pantalla GC9A01A que muestra los 3 valores en vivo. Credenciales en `secrets.h` (copiado de `secrets_example.h`, ignorado por git).
- **arduino/instrumento_esp32/** — versión anterior de un solo sensor (`intensidad`/`pico` fusionados). Se mantiene como referencia; `web/main.js` ya no lee ese esquema.
- **arduino/pulso_sensor.ino** — versión antigua para Arduino Uno: solo imprime `{"valor":N}` por Serial a ~10 Hz y depende de `bridge/`.
- **bridge/** — puente Node.js opcional para el Arduino Uno (esquema `intensidad`/`pico`): lee el puerto serie y publica por MQTT, o genera una señal sintética con `simulate.js`. No aplica al sketch multisensor, que publica directo.
- **web/** — página de pantalla única que se suscribe al topic MQTT y aplica la distorsión sobre un video (cámara o archivo) a pantalla completa: ruido proporcional a la inclinación, fragmentación en el instante de un cambio brusco, filtro de color superpuesto según el sensor de color, y un dial (potenciómetro) que escala la amplitud de todo lo anterior. El botón "Modo demostración" simula los 3 sensores en el navegador, sin broker. Incluye además una herramienta de captura: graba 30 s de video (con los datos horneados en el frame) y arma al terminar una línea de tiempo de cómo evolucionó cada sensor, todo descargable.

## Esquema del mensaje MQTT

Topic: `proyecto/2026/desnaturalizacion-ia/instrumento/<clientId>/estado`

```json
{
  "clientId": "instrumento-esp32-01",
  "timestamp": 1788381833339,
  "accelY": -3.24,
  "inclinacion": 42.1,
  "cambioBrusco": false,
  "colorR": 182, "colorG": 40, "colorB": 33,
  "colorHex": "#B62821",
  "colorDominante": "rojo",
  "controlValor": 63.0
}
```

Traducción, aplicada en `web/main.js` (sección "04 — REGLAS"):

| Campo | Sensor | Efecto en la web |
|---|---|---|
| `inclinacion` (-90 a 90°) | ADXL345, eje Y | ruido/grano proporcional a `\|inclinacion\|` |
| `cambioBrusco` | ADXL345, salto entre lecturas | fragmentación y recomposición del frame |
| `controlValor` (0-100) | Potenciómetro / SoftPot | dial manual: escala el ruido y el filtro de color |
| `colorHex` / `colorDominante` | TCS34725 | filtro de color superpuesto sobre el video |

## Cómo correrlo

### 1 · Broker MQTT

Usa el broker propio de EMQX Cloud (ver Anexo MQTT del curso Computación Avanzada) o cualquier broker con soporte WSS para el navegador y MQTT/TLS para el puente Node.

### 2 · Instrumento — ESP32 multisensor directo al broker (camino principal)

1. Instala el paquete de placas **esp32** (Espressif) y, desde el Library Manager de Arduino IDE: **PubSubClient** (Nick O'Leary), **Adafruit GFX Library**, **Adafruit GC9A01A**, **Adafruit Unified Sensor**, **Adafruit ADXL345** y **Adafruit TCS34725**.
2. En `arduino/instrumento_esp32_multisensor/`, copia `secrets_example.h` a `secrets.h` y completa: SSID/clave WiFi, `MQTT_HOST` (solo el dominio, sin `mqtts://`), `MQTT_PORT` (8883 para TLS en la nube, 1883 para un Mosquitto local), usuario, contraseña y `CLIENT_ID`.
3. Cablea (ver cabecera del `.ino` para el detalle):
   - Potenciómetro/SoftPot: wiper → **GPIO34** (ADC1; no uses pines ADC2, chocan con el WiFi), extremos → 3V3 y GND.
   - ADXL345 + TCS34725 comparten el bus I2C: SDA → **GPIO21**, SCL → **GPIO22**, VCC → 3V3, GND → GND en ambos.
   - Pantalla redonda GC9A01A (1.28" SPI): SCK→18, MOSI→23, CS→5, DC→17, RST→16, VCC→3V3, GND→GND.
4. Sube el sketch. El monitor serie (115200 baud) muestra la conexión y cada lectura (`accelY / inc / brusco / color / pot`); la pantalla redonda muestra los 3 sensores en vivo con un punto verde cuando el MQTT está conectado.

`secrets.h` está en `.gitignore`: las credenciales no se suben al repositorio. El ESP32 publica en `proyecto/2026/desnaturalizacion-ia/instrumento/<CLIENT_ID>/estado` — el mismo topic que escucha la web. (`arduino/instrumento_esp32/` sigue disponible como versión mínima de un solo sensor, sin pantalla ni I2C, si se prefiere partir de ahí.)

### 2b · Puente Node (alternativo: Arduino Uno sin WiFi, o señal simulada)

```bash
cd bridge
npm install

# Sin hardware — señal simulada, para probar todo el flujo:
MQTT_URL=mqtts://TU-HOST:8883 MQTT_USER=usuario MQTT_PASS=clave npm run simulate

# Con Arduino Uno conectado (primero sin SERIAL_PORT para listar puertos disponibles):
node bridge.js
SERIAL_PORT=/dev/tty.usbmodemXXXX MQTT_URL=mqtts://TU-HOST:8883 MQTT_USER=usuario MQTT_PASS=clave npm run bridge
```

No se escriben credenciales en el código: se pasan como variables de entorno en cada ejecución (ver `bridge/config.js`).

### 3 · Página web (web/)

Abre `web/index.html` con Live Server (o publícala en GitHub Pages). Es una pantalla única: el video ocupa toda la ventana y los controles viven en menús desplegables (esquina superior derecha) más dos ventanas flotantes (arrastrables y redimensionables, como ventanas de escritorio):

- **01 · Conexión** (menú) — host, puerto WSS (8084), usuario y contraseña del broker.
- **02 · Fuente** (menú) — cámara, archivo de video, o **"Modo demostración"** (simula los 3 sensores en el navegador, sin broker ni hardware).
- **03 · Señal** (ventana, arriba-izq.) — la forma abstracta (metaballs) y los datos crudos de cada sensor.
- **04 · Registro** (menú) — log de la sesión.
- **05 · Captura** (ventana, abajo-der.) — graba 30 s del video ya distorsionado (con un HUD de datos horneado en el frame) y, al terminar, dibuja una línea de tiempo (ruido / inclinación / control / color) de cómo evolucionó la señal. Descarga el `.webm` y/o las muestras en `.json`. Requiere un navegador con `canvas.captureStream` + `MediaRecorder` (Chrome/Edge/Firefox recientes).

## Estado de verificación

- El flujo `simulate.js → broker → suscriptor` fue probado end-to-end con un broker MQTT local (ver historial de desarrollo en `AI_USAGE.md`): el esquema del mensaje y la detección de picos funcionan como se describe arriba.
- La página web fue probada con Playwright, con un video de prueba: el modo demostración produce ruido proporcional a la intensidad y fragmentación visible del frame en cada pico, sin errores de consola.
- **Pendiente de probar con hardware real:** `arduino/instrumento_esp32_multisensor/` (ADXL345 + TCS34725 + potenciómetro + pantalla GC9A01A, WiFi + MQTT directo) — el esquema del mensaje y la regla de distorsión en `web/main.js` están integrados y listos, pero no se ha corrido contra el hardware físico ni calibrado `UMBRAL_CAMBIO_BRUSCO`/los `ALPHA` de suavizado del `.ino`. Antes de la sesión de testing: subir el sketch, abrir el monitor serie (115200 baud) y confirmar que aparece `[wifi] conectado`, `[mqtt] conectado` y luego líneas `accelY/inc/brusco/color/pot` estables (usar la pantalla para verificar visualmente los 3 sensores); recién entonces abrir la web y conectar al broker. `arduino/instrumento_esp32/` (un sensor) y `arduino/pulso_sensor.ino` + `bridge/bridge.js` (Arduino Uno) quedan como caminos alternativos, ya probados en su propio esquema `intensidad`/`pico`.
- **Pendiente de probar con un broker real (EMQX Cloud):** el diseño replica exactamente el patrón del Anexo MQTT del curso (mismo puerto WSS 8084, misma librería MQTT.js, mismo formato de conexión), pero no se ha probado contra una cuenta EMQX real desde este entorno.

## Relación con Taller de Prototipos

Este mismo código es la mitad computacional del prototipo de baja resolución descrito en el brief del taller. La bitácora del taller debe registrar, además, el armado físico del instrumento (circuito, fotos, dificultades) y los resultados del testing con 1–2 personas.

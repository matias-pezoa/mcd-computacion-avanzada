# Proyecto final — Desnaturalización IA (prototipo de baja resolución)

Sistema conectado que traduce una señal biométrica en distorsión de imagen en tiempo real, vía MQTT. Ver el brief completo en `Prototipo_baja_resolucion_Desnaturalizacion_IA.docx` (carpeta de Taller de Prototipos) para el contexto de tesis, la hipótesis y el sistema de testing.

## Arquitectura

```
ESP32 (pulso/slider) --------------- MQTT (publish) --------------> BROKER --MQTT (subscribe)--> web/ (Canvas)
       │                                                                                            │
  regla intensidad/pico (misma lógica en C++, JS bridge y JS cliente) ────────────────────────> main.js (reglas cliente)
```

El ESP32 se conecta **directamente al broker por WiFi**: no hace falta puente Node ni puerto serie durante una sesión. El puente (`bridge/`) queda como camino alternativo para un Arduino Uno sin WiFi y para la señal simulada.

- **arduino/instrumento_esp32/** — sketch principal: el ESP32 se conecta a WiFi y al broker MQTT, aplica la regla `intensidad/pico` (port C++ de `bridge/reglas.js`) y publica el mismo mensaje que consume la web. Credenciales en `secrets.h` (copiado de `secrets_example.h`, ignorado por git).
- **arduino/pulso_sensor.ino** — versión antigua para Arduino Uno: solo imprime `{"valor":N}` por Serial a ~10 Hz y depende de `bridge/`.
- **bridge/** — puente Node.js opcional: lee el puerto serie del Uno y publica por MQTT. Incluye `simulate.js`, que genera una señal sintética con el mismo esquema para probar el sistema sin hardware.
- **bridge/reglas.js** — traduce el valor crudo en `{ intensidad, pico }` respecto de una línea base individual que se adapta lentamente. Es la misma regla en la que se apoya `main.js` del lado del navegador y el sketch del ESP32.
- **web/** — página que se suscribe al topic MQTT y aplica la distorsión sobre un video (cámara o archivo): ruido/grano proporcional a `intensidad`, fragmentación del frame en el instante de un `pico`.

## Esquema del mensaje MQTT

Topic: `proyecto/2026/desnaturalizacion-ia/instrumento/<clientId>/estado`

```json
{
  "clientId": "instrumento-a1b2c3",
  "intensidad": 42.3,
  "pico": false,
  "timestamp": 1788381833339
}
```

## Cómo correrlo

### 1 · Broker MQTT

Usa el broker propio de EMQX Cloud (ver Anexo MQTT del curso Computación Avanzada) o cualquier broker con soporte WSS para el navegador y MQTT/TLS para el puente Node.

### 2 · Instrumento — ESP32 directo al broker (camino principal)

1. Instala el paquete de placas **esp32** (Espressif) y la librería **PubSubClient** (Nick O'Leary) desde el Library Manager de Arduino IDE.
2. En `arduino/instrumento_esp32/`, copia `secrets_example.h` a `secrets.h` y completa: SSID/clave WiFi, `MQTT_HOST` (solo el dominio, sin `mqtts://`), `MQTT_PORT` (8883 para TLS en la nube, 1883 para un Mosquitto local), usuario, contraseña y `CLIENT_ID`.
3. Conecta la señal analógica a **GPIO34** (VCC a 3V3, GND a GND). GPIO34 es ADC1: no uses pines ADC2, chocan con el WiFi.
4. Sube el sketch. El monitor serie (115200 baud) muestra la conexión y cada lectura (`valor / intensidad / pico`).

`secrets.h` está en `.gitignore`: las credenciales no se suben al repositorio. El ESP32 publica en `proyecto/2026/desnaturalizacion-ia/instrumento/<CLIENT_ID>/estado` — el mismo topic que escucha la web.

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

Abre `web/index.html` con Live Server (o publícala en GitHub Pages). En el panel "1 · Conexión al broker" ingresa host, puerto WSS (8084), usuario y contraseña, y presiona Conectar. Elige cámara o un video de prueba en el panel "2 · Fuente de video".

Si aún no tienes broker/hardware configurado, el botón **"Modo demostración (sin broker)"** simula la señal directamente en el navegador — sirve para calibrar y mostrar las reglas de distorsión de forma aislada.

## Estado de verificación

- El flujo `simulate.js → broker → suscriptor` fue probado end-to-end con un broker MQTT local (ver historial de desarrollo en `AI_USAGE.md`): el esquema del mensaje y la detección de picos funcionan como se describe arriba.
- La página web fue probada con Playwright, con un video de prueba: el modo demostración produce ruido proporcional a la intensidad y fragmentación visible del frame en cada pico, sin errores de consola.
- **Pendiente de probar con hardware real:** `arduino/instrumento_esp32/` (WiFi + MQTT directo) y el camino alternativo `arduino/pulso_sensor.ino` + `bridge/bridge.js` (puerto serie) — se diseñaron siguiendo el mismo contrato de datos ya validado, pero no se han corrido contra un ESP32/Arduino físico. Antes de la sesión de testing: subir el sketch del ESP32, abrir el monitor serie (115200 baud) y confirmar que aparece `[wifi] conectado`, `[mqtt] conectado` y luego líneas `valor / intensidad / pico` estables; recién entonces abrir la web y conectar al broker.
- **Pendiente de probar con un broker real (EMQX Cloud):** el diseño replica exactamente el patrón del Anexo MQTT del curso (mismo puerto WSS 8084, misma librería MQTT.js, mismo formato de conexión), pero no se ha probado contra una cuenta EMQX real desde este entorno.

## Relación con Taller de Prototipos

Este mismo código es la mitad computacional del prototipo de baja resolución descrito en el brief del taller. La bitácora del taller debe registrar, además, el armado físico del instrumento (circuito, fotos, dificultades) y los resultados del testing con 1–2 personas.

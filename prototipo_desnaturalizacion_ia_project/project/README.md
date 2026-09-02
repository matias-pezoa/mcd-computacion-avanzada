# Proyecto final — Desnaturalización IA (prototipo de baja resolución)

Sistema conectado que traduce una señal biométrica en distorsión de imagen en tiempo real, vía MQTT. Ver el brief completo en `Prototipo_baja_resolucion_Desnaturalizacion_IA.docx` (carpeta de Taller de Prototipos) para el contexto de tesis, la hipótesis y el sistema de testing.

## Arquitectura

```
ARDUINO (pulso/slider) --serial--> bridge.js --MQTT (publish)--> BROKER --MQTT (subscribe)--> web/ (Three.js/Canvas)
                                       |                                                            |
                                  reglas.js  <---------- misma lógica ---------->              main.js (reglas cliente)
```

- **arduino/pulso_sensor.ino** — lee un pin analógico (potenciómetro en modo Wizard of Oz, o sensor de pulso real) e imprime `{"valor":N}` por Serial a ~10 Hz.
- **bridge/** — puente Node.js: lee el puerto serie y publica por MQTT. También incluye `simulate.js`, que genera una señal sintética con el mismo esquema, para probar todo el sistema sin hardware.
- **bridge/reglas.js** — traduce el valor crudo en `{ intensidad, pico }` respecto de una línea base individual que se adapta lentamente. Es la misma regla en la que se apoya `main.js` del lado del navegador para decidir la distorsión.
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

### 2 · Puente (bridge/)

```bash
cd bridge
npm install

# Sin hardware — señal simulada, para probar todo el flujo:
MQTT_URL=mqtts://TU-HOST:8883 MQTT_USER=usuario MQTT_PASS=clave npm run simulate

# Con Arduino conectado (primero sin SERIAL_PORT para listar puertos disponibles):
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
- **Pendiente de probar con hardware real:** `arduino/pulso_sensor.ino` y `bridge/bridge.js` (lectura de puerto serie) — se diseñaron siguiendo el mismo contrato de datos ya validado, pero no se han corrido contra un Arduino físico. Antes de la sesión de testing, conectar el Arduino, correr `node bridge.js` sin `SERIAL_PORT` para confirmar el puerto, y verificar en el monitor serie de Arduino IDE que las líneas `{"valor":N}` llegan de forma estable antes de sumar MQTT.
- **Pendiente de probar con un broker real (EMQX Cloud):** el diseño replica exactamente el patrón del Anexo MQTT del curso (mismo puerto WSS 8084, misma librería MQTT.js, mismo formato de conexión), pero no se ha probado contra una cuenta EMQX real desde este entorno.

## Relación con Taller de Prototipos

Este mismo código es la mitad computacional del prototipo de baja resolución descrito en el brief del taller. La bitácora del taller debe registrar, además, el armado físico del instrumento (circuito, fotos, dificultades) y los resultados del testing con 1–2 personas.

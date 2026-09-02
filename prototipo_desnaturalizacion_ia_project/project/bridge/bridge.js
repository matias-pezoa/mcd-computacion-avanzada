/**
 * bridge.js
 * ---------------------------------------------------------------
 * Lee la línea serie que imprime el Arduino (ver arduino/pulso_sensor.ino)
 * y publica cada lectura por MQTT, aplicando la misma regla de
 * intensidad/pico que simulate.js (definida en reglas.js).
 *
 * El Arduino debe imprimir una línea JSON por lectura, por ejemplo:
 *   {"valor":517}
 *
 * Uso:
 *   SERIAL_PORT=/dev/tty.usbmodem14101 MQTT_URL=mqtts://TU-HOST:8883 \
 *   MQTT_USER=usuario MQTT_PASS=clave node bridge.js
 *
 * Si no defines SERIAL_PORT, el script lista los puertos disponibles
 * y termina, para que puedas elegir el correcto.
 */

const mqtt = require("mqtt");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const config = require("./config");
const { crearDetector } = require("./reglas");

async function main() {
  if (!config.serialPort) {
    console.log("No se definió SERIAL_PORT. Puertos disponibles:\n");
    try {
      const puertos = await SerialPort.list();
      if (puertos.length === 0) {
        console.log("  (ninguno detectado — revisa que el Arduino esté conectado)");
      } else {
        puertos.forEach((p) => console.log(`  ${p.path}  ${p.manufacturer || ""}`));
      }
    } catch (err) {
      console.log("  No se pudo listar automáticamente (" + err.message + ").");
      console.log("  En Windows revisa el Administrador de dispositivos → Puertos (COM y LPT).");
      console.log("  En macOS/Linux revisa la salida de 'ls /dev/tty.*' o 'ls /dev/ttyUSB*' '/dev/ttyACM*'.");
    }
    console.log("\nVuelve a ejecutar con SERIAL_PORT=<puerto> node bridge.js");
    process.exit(1);
  }

  const detectar = crearDetector();
  const topic = `${config.topicBase}/${config.clientId}/estado`;

  console.log(`[bridge] conectando a MQTT: ${config.mqttUrl}`);
  const client = mqtt.connect(config.mqttUrl, {
    clientId: config.clientId,
    username: config.mqttUser,
    password: config.mqttPass,
    reconnectPeriod: 4000,
  });

  client.on("connect", () => console.log(`[bridge] MQTT conectado. Publicando en: ${topic}`));
  client.on("error", (err) => console.error("[bridge] error MQTT:", err.message));

  console.log(`[bridge] abriendo puerto serie: ${config.serialPort} @ ${config.baudRate} baud`);
  const puerto = new SerialPort({ path: config.serialPort, baudRate: config.baudRate });
  const parser = puerto.pipe(new ReadlineParser({ delimiter: "\n" }));

  puerto.on("error", (err) => console.error("[bridge] error de puerto serie:", err.message));

  parser.on("data", (linea) => {
    const valorCrudo = extraerValor(linea);
    if (valorCrudo === null) return; // ignora líneas de arranque/ruido del Arduino

    const { intensidad, pico } = detectar(valorCrudo);
    const payload = {
      clientId: config.clientId,
      intensidad: Number(intensidad.toFixed(1)),
      pico,
      timestamp: Date.now(),
    };

    if (client.connected) client.publish(topic, JSON.stringify(payload));
    console.log(
      `valor=${String(valorCrudo).padStart(4)} intensidad=${payload.intensidad.toFixed(0).padStart(3)} pico=${pico ? "SÍ" : "no"}`
    );
  });
}

/** Acepta tanto {"valor": 517} como un número plano por línea. */
function extraerValor(linea) {
  const texto = linea.trim();
  if (!texto) return null;
  try {
    const json = JSON.parse(texto);
    if (typeof json.valor === "number") return json.valor;
  } catch (_) {
    const n = Number(texto);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

main().catch((err) => {
  console.error("[bridge] error fatal:", err.message);
  process.exit(1);
});

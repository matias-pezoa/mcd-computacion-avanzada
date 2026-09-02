/**
 * simulate.js
 * ---------------------------------------------------------------
 * Genera una señal biométrica sintética (sin Arduino) y la publica
 * por MQTT con el mismo esquema que usará el instrumento real.
 * Sirve para: (a) probar el sistema de distorsión de punta a punta
 * antes de tener el hardware armado, y (b) como modo Wizard of Oz
 * si se prefiere operar la señal manualmente durante una sesión
 * (ver variable MANUAL más abajo).
 *
 * Uso:
 *   MQTT_URL=mqtts://TU-HOST:8883 MQTT_USER=usuario MQTT_PASS=clave node simulate.js
 */

const mqtt = require("mqtt");
const config = require("./config");
const { crearDetector } = require("./reglas");

const detectar = crearDetector();
const topic = `${config.topicBase}/${config.clientId}/estado`;

console.log(`[simulate] conectando a ${config.mqttUrl} …`);
const client = mqtt.connect(config.mqttUrl, {
  clientId: config.clientId,
  username: config.mqttUser,
  password: config.mqttPass,
  reconnectPeriod: 4000,
});

client.on("connect", () => {
  console.log(`[simulate] conectado. Publicando en: ${topic}`);
  iniciarSenalSintetica();
});

client.on("error", (err) => console.error("[simulate] error MQTT:", err.message));
client.on("reconnect", () => console.log("[simulate] reconectando…"));

function iniciarSenalSintetica() {
  let valor = 512; // punto medio de un analogRead de 10 bits (0-1023)
  let t = 0;

  setInterval(() => {
    t += 0.15;
    // deriva lenta + ruido + picos ocasionales, simulando una señal de pulso
    const deriva = Math.sin(t) * 8;
    const ruido = (Math.random() - 0.5) * 10;
    const hayPicoForzado = Math.random() < 0.03;
    const salto = hayPicoForzado ? (Math.random() - 0.5) * 260 : 0;

    valor = Math.max(0, Math.min(1023, valor + deriva * 0.05 + ruido + salto));

    const { intensidad, pico } = detectar(valor);

    const payload = {
      clientId: config.clientId,
      intensidad: Number(intensidad.toFixed(1)),
      pico,
      timestamp: Date.now(),
    };

    client.publish(topic, JSON.stringify(payload));
    process.stdout.write(
      `valor=${valor.toFixed(0).padStart(4)} intensidad=${payload.intensidad.toFixed(0).padStart(3)} pico=${pico ? "SÍ" : "no"}\n`
    );
  }, 100); // ~10 Hz, igual que la frecuencia de muestreo sugerida para el Arduino
}

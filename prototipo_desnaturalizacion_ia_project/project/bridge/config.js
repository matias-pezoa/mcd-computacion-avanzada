/**
 * config.js
 * ---------------------------------------------------------------
 * Configuración leída desde variables de entorno. No hardcodear
 * host/usuario/contraseña del broker en el código (ver Anexo MQTT
 * del curso): pásalos como variables de entorno al ejecutar.
 *
 * Ejemplo (macOS/Linux):
 *   MQTT_URL=mqtts://TU-HOST:8883 MQTT_USER=usuario MQTT_PASS=clave npm run simulate
 *
 * Ejemplo (Windows PowerShell):
 *   $env:MQTT_URL="mqtts://TU-HOST:8883"; $env:MQTT_USER="usuario"; $env:MQTT_PASS="clave"; npm run simulate
 */

module.exports = {
  mqttUrl: process.env.MQTT_URL || "mqtt://localhost:1883",
  mqttUser: process.env.MQTT_USER || undefined,
  mqttPass: process.env.MQTT_PASS || undefined,
  topicBase: process.env.MQTT_TOPIC || "proyecto/2026/desnaturalizacion-ia/instrumento",
  clientId: process.env.MQTT_CLIENT_ID || ("instrumento-" + Math.random().toString(16).slice(2, 8)),
  serialPort: process.env.SERIAL_PORT || null, // ej. "COM5" o "/dev/tty.usbmodem14101"
  baudRate: Number(process.env.BAUD_RATE || 9600),
};

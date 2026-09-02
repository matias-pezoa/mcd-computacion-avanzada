/*
 * pulso_sensor.ino
 * -----------------------------------------------------------------
 * Instrumento biométrico de baja resolución — proyecto "Desnaturalización IA"
 *
 * Lee una señal analógica y la imprime por Serial, una lectura por línea,
 * como JSON: {"valor":517}
 *
 * bridge.js (en ../bridge/) lee esta salida y la publica por MQTT.
 *
 * MODO_ENTRADA:
 *   POTENCIOMETRO  -> modo Wizard of Oz: un potenciómetro o slider físico
 *                     conectado a A0 simula la señal biométrica. Es el punto
 *                     de partida recomendado para este prototipo de baja
 *                     resolución: valida la cadena completa sin depender
 *                     todavía de un sensor fisiológico real.
 *   SENSOR_PULSO   -> sensor de pulso genérico (ej. módulo tipo XD-58C /
 *                     KY-039) conectado a A0. Salida analógica cruda, sin
 *                     procesamiento de la forma de onda: para este nivel de
 *                     resolución basta con capturar la variación relativa.
 *
 * Conexión (ambos modos usan el mismo pin analógico):
 *   Señal -> A0
 *   VCC   -> 5V
 *   GND   -> GND
 */

#define MODO_ENTRADA POTENCIOMETRO // cambiar a SENSOR_PULSO si se usa el sensor real
#define POTENCIOMETRO 0
#define SENSOR_PULSO 1

const int PIN_ENTRADA = A0;
const unsigned long INTERVALO_MS = 100; // ~10 Hz, igual que bridge.js/simulate.js

unsigned long ultimaLectura = 0;

void setup() {
  Serial.begin(9600);
  // Pequeña pausa para que el puerto serie esté listo antes de la primera lectura.
  delay(300);
}

void loop() {
  unsigned long ahora = millis();
  if (ahora - ultimaLectura < INTERVALO_MS) return;
  ultimaLectura = ahora;

  int valor = analogRead(PIN_ENTRADA); // 0-1023

  Serial.print("{\"valor\":");
  Serial.print(valor);
  Serial.println("}");
}

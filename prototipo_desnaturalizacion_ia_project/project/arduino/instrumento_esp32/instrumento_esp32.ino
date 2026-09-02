/*
 * instrumento_esp32.ino
 * -----------------------------------------------------------------
 * Instrumento biométrico de baja resolución — proyecto "Desnaturalización IA"
 *
 * Esta versión se conecta DIRECTAMENTE al broker MQTT por WiFi.
 * Ya NO hace falta el puente Node (bridge/) ni el puerto serie: el
 * ESP32 aplica la misma regla intensidad/pico que antes vivía en
 * bridge/reglas.js y publica el mismo mensaje que consume la web.
 *
 *   ARDUINO/bridge  (viejo):  ESP32 --serial--> bridge.js --MQTT--> broker --> web
 *   ESTE SKETCH     (nuevo):  ESP32 --------------- MQTT ---------> broker --> web
 *
 * Topic que publica:
 *   proyecto/2026/desnaturalizacion-ia/instrumento/<CLIENT_ID>/estado
 *
 * Payload (idéntico al de simulate.js / bridge.js):
 *   {"clientId":"instrumento-esp32-01","intensidad":42.3,"pico":false,"timestamp":123456}
 *
 * La web (web/index.html) NO necesita cambios: su topic por defecto
 * termina en ".../instrumento/+/estado" y el "+" ya matchea el CLIENT_ID.
 *
 * -----------------------------------------------------------------
 * REQUISITOS
 *   Placa:      ESP32 (paquete "esp32" de Espressif en el Boards Manager)
 *   Librería:   PubSubClient (Nick O'Leary)  — Library Manager
 *
 * CONFIGURACIÓN
 *   Copia  secrets_example.h  ->  secrets.h  y completa tus datos.
 *   secrets.h está en .gitignore: las credenciales no se suben al repo
 *   (mismo criterio que bridge/config.js y el Anexo MQTT del curso).
 *
 * CONEXIÓN DEL SENSOR (potenciómetro en modo Wizard of Oz, o sensor de pulso)
 *   Señal -> GPIO34   (ADC1, solo entrada; NO usar pines ADC2: chocan con el WiFi)
 *   VCC   -> 3V3
 *   GND   -> GND
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "secrets.h"

/* ----------------------------------------------------------------- */
/* Entrada analógica                                                  */
/* ----------------------------------------------------------------- */

const int PIN_ENTRADA = 34;            // ADC1_CH6 — seguro con WiFi activo
const unsigned long INTERVALO_MS = 100; // ~10 Hz, igual que bridge.js/simulate.js

unsigned long ultimaLectura = 0;

/* ----------------------------------------------------------------- */
/* Regla intensidad/pico — port C++ de bridge/reglas.js               */
/*                                                                    */
/* intensidad (0-100): magnitud de la variación respecto de una       */
/*                     línea base individual que se adapta lento.      */
/* pico (bool):        salto brusco ENTRE LECTURAS CONSECUTIVAS        */
/*                     (se dispara en el instante del pico, no queda   */
/*                     sostenido mientras la línea base se pone al día).*/
/* ----------------------------------------------------------------- */

const float ALPHA_BASELINE       = 0.12f; // qué tan rápido se adapta la línea base
const float ESCALA               = 1.3f;  // distancia a la línea base -> 0-100
const float PICO_UMBRAL_INSTANTE  = 45.0f; // salto mínimo entre lecturas para "pico"

float baseline = NAN;
float anterior = NAN;

struct Lectura {
  float intensidad;
  bool  pico;
};

Lectura detectar(float valorCrudo) {
  if (isnan(baseline)) {
    baseline = valorCrudo;
    anterior = valorCrudo;
  }

  float deltaBaseline = valorCrudo - baseline;
  float deltaInstante = valorCrudo - anterior;
  float magnitud      = fabs(deltaBaseline);

  // la línea base se adapta lentamente hacia el valor actual
  baseline += ALPHA_BASELINE * deltaBaseline;
  anterior  = valorCrudo;

  Lectura r;
  r.intensidad = constrain(magnitud * ESCALA, 0.0f, 100.0f);
  r.pico       = fabs(deltaInstante) > PICO_UMBRAL_INSTANTE;
  return r;
}

/* ----------------------------------------------------------------- */
/* WiFi + MQTT                                                        */
/* ----------------------------------------------------------------- */

#if MQTT_PORT == 8883
  WiFiClientSecure net;   // MQTT sobre TLS (EMQX Serverless, HiveMQ Cloud, etc.)
#else
  WiFiClient net;         // MQTT plano (broker local sin TLS)
#endif
PubSubClient mqtt(net);

char topicEstado[128];

void conectarWiFi() {
  Serial.printf("[wifi] conectando a %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.printf("\n[wifi] conectado. IP: %s\n", WiFi.localIP().toString().c_str());
}

void conectarMQTT() {
  while (!mqtt.connected()) {
    Serial.printf("[mqtt] conectando a %s:%d …\n", MQTT_HOST, MQTT_PORT);
    bool ok = mqtt.connect(CLIENT_ID, MQTT_USER, MQTT_PASS);
    if (ok) {
      Serial.printf("[mqtt] conectado. Publicando en: %s\n", topicEstado);
    } else {
      Serial.printf("[mqtt] falló (rc=%d). Reintento en 4 s…\n", mqtt.state());
      delay(4000);
    }
  }
}

/* ----------------------------------------------------------------- */

void setup() {
  Serial.begin(115200);
  delay(300);

  analogReadResolution(10);                 // 0-1023, igual que el analogRead de un Uno
  analogSetPinAttenuation(PIN_ENTRADA, ADC_11db); // rango de entrada ~0-3.3 V

  snprintf(topicEstado, sizeof(topicEstado),
           "proyecto/2026/desnaturalizacion-ia/instrumento/%s/estado", CLIENT_ID);

  conectarWiFi();

#if MQTT_PORT == 8883
  #if defined(MQTT_VALIDATE_CERT) && MQTT_VALIDATE_CERT
    net.setCACert(MQTT_CA_CERT);
  #else
    net.setInsecure(); // prototipo: no valida el certificado del broker
  #endif
#endif

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setKeepAlive(30);
  conectarMQTT();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) conectarWiFi();
  if (!mqtt.connected()) conectarMQTT();
  mqtt.loop();

  unsigned long ahora = millis();
  if (ahora - ultimaLectura < INTERVALO_MS) return;
  ultimaLectura = ahora;

  int valorCrudo = analogRead(PIN_ENTRADA); // 0-1023
  Lectura l = detectar((float) valorCrudo);

  char payload[192];
  snprintf(payload, sizeof(payload),
           "{\"clientId\":\"%s\",\"intensidad\":%.1f,\"pico\":%s,\"timestamp\":%lu}",
           CLIENT_ID, l.intensidad, l.pico ? "true" : "false", (unsigned long) millis());

  mqtt.publish(topicEstado, payload);

  Serial.printf("valor=%4d intensidad=%3.0f pico=%s\n",
                valorCrudo, l.intensidad, l.pico ? "SI" : "no");
}

// Lo que queda — entrada física del prototipo
//
// Potenciómetro en A0: simula la conductancia de la piel (GSR).
//   Más adelante, el sensor Grove GSR se conecta al mismo pin A0
//   y el código no cambia (solo puede hacer falta "Invertir señal" en el panel).
// Encoder KY-040: girar avanza el feed; el botón empieza la sesión
//   o pasa a la pantalla siguiente.
//
// Mensajes por serial (115200 baudios), uno por línea:
//   G,<0-1023>   valor de la señal, 25 veces por segundo
//   E,1 / E,-1   un paso del encoder (horario / antihorario)
//   B            botón presionado

const int PIN_GSR = A0;
const int PIN_CLK = 2;
const int PIN_DT  = 3;
const int PIN_SW  = 4;

const unsigned long INTERVALO_SENAL_MS = 40;   // 25 Hz
const unsigned long ANTIRREBOTE_BOTON_MS = 250;

int ultimoClk;
int ultimoSw = HIGH;
unsigned long ultimaMuestra = 0;
unsigned long ultimoBoton = 0;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_CLK, INPUT_PULLUP);
  pinMode(PIN_DT, INPUT_PULLUP);
  pinMode(PIN_SW, INPUT_PULLUP);
  ultimoClk = digitalRead(PIN_CLK);
}

void loop() {
  // Encoder: se lee en cada flanco de bajada de CLK.
  // Si gira al revés de lo esperado, intercambia los cables de CLK y DT.
  int clk = digitalRead(PIN_CLK);
  if (clk != ultimoClk && clk == LOW) {
    if (digitalRead(PIN_DT) != clk) Serial.println("E,1");
    else Serial.println("E,-1");
  }
  ultimoClk = clk;

  // Botón del encoder, con antirrebote simple.
  int sw = digitalRead(PIN_SW);
  if (sw == LOW && ultimoSw == HIGH && millis() - ultimoBoton > ANTIRREBOTE_BOTON_MS) {
    Serial.println("B");
    ultimoBoton = millis();
  }
  ultimoSw = sw;

  // Señal: promedio de 8 lecturas para suavizar el ruido.
  if (millis() - ultimaMuestra >= INTERVALO_SENAL_MS) {
    ultimaMuestra = millis();
    long suma = 0;
    for (int i = 0; i < 8; i++) suma += analogRead(PIN_GSR);
    Serial.print("G,");
    Serial.println(suma / 8);
  }
}

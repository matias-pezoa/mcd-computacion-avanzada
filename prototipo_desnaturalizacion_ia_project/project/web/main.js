/* ============================================================
   Desnaturalización IA — prototipo de baja resolución
   Sistema de distorsión: MQTT (entrada) -> reglas -> canvas (salida)

   Estructura del archivo:
   01 — CONFIGURACIÓN
   02 — ESCENA (video + canvas)
   03 — CONEXIÓN MQTT
   04 — REGLAS: INPUT -> RELACIÓN -> OUTPUT
   05 — MODO DEMOSTRACIÓN (sin broker)
   06 — INTERFAZ + LOG
   07 — RENDER LOOP
   ============================================================ */

/* ---------------------------------------------------------- */
/* 01 — CONFIGURACIÓN                                          */
/* ---------------------------------------------------------- */

const CONFIG = {
  // Umbral bajo el cual se considera que no hubo respuesta significativa:
  // la imagen se preserva sin ruido.
  umbralInactividad: 6,
  // Duración del efecto de fragmentación al detectar un cambio brusco (ms).
  duracionGlitch: 420,
  // Velocidad de decaimiento del ruido por frame (0-1, más alto = decae más rápido).
  decaimiento: 0.06,
  // Rango del filtro de color: alpha mínima (dial en 0) y máxima (dial al máximo).
  filtroColorAlphaMin: 0.25,
  filtroColorAlphaMax: 0.75,
};

const estado = {
  mqttClient: null,
  conectado: false,
  modoDemo: false,
  intensidad: 0, // 0-100, ruido visible en pantalla (derivado de la inclinación), decae en el tiempo
  amplitud: 0, // 0-1, dial manual del potenciómetro/SoftPot: escala ruido y filtro de color
  glitchHasta: 0, // timestamp (performance.now) hasta el cual el glitch está activo
  colorHex: null, // último color dominante del TCS34725 (null = sensor sin datos aún)
  colorDominante: "—",
  ultimoClientId: null,
};

/* ---------------------------------------------------------- */
/* 02 — ESCENA (video + canvas)                                */
/* ---------------------------------------------------------- */

const video = document.getElementById("video-src");
const canvas = document.getElementById("canvas-out");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

async function usarWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;
    await video.play();
    log("Fuente de video: cámara.");
  } catch (err) {
    log("No se pudo acceder a la cámara: " + err.message, true);
  }
}

function usarArchivo(file) {
  const url = URL.createObjectURL(file);
  video.srcObject = null;
  video.src = url;
  video.loop = true;
  video.play();
  log("Fuente de video: archivo " + file.name);
}

document.getElementById("btn-webcam").addEventListener("click", usarWebcam);
document.getElementById("in-file").addEventListener("change", (e) => {
  if (e.target.files[0]) usarArchivo(e.target.files[0]);
});

/* ---------------------------------------------------------- */
/* 03 — CONEXIÓN MQTT                                           */
/* ---------------------------------------------------------- */

function conectarMQTT() {
  const host = document.getElementById("in-host").value.trim();
  const port = document.getElementById("in-port").value.trim() || "8084";
  const user = document.getElementById("in-user").value.trim();
  const pass = document.getElementById("in-pass").value;
  const topic = document.getElementById("in-topic").value.trim();

  if (!host || !topic) {
    log("Falta host o topic para conectar.", true);
    return;
  }

  const url = `wss://${host}:${port}/mqtt`;
  const clientId = "web-distorsion-" + Math.random().toString(16).slice(2, 8);

  setEstadoConexion("conectando");
  log(`Conectando a ${url} como ${clientId}…`);

  const client = mqtt.connect(url, {
    clientId,
    username: user || undefined,
    password: pass || undefined,
    reconnectPeriod: 4000,
    connectTimeout: 8000,
  });

  client.on("connect", () => {
    estado.conectado = true;
    setEstadoConexion("conectado");
    log("Conectado. Suscribiendo a: " + topic);
    client.subscribe(topic, (err) => {
      if (err) log("Error al suscribirse: " + err.message, true);
    });
  });

  client.on("reconnect", () => setEstadoConexion("conectando"));
  client.on("close", () => { estado.conectado = false; setEstadoConexion("desconectado"); });
  client.on("error", (err) => {
    log("Error MQTT: " + err.message, true);
    setEstadoConexion("error");
  });

  client.on("message", (_topic, payload) => {
    try {
      const mensaje = JSON.parse(payload.toString());
      procesarMensaje(mensaje);
    } catch (err) {
      log("Mensaje no interpretable como JSON: " + payload.toString(), true);
    }
  });

  estado.mqttClient = client;
}

document.getElementById("btn-connect").addEventListener("click", () => {
  estado.modoDemo = false;
  conectarMQTT();
});

function setEstadoConexion(estadoTexto) {
  const el = document.getElementById("estado-conexion");
  el.classList.remove("badge-off", "badge-on", "badge-error");
  const textos = {
    desconectado: ["Desconectado", "badge-off"],
    conectando: ["Conectando…", "badge-off"],
    conectado: ["Conectado ✓", "badge-on"],
    error: ["Error de conexión", "badge-error"],
    demo: ["Modo demostración", "badge-on"],
  };
  const [texto, clase] = textos[estadoTexto] || textos.desconectado;
  el.textContent = texto;
  el.classList.add(clase);
}

/* ---------------------------------------------------------- */
/* 04 — REGLAS: INPUT -> RELACIÓN -> OUTPUT                      */
/*                                                                */
/* Payload esperado (ver arduino/instrumento_esp32_multisensor.ino,  */
/* esquema v2 — 3 sensores independientes, la web decide la regla):  */
/*  {                                                                 */
/*    "clientId": "instrumento-esp32-01",                            */
/*    "timestamp": 169...,                                           */
/*    "accelY": -3.24,                                               */
/*    "inclinacion": 42.1,      // ADXL345, ángulo continuo -90..90°  */
/*    "cambioBrusco": false,    // salto brusco entre lecturas        */
/*    "colorR": 182, "colorG": 40, "colorB": 33,                     */
/*    "colorHex": "#B62821",   // TCS34725, normalizado por "clear"   */
/*    "colorDominante": "rojo",                                      */
/*    "controlValor": 63.0      // potenciómetro/SoftPot, dial 0-100  */
/*  }                                                                 */
/*                                                                     */
/* Traducción — cada sensor gobierna un aspecto distinto del glitch:  */
/*  inclinación (°)         -> ruido/grano, proporcional a |ángulo|    */
/*  cambioBrusco            -> fragmentación y recomposición del frame*/
/*  controlValor (dial)     -> amplitud manual: escala ruido y filtro */
/*  colorHex / colorDominante -> filtro de color superpuesto al video */
/* ---------------------------------------------------------- */

function procesarMensaje(mensaje) {
  estado.ultimoClientId = mensaje.clientId || estado.ultimoClientId;

  const inclinacion = Number(mensaje.inclinacion) || 0;
  const cambioBrusco = !!mensaje.cambioBrusco;
  const controlValor = Math.max(0, Math.min(100, Number(mensaje.controlValor) || 0));
  const colorHex = typeof mensaje.colorHex === "string" ? mensaje.colorHex : null;
  const colorDominante = mensaje.colorDominante || "—";

  estado.amplitud = controlValor / 100;
  estado.colorHex = colorHex;
  estado.colorDominante = colorDominante;

  // ruido proporcional al ángulo de inclinación (0-90° -> 0-100), escalado por el dial
  const intensidadInclinacion = Math.min(100, (Math.abs(inclinacion) / 90) * 100);
  const intensidad = intensidadInclinacion * estado.amplitud;
  estado.intensidad = Math.max(estado.intensidad, intensidad); // el cambio brusco se ve, no se pierde entre frames

  let regla = "sin alteración (inclinación estable)";
  if (cambioBrusco) {
    estado.glitchHasta = performance.now() + CONFIG.duracionGlitch;
    regla = "cambio brusco → fragmentación del frame";
  } else if (intensidad > CONFIG.umbralInactividad) {
    regla = `inclinación × control → ruido (${controlValor.toFixed(0)}%)`;
  }
  if (colorHex) regla += ` · filtro ${colorDominante}`;

  actualizarPanelEstado(mensaje, intensidad, cambioBrusco, regla, inclinacion, controlValor, colorHex, colorDominante);
  log(
    `inclinación=${inclinacion.toFixed(0)}° brusco=${cambioBrusco ? "sí" : "no"} control=${controlValor.toFixed(0)} color=${colorDominante} → ${regla}`,
    false,
    cambioBrusco
  );
}

/* ---------------------------------------------------------- */
/* 05 — MODO DEMOSTRACIÓN (sin broker)                          */
/*                                                                */
/* Genera localmente una señal sintética con el mismo esquema    */
/* que publicaría el instrumento real, para poder probar y        */
/* calibrar las reglas de distorsión sin depender del hardware    */
/* ni de un broker configurado (ver "Sistema de testing" del      */
/* brief).                                                        */
/* ---------------------------------------------------------- */

let demoInterval = null;

// Colores de referencia (mismo formato que entrega el TCS34725 ya normalizado).
const COLORES_DEMO = [
  { hex: "#B62821", dominante: "rojo" },
  { hex: "#2E9E5B", dominante: "verde" },
  { hex: "#2B6FD9", dominante: "azul" },
  { hex: "#9A9A96", dominante: "equilibrado" },
];

function iniciarModoDemo() {
  if (estado.mqttClient) {
    estado.mqttClient.end(true);
    estado.mqttClient = null;
  }
  estado.modoDemo = true;
  setEstadoConexion("demo");
  log("Modo demostración iniciado: simula acelerómetro, sensor de color y potenciómetro localmente.");

  let inclinacion = 0;
  let control = 40;
  let colorIdx = 0;

  if (demoInterval) clearInterval(demoInterval);
  demoInterval = setInterval(() => {
    inclinacion += (Math.random() - 0.5) * 10;
    inclinacion = Math.max(-80, Math.min(80, inclinacion));

    const cambioBrusco = Math.random() < 0.06;
    if (cambioBrusco) inclinacion = Math.max(-85, Math.min(85, inclinacion + (Math.random() - 0.5) * 70));

    control += (Math.random() - 0.5) * 6;
    control = Math.max(0, Math.min(100, control));

    if (Math.random() < 0.02) colorIdx = (colorIdx + 1) % COLORES_DEMO.length;
    const color = COLORES_DEMO[colorIdx];

    procesarMensaje({
      clientId: "demo-local",
      timestamp: Date.now(),
      accelY: 0,
      inclinacion,
      cambioBrusco,
      colorR: parseInt(color.hex.slice(1, 3), 16),
      colorG: parseInt(color.hex.slice(3, 5), 16),
      colorB: parseInt(color.hex.slice(5, 7), 16),
      colorHex: color.hex,
      colorDominante: color.dominante,
      controlValor: control,
    });
  }, 350);
}

document.getElementById("btn-demo").addEventListener("click", iniciarModoDemo);

/* ---------------------------------------------------------- */
/* 06 — INTERFAZ + LOG                                          */
/* ---------------------------------------------------------- */

function actualizarPanelEstado(mensaje, intensidad, cambioBrusco, regla, inclinacion, controlValor, colorHex, colorDominante) {
  document.getElementById("stat-raw").textContent = JSON.stringify({
    clientId: mensaje.clientId,
    inclinacion: Number(inclinacion.toFixed(1)),
    cambioBrusco,
    controlValor: Math.round(controlValor),
    colorHex,
  });
  document.getElementById("stat-inclinacion").textContent = inclinacion.toFixed(0) + "°";
  document.getElementById("stat-brusco").textContent = cambioBrusco ? "sí" : "no";
  document.getElementById("stat-control").textContent = controlValor.toFixed(0);
  document.getElementById("stat-color").textContent = colorDominante;
  const swatch = document.getElementById("swatch-color");
  if (swatch) swatch.style.background = colorHex || "transparent";
  document.getElementById("stat-regla").textContent = regla;
  document.getElementById("bar-intensidad-fill").style.width = intensidad.toFixed(0) + "%";
}

function log(texto, esError = false, esPico = false) {
  const linea = document.createElement("div");
  const hora = new Date().toLocaleTimeString();
  linea.textContent = `[${hora}] ${texto}`;
  if (esError) linea.classList.add("error");
  if (esPico) linea.classList.add("pico");
  const contenedor = document.getElementById("log");
  contenedor.appendChild(linea);
  while (contenedor.childNodes.length > 200) contenedor.removeChild(contenedor.firstChild);
}

/* ---------------------------------------------------------- */
/* 07 — RENDER LOOP                                              */
/*                                                                */
/* Cada frame: dibuja el video, aplica ruido proporcional a la   */
/* intensidad vigente, aplica fragmentación si hay un glitch      */
/* activo, y decae la intensidad hacia cero.                      */
/* ---------------------------------------------------------- */

function dibujarFrameBase() {
  if (video.readyState >= 2 && video.videoWidth > 0) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#555";
    ctx.font = "16px sans-serif";
    ctx.fillText("Sin fuente de video — usa cámara o carga un archivo", 24, canvas.height / 2);
  }
}

function aplicarRuido(intensidad) {
  if (intensidad <= CONFIG.umbralInactividad) return;
  const cantidad = Math.round((intensidad / 100) * 900);
  ctx.save();
  for (let i = 0; i < cantidad; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const size = Math.random() * 2 + 0.5;
    const tono = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${tono},${tono},${tono},${(0.05 + Math.random() * 0.25).toFixed(2)})`;
    ctx.fillRect(x, y, size, size);
  }
  // líneas de barrido para reforzar la sensación de señal degradada
  const lineas = Math.round((intensidad / 100) * 6);
  for (let i = 0; i < lineas; i++) {
    const y = Math.random() * canvas.height;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, y, canvas.width, 1 + Math.random() * 2);
  }
  ctx.restore();
}

function aplicarFragmentacion() {
  const bandas = 10 + Math.floor(Math.random() * 8);
  const altoBanda = canvas.height / bandas;
  for (let i = 0; i < bandas; i++) {
    const y = i * altoBanda;
    const h = altoBanda;
    const desplazamiento = (Math.random() - 0.5) * canvas.width * 0.18;
    try {
      const franja = ctx.getImageData(0, y, canvas.width, h);
      ctx.putImageData(franja, desplazamiento, y);
      // recompón el borde que quedó vacío repitiendo el extremo (recomposición algorítmica)
      if (desplazamiento > 0) {
        const relleno = ctx.getImageData(0, y, desplazamiento, h);
        ctx.putImageData(relleno, canvas.width - desplazamiento, y);
      } else if (desplazamiento < 0) {
        const relleno = ctx.getImageData(canvas.width + desplazamiento, y, -desplazamiento, h);
        ctx.putImageData(relleno, 0, y);
      }
    } catch (err) {
      // getImageData puede fallar por CORS si el video proviene de otro origen sin CORS habilitado
    }
  }
}

// Tiñe el frame con el color dominante detectado por el TCS34725. Se usa el
// modo de composición "color" (toma matiz/saturación del tinte y conserva la
// luminosidad del video) para que siga leyéndose la imagen debajo del filtro.
// El dial (controlValor) modula cuánto se nota: nunca desaparece del todo,
// para que el filtro sea legible como una capa activa del sistema.
function aplicarFiltroColor(colorHex, amplitud) {
  if (!colorHex) return;
  const alpha = CONFIG.filtroColorAlphaMin + (CONFIG.filtroColorAlphaMax - CONFIG.filtroColorAlphaMin) * amplitud;
  ctx.save();
  ctx.globalCompositeOperation = "color";
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function loop() {
  dibujarFrameBase();

  const glitchActivo = performance.now() < estado.glitchHasta;
  if (glitchActivo) {
    aplicarFragmentacion();
  }
  aplicarRuido(estado.intensidad);
  aplicarFiltroColor(estado.colorHex, estado.amplitud);

  // decaimiento exponencial hacia 0 (la inclinación no queda fija en el tiempo)
  estado.intensidad *= 1 - CONFIG.decaimiento;
  if (estado.intensidad < 0.5) estado.intensidad = 0;

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
log("Sistema listo. Conecta al broker o usa el modo demostración para probar las reglas.");

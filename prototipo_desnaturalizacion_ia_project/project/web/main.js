/* ============================================================
   Desnaturalización IA — prototipo de baja resolución
   Sistema de distorsión: MQTT (entrada) -> reglas -> canvas (salida)

   Estructura del archivo:
   01 — CONFIGURACIÓN
   02 — ESCENA (video + canvas)
   03 — CONEXIÓN MQTT
   04 — VISUALIZACIÓN DE LA SEÑAL (forma abstracta / metaballs)
   05 — REGLAS: INPUT -> RELACIÓN -> OUTPUT
   06 — MODO DEMOSTRACIÓN (sin broker)
   07 — INTERFAZ + LOG (menús, ventanas flotantes)
   08 — RENDER LOOP
   09 — CAPTURA DE SECUENCIA (30 s) + EXPORTAR VIDEO
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
  inclinacion: 0, // último ángulo recibido (°), para el overlay de datos durante la captura
  glitchHasta: 0, // timestamp (performance.now) hasta el cual el glitch está activo
  colorHex: null, // último color dominante del TCS34725 (null = sensor sin datos aún)
  colorDominante: "—",
  ultimoClientId: null,
};

const CAPTURA_DURACION_MS = 30000;

const captura = {
  activa: false,
  inicio: 0, // performance.now() al arrancar, para calcular t relativo de cada muestra
  muestras: [], // [{ t, inclinacion, cambioBrusco, controlValor, colorHex, colorDominante, intensidad }]
  mediaRecorder: null,
  chunks: [],
  timeoutId: null,
  rafId: null,
};

/* ---------------------------------------------------------- */
/* 02 — ESCENA (video + canvas)                                */
/* ---------------------------------------------------------- */

const video = document.getElementById("video-src");
const canvas = document.getElementById("canvas-out");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const stageTitle = document.getElementById("stage-title");

// El canvas es ahora la pantalla completa (ver .stage-full en style.css):
// su buffer se ajusta al tamaño real del contenedor en vez de usar una
// resolución fija, para que la distorsión se dibuje nítida a cualquier
// tamaño de ventana.
function ajustarTamanoCanvas() {
  const stage = canvas.parentElement;
  canvas.width = stage.clientWidth;
  canvas.height = stage.clientHeight;
}
window.addEventListener("resize", ajustarTamanoCanvas);
ajustarTamanoCanvas();

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

  // Espejo del estado en el trigger del menú "01 · Conexión": visible con
  // el panel cerrado, para no tener que abrirlo solo para chequear el link.
  const triggerEstado = document.getElementById("trigger-estado-conexion");
  if (triggerEstado) triggerEstado.textContent = texto.replace(" ✓", "");
}

/* ---------------------------------------------------------- */
/* 04 — VISUALIZACIÓN DE LA SEÑAL (forma abstracta / metaballs)  */
/*                                                                */
/* Una sola forma orgánica — una cadena de círculos fusionados     */
/* con un filtro "goo" (blur + endurecido de alfa), inspirada en    */
/* clusters de manchas con degradé y borde negro — que traduce      */
/* visualmente los mismos 3 sensores que gobiernan la distorsión    */
/* del video:                                                       */
/*   inclinación  -> rotación de la forma                           */
/*   controlValor -> tamaño y dispersión de los círculos            */
/*   colorHex     -> degradé de color de cada círculo                */
/*   cambioBrusco -> salto a un estado distinto (nueva composición)  */
/* ---------------------------------------------------------- */

const SVG_NS = "http://www.w3.org/2000/svg";
const blobSvg = document.getElementById("blob-viz");
const blobEstadoLabel = document.getElementById("blob-estado-label");

// Cada estado es una composición distinta de círculos: r = radio relativo,
// dx/dy = offset relativo respecto del centro. "accent" marca el círculo
// que se pinta con el color secundario (el contraste, como en la referencia).
const BLOB_ESTADOS = [
  [{ r: .85, dx: -1.7, dy: .15 }, { r: 1.3, dx: -.55, dy: -.1 }, { r: .42, dx: .35, dy: .25, accent: true }, { r: .95, dx: 1.15, dy: -.05 }],
  [{ r: 1.15, dx: -1.15, dy: -.1 }, { r: .55, dx: -.05, dy: .2, accent: true }, { r: 1.2, dx: .95, dy: -.05 }],
  [{ r: .55, dx: -1.75, dy: .2 }, { r: 1.25, dx: -.75, dy: -.1 }, { r: .32, dx: .15, dy: .3, accent: true }, { r: .85, dx: .7, dy: -.1 }, { r: .48, dx: 1.5, dy: .15 }],
  [{ r: 1.35, dx: -.85, dy: -.05 }, { r: .5, dx: .3, dy: .25, accent: true }, { r: .85, dx: 1.1, dy: -.1 }],
  [{ r: .6, dx: -1.5, dy: .1 }, { r: .95, dx: -.55, dy: -.15 }, { r: .95, dx: .55, dy: .15 }, { r: .6, dx: 1.5, dy: -.1, accent: true }],
];
const BLOB_MAX = Math.max(...BLOB_ESTADOS.map((e) => e.length));

let blobEstadoIdx = 0;
let blobGroup = null;
let blobCircles = []; // [{ contorno, relleno }] — tamaño fijo BLOB_MAX
let blobSaltoTimeout = null;

function crearGradienteBlob(id) {
  const grad = document.createElementNS(SVG_NS, "radialGradient");
  grad.setAttribute("id", id);
  grad.setAttribute("cx", "35%");
  grad.setAttribute("cy", "32%");
  grad.setAttribute("r", "75%");
  const claro = document.createElementNS(SVG_NS, "stop");
  claro.setAttribute("class", "stop-claro");
  claro.setAttribute("offset", "0%");
  const oscuro = document.createElementNS(SVG_NS, "stop");
  oscuro.setAttribute("class", "stop-oscuro");
  oscuro.setAttribute("offset", "100%");
  grad.appendChild(claro);
  grad.appendChild(oscuro);
  return grad;
}

function crearBlobSvg() {
  blobSvg.innerHTML = "";

  const defs = document.createElementNS(SVG_NS, "defs");

  // Filtro "goo": desenfoca y luego endurece el alfa para que los círculos
  // cercanos se fusionen en una sola silueta orgánica en vez de superponerse
  // como discos independientes. Región fija a todo el viewBox: así el
  // desenfoque nunca se recorta, sea cual sea la composición del estado.
  const filtro = document.createElementNS(SVG_NS, "filter");
  filtro.setAttribute("id", "blob-goo");
  filtro.setAttribute("filterUnits", "userSpaceOnUse");
  filtro.setAttribute("x", "0");
  filtro.setAttribute("y", "0");
  filtro.setAttribute("width", "640");
  filtro.setAttribute("height", "320");
  filtro.innerHTML =
    '<feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />' +
    '<feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo" />';
  defs.appendChild(filtro);
  defs.appendChild(crearGradienteBlob("blob-grad-principal"));
  defs.appendChild(crearGradienteBlob("blob-grad-acento"));
  blobSvg.appendChild(defs);

  blobGroup = document.createElementNS(SVG_NS, "g");
  blobGroup.setAttribute("class", "blob-group");

  // Dos capas idénticas con el mismo filtro: el contorno (negro, círculos
  // un poco más grandes) queda debajo del relleno con degradé, dando el
  // efecto de silueta con borde que se ve en la referencia.
  const capaContorno = document.createElementNS(SVG_NS, "g");
  capaContorno.setAttribute("filter", "url(#blob-goo)");
  const capaRelleno = document.createElementNS(SVG_NS, "g");
  capaRelleno.setAttribute("filter", "url(#blob-goo)");

  blobCircles = [];
  for (let i = 0; i < BLOB_MAX; i++) {
    const contorno = document.createElementNS(SVG_NS, "circle");
    contorno.setAttribute("class", "blob-circulo-contorno");
    const relleno = document.createElementNS(SVG_NS, "circle");
    relleno.setAttribute("class", "blob-circulo-relleno");
    capaContorno.appendChild(contorno);
    capaRelleno.appendChild(relleno);
    blobCircles.push({ contorno, relleno });
  }

  blobGroup.appendChild(capaContorno);
  blobGroup.appendChild(capaRelleno);
  blobSvg.appendChild(blobGroup);
}

// ---- color: helpers HSL para derivar variantes claro/oscuro/acento desde colorHex ----
function hexARgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbAHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}
function hslAHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const aHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${aHex(r)}${aHex(g)}${aHex(b)}`;
}

const BLOB_IDLE = { claro: "#c7c7c2", oscuro: "#6a6a66" }; // gris del archivo, antes del primer mensaje

function derivarPaletaBlob(colorHex) {
  if (!colorHex) {
    return { principalClaro: BLOB_IDLE.claro, principalOscuro: BLOB_IDLE.oscuro, acentoClaro: BLOB_IDLE.claro, acentoOscuro: BLOB_IDLE.oscuro };
  }
  const [r, g, b] = hexARgb(colorHex);
  const [h, s, l] = rgbAHsl(r, g, b);
  const sat = Math.max(s, 55); // el sensor a veces entrega colores poco saturados; se refuerza para que el degradé se lea
  return {
    principalClaro: hslAHex(h, sat * 0.7, Math.min(l + 26, 88)),
    principalOscuro: hslAHex(h, sat, Math.max(l - 12, 18)),
    acentoClaro: hslAHex(h + 150, sat * 0.7, Math.min(l + 26, 88)),
    acentoOscuro: hslAHex(h + 150, sat, Math.max(l - 12, 18)),
  };
}

function aplicarGradienteBlob(id, claro, oscuro) {
  const grad = document.getElementById(id);
  if (!grad) return;
  grad.querySelector(".stop-claro").setAttribute("stop-color", claro);
  grad.querySelector(".stop-oscuro").setAttribute("stop-color", oscuro);
}

function actualizarVisualizacionBlob(inclinacion, cambioBrusco, controlValor, colorHex) {
  if (cambioBrusco) {
    let nuevo = blobEstadoIdx;
    while (nuevo === blobEstadoIdx && BLOB_ESTADOS.length > 1) {
      nuevo = Math.floor(Math.random() * BLOB_ESTADOS.length);
    }
    blobEstadoIdx = nuevo;
    blobEstadoLabel.textContent = `FORMA — ESTADO ${String(blobEstadoIdx + 1).padStart(2, "0")}`;
    blobGroup.classList.add("blob-salto");
    clearTimeout(blobSaltoTimeout);
    blobSaltoTimeout = setTimeout(() => blobGroup.classList.remove("blob-salto"), 260);
  }

  const layout = BLOB_ESTADOS[blobEstadoIdx];
  const unidad = 26 + (controlValor / 100) * 34; // dial -> tamaño de los círculos
  const dispersion = 0.85 + (controlValor / 100) * 0.5; // dial -> qué tan separados están
  const cx0 = 320, cy0 = 160;

  for (let i = 0; i < BLOB_MAX; i++) {
    const item = layout[i];
    const par = blobCircles[i];
    if (!item) {
      // sobran círculos respecto de este estado: se encogen a 0 (se "absorben")
      par.relleno.setAttribute("r", 0);
      par.contorno.setAttribute("r", 0);
      continue;
    }
    const cx = cx0 + item.dx * unidad * dispersion * 1.15;
    const cy = cy0 + item.dy * unidad * dispersion;
    const r = item.r * unidad;
    par.relleno.setAttribute("cx", cx);
    par.relleno.setAttribute("cy", cy);
    par.relleno.setAttribute("r", r);
    par.relleno.setAttribute("fill", item.accent ? "url(#blob-grad-acento)" : "url(#blob-grad-principal)");
    par.contorno.setAttribute("cx", cx);
    par.contorno.setAttribute("cy", cy);
    par.contorno.setAttribute("r", r + 6);
  }

  // La inclinación del instrumento rota la forma completa alrededor de su centro.
  blobGroup.setAttribute("transform", `rotate(${inclinacion.toFixed(1)} ${cx0} ${cy0})`);

  const paleta = derivarPaletaBlob(colorHex);
  aplicarGradienteBlob("blob-grad-principal", paleta.principalClaro, paleta.principalOscuro);
  aplicarGradienteBlob("blob-grad-acento", paleta.acentoClaro, paleta.acentoOscuro);
}

crearBlobSvg();
actualizarVisualizacionBlob(0, false, 40, null); // estado inicial, antes del primer mensaje

/* ---------------------------------------------------------- */
/* 05 — REGLAS: INPUT -> RELACIÓN -> OUTPUT                      */
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
  estado.inclinacion = inclinacion;
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

  actualizarVisualizacionBlob(inclinacion, cambioBrusco, controlValor, colorHex);
  actualizarPanelEstado(intensidad, cambioBrusco, regla, inclinacion, controlValor, colorHex, colorDominante);
  log(
    `inclinación=${inclinacion.toFixed(0)}° brusco=${cambioBrusco ? "sí" : "no"} control=${controlValor.toFixed(0)} color=${colorDominante} → ${regla}`,
    false,
    cambioBrusco
  );

  // Si hay una captura de 30s en curso, esta lectura queda registrada
  // como un keyframe más de la secuencia (ver sección 09).
  if (captura.activa) {
    captura.muestras.push({
      t: Number(((performance.now() - captura.inicio) / 1000).toFixed(2)),
      inclinacion: Number(inclinacion.toFixed(1)),
      cambioBrusco,
      controlValor: Number(controlValor.toFixed(0)),
      colorHex,
      colorDominante,
      intensidad: Number(intensidad.toFixed(1)),
    });
  }
}

/* ---------------------------------------------------------- */
/* 06 — MODO DEMOSTRACIÓN (sin broker)                          */
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
/* 07 — INTERFAZ + LOG                                          */
/* ---------------------------------------------------------- */

function actualizarPanelEstado(intensidad, cambioBrusco, regla, inclinacion, controlValor, colorHex, colorDominante) {
  document.getElementById("stat-inclinacion").textContent = inclinacion.toFixed(0) + "°";
  document.getElementById("stat-brusco").textContent = cambioBrusco ? "sí" : "no";
  document.getElementById("stat-control").textContent = controlValor.toFixed(0);
  document.getElementById("stat-ruido").textContent = intensidad.toFixed(0) + "%";
  document.getElementById("stat-color").textContent = colorDominante;
  const swatch = document.getElementById("swatch-color");
  if (swatch) swatch.style.background = colorHex || "transparent";
  document.getElementById("stat-regla").textContent = regla;

  const triggerSenal = document.getElementById("trigger-estado-senal");
  if (triggerSenal) triggerSenal.textContent = colorHex ? colorDominante : "activo";
}

/* ---------------------------------------------------------- */
/* Menús desplegables — abren/cierran los paneles sin ocupar     */
/* espacio fijo sobre el video (ver .menu-dock en style.css).    */
/* Un solo panel abierto a la vez; se cierra con Escape, con un   */
/* click fuera, o volviendo a tocar su propio trigger.            */
/* ---------------------------------------------------------- */

// Solo los triggers con data-target abren un panel; los botones directos
// del dock (Cámara, Captura) comparten la misma clase por estilo, pero no
// participan del acordeón.
const menuTriggers = Array.from(document.querySelectorAll(".menu-trigger[data-target]"));
const menuDock = document.querySelector(".menu-dock");

function cerrarMenus(exceptoBoton) {
  menuTriggers.forEach((btn) => {
    if (btn === exceptoBoton) return;
    btn.setAttribute("aria-expanded", "false");
    const panel = document.getElementById(btn.dataset.target);
    if (panel) panel.hidden = true;
  });
}

// Con la ventana "03 · Señal" ahora justo debajo del dock, un panel
// desplegable (Conexión/Registro, 380px de ancho) le queda encima al
// abrirse. Para que no se vean superpuestos, la ventana se oculta
// mientras haya algún panel abierto y vuelve a aparecer al cerrarlo.
function actualizarVisibilidadVentanaSenal() {
  if (!dataWindow) return;
  const algunoAbierto = menuTriggers.some((btn) => btn.getAttribute("aria-expanded") === "true");
  dataWindow.classList.toggle("oculta-por-menu", algunoAbierto);
}

menuTriggers.forEach((btn) => {
  const panel = document.getElementById(btn.dataset.target);
  if (!panel) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const abierto = btn.getAttribute("aria-expanded") === "true";
    cerrarMenus(btn);
    btn.setAttribute("aria-expanded", String(!abierto));
    panel.hidden = abierto;
    actualizarVisibilidadVentanaSenal();
  });
});

document.addEventListener("click", (e) => {
  if (e.target.closest(".menu-item")) return;
  cerrarMenus(null);
  actualizarVisibilidadVentanaSenal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    cerrarMenus(null);
    actualizarVisibilidadVentanaSenal();
  }
});

/* ---------------------------------------------------------- */
/* Ventana "03 · Señal" — fija, mismo ancho que el dock, pegada       */
/* justo debajo (ver posicionarVentanaSenalBajoDock). No se arrastra   */
/* ni se redimensiona; solo se puede minimizar. Se opaca mientras hay  */
/* un panel del dock abierto, para que no queden superpuestas (ver     */
/* actualizarVisibilidadVentanaSenal más arriba).                       */
/* ---------------------------------------------------------- */

function habilitarMinimizado(win, toggle) {
  toggle.addEventListener("click", () => {
    const minimizado = win.classList.toggle("minimizado");
    toggle.textContent = minimizado ? "▢" : "–";
    toggle.setAttribute("aria-label", minimizado ? "Expandir ventana" : "Minimizar ventana");
  });
}

const dataWindow = document.getElementById("data-window");
habilitarMinimizado(dataWindow, document.getElementById("data-window-toggle"));

// El ancho y el borde derecho ya quedan alineados con el dock por CSS
// (comparten --dock-w / --dock-edge); acá solo hace falta calcular el
// top, porque la altura del dock varía según el contenido y el ancho
// de pantalla. Se recalcula en cada resize.
function posicionarVentanaSenalBajoDock() {
  if (!menuDock || !dataWindow) return;
  const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-h")) || 34;
  const rect = menuDock.getBoundingClientRect();

  dataWindow.style.top = Math.round(rect.bottom + 10) + "px";

  const disponible = window.innerHeight - rect.bottom - barH - 16;
  dataWindow.style.maxHeight = Math.max(120, disponible) + "px";
}
window.addEventListener("resize", posicionarVentanaSenalBajoDock);
posicionarVentanaSenalBajoDock();

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
/* 08 — RENDER LOOP                                              */
/*                                                                */
/* Cada frame: dibuja el video, aplica ruido proporcional a la   */
/* intensidad vigente, aplica fragmentación si hay un glitch      */
/* activo, y decae la intensidad hacia cero.                      */
/* ---------------------------------------------------------- */

function dibujarFrameBase() {
  const listo = video.readyState >= 2 && video.videoWidth > 0;

  // El título del proyecto ocupa el centro mientras no hay fuente activa
  // (ver .stage-title en style.css) — reemplaza el antiguo aviso dibujado
  // a mano en el canvas. Se decide cuadro a cuadro: si la fuente se corta
  // (ej. se desconecta la cámara), el título vuelve a aparecer solo.
  if (stageTitle) stageTitle.hidden = listo;

  if (listo) {
    // "cover": el video llena todo el canvas sin deformarse, recortando
    // el sobrante — necesario ahora que el canvas es la pantalla completa
    // y su proporción no coincide con la del video fuente.
    const escala = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const w = video.videoWidth * escala;
    const h = video.videoHeight * escala;
    ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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

// Mientras hay una captura en curso, horneamos un HUD de datos directamente
// en el frame (además de guardar las muestras): así el .webm exportado ya
// muestra por sí solo cómo varió la señal en el tiempo, sin depender de
// software externo para reconstruirlo. Se dibuja último, sobre el resto.
function dibujarHudGrabacion() {
  if (!captura.activa) return;

  const transcurrido = Math.min(CAPTURA_DURACION_MS, performance.now() - captura.inicio);
  const seg = (transcurrido / 1000).toFixed(1);
  const escala = Math.min(1.6, Math.max(0.8, canvas.width / 960));

  ctx.save();
  ctx.font = `${(12 * escala).toFixed(0)}px "JetBrains Mono", monospace`;
  ctx.textBaseline = "top";

  const alto = 30 * escala;
  ctx.fillStyle = "rgba(6,6,6,0.6)";
  ctx.fillRect(0, 0, canvas.width, alto);

  const parpadeo = Math.floor(performance.now() / 500) % 2 === 0;
  const pad = 14 * escala;
  let x = pad;
  const y = alto / 2 - (6 * escala);

  ctx.fillStyle = parpadeo ? "#f4f4f1" : "#8c8c87";
  ctx.fillText("● REC", x, y);
  x += ctx.measureText("● REC  ").width;

  ctx.fillStyle = "#c7c7c2";
  const campos = [
    `${seg}s/30.0s`,
    `INC ${estado.inclinacion.toFixed(0)}°`,
    `CTRL ${Math.round(estado.amplitud * 100)}`,
  ];
  campos.forEach((texto) => {
    ctx.fillText(texto, x, y);
    x += ctx.measureText(texto + "   ").width;
  });

  if (estado.colorHex) {
    const s = 16 * escala;
    ctx.fillStyle = estado.colorHex;
    ctx.fillRect(canvas.width - pad - s, alto / 2 - s / 2, s, s);
    ctx.strokeStyle = "#f4f4f1";
    ctx.lineWidth = 1;
    ctx.strokeRect(canvas.width - pad - s, alto / 2 - s / 2, s, s);
  }
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
  dibujarHudGrabacion();

  // decaimiento exponencial hacia 0 (la inclinación no queda fija en el tiempo)
  estado.intensidad *= 1 - CONFIG.decaimiento;
  if (estado.intensidad < 0.5) estado.intensidad = 0;

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
log("Sistema listo. Conecta al broker o usa el modo demostración para probar las reglas.");

/* ---------------------------------------------------------- */
/* 09 — CAPTURA DE SECUENCIA (30 s) + EXPORTAR VIDEO              */
/*                                                                */
/* Vive como un botón directo en el dock (sin ventana ni menú): al   */
/* tocarlo, hace dos cosas en paralelo:                               */
/*  1) graba el canvas (ya con el HUD horneado) a .webm vía            */
/*     canvas.captureStream() + MediaRecorder.                         */
/*  2) guarda cada lectura de sensor que llega mientras graba           */
/*     (ver el hook al final de procesarMensaje, sección 05).           */
/* Mientras graba se ve solo una barra de progreso mínima; al           */
/* terminar, esa barra se reemplaza por una línea de tiempo discreta    */
/* (SVG chico, sin caja de panel) y los botones de descarga.            */
/* ---------------------------------------------------------- */

const btnCapturar = document.getElementById("btn-capturar");
const capturaProgresoMini = document.getElementById("capture-progreso-mini");
const capturaProgresoFill = document.getElementById("captura-progreso-fill");
const capturaTiempoEl = document.getElementById("captura-tiempo");
const capturaResultadoEl = document.getElementById("captura-resultado");
const capturaEstadoEl = document.getElementById("capture-estado");
const btnDescargarVideo = document.getElementById("btn-descargar-video");
const btnDescargarDatos = document.getElementById("btn-descargar-datos");

function formatoTiempoCaptura(ms) {
  const s = Math.min(30, Math.floor(ms / 1000));
  return "00:" + String(s).padStart(2, "0");
}

function actualizarProgresoCaptura() {
  if (!captura.activa) return;
  const transcurrido = performance.now() - captura.inicio;
  const pct = Math.min(100, (transcurrido / CAPTURA_DURACION_MS) * 100);
  capturaProgresoFill.style.width = pct + "%";
  capturaTiempoEl.textContent = `${formatoTiempoCaptura(transcurrido)} / 00:30`;
  captura.rafId = requestAnimationFrame(actualizarProgresoCaptura);
}

function iniciarCaptura() {
  if (captura.activa) return;

  if (typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
    log("Este navegador no soporta grabar el canvas (captureStream/MediaRecorder).", true);
    return;
  }

  captura.activa = true;
  captura.inicio = performance.now();
  captura.muestras = [];
  captura.chunks = [];

  btnCapturar.disabled = true;
  btnCapturar.classList.add("grabando");
  capturaEstadoEl.textContent = "grabando";
  capturaResultadoEl.hidden = true;
  capturaProgresoMini.hidden = false;

  const stream = canvas.captureStream(30);
  const mimeCandidatos = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const mime = mimeCandidatos.find((m) => window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m));

  try {
    captura.mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch (err) {
    log("No se pudo iniciar la grabación: " + err.message, true);
    captura.activa = false;
    btnCapturar.disabled = false;
    btnCapturar.classList.remove("grabando");
    capturaProgresoMini.hidden = true;
    capturaEstadoEl.textContent = "inactivo";
    return;
  }

  captura.mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) captura.chunks.push(e.data);
  };
  captura.mediaRecorder.onstop = finalizarCaptura;
  captura.mediaRecorder.start();

  log("Captura iniciada: grabando 30 s de video (con overlay de datos) + muestras de sensores.");
  actualizarProgresoCaptura();
  captura.timeoutId = setTimeout(detenerCaptura, CAPTURA_DURACION_MS);
}

function detenerCaptura() {
  if (!captura.activa) return;
  clearTimeout(captura.timeoutId);
  cancelAnimationFrame(captura.rafId);
  captura.activa = false;
  if (captura.mediaRecorder && captura.mediaRecorder.state !== "inactive") {
    captura.mediaRecorder.stop();
  }
}

function descargarArchivo(url, nombre) {
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function finalizarCaptura() {
  btnCapturar.disabled = false;
  btnCapturar.classList.remove("grabando");
  capturaProgresoFill.style.width = "0%";
  capturaTiempoEl.textContent = "00:00 / 00:30";
  capturaProgresoMini.hidden = true;
  capturaEstadoEl.textContent = `${captura.muestras.length} muestras`;

  const tipo = (captura.mediaRecorder && captura.mediaRecorder.mimeType) || "video/webm";
  const blobVideo = new Blob(captura.chunks, { type: tipo });
  const urlVideo = URL.createObjectURL(blobVideo);
  const extension = tipo.includes("webm") ? "webm" : "mp4";

  btnDescargarVideo.onclick = () => descargarArchivo(urlVideo, `desnaturalizacion-ia_${Date.now()}.${extension}`);

  btnDescargarDatos.onclick = () => {
    const json = JSON.stringify(captura.muestras, null, 2);
    const blobJson = new Blob([json], { type: "application/json" });
    const urlJson = URL.createObjectURL(blobJson);
    descargarArchivo(urlJson, `desnaturalizacion-ia_${Date.now()}.json`);
    setTimeout(() => URL.revokeObjectURL(urlJson), 4000);
  };

  dibujarChartCaptura(captura.muestras);
  capturaResultadoEl.hidden = false;
  log(`Captura finalizada: ${captura.muestras.length} muestras, video listo para descargar (${(blobVideo.size / 1024).toFixed(0)} KB).`);
}

btnCapturar.addEventListener("click", iniciarCaptura);

/* ---- línea de tiempo discreta (SVG chico, sin panel) de la captura ---- */
/* Un solo trazo — ruido (con marcas en los cambios bruscos) sobre una      */
/* franja de color por segundo — para que quepa como un detalle bajo el    */
/* botón, no como una visualización aparte.                                 */

function dibujarChartCaptura(muestras) {
  const svg = document.getElementById("captura-chart");
  svg.innerHTML = "";
  if (!muestras.length) return;

  const W = 220, H = 40, DUR = 30;
  const yLineaTop = 2, yLineaBottom = 26;
  const yFranja = 30, altoFranja = 8;
  const xDe = (t) => (t / DUR) * W;
  const yDe = (v) => yLineaBottom - (Math.min(100, Math.max(0, v)) / 100) * (yLineaBottom - yLineaTop);

  const crear = (tag, attrs) => {
    const el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  };

  const d = muestras.map((m, i) => `${i === 0 ? "M" : "L"} ${xDe(m.t).toFixed(1)} ${yDe(m.intensidad).toFixed(1)}`).join(" ");
  svg.appendChild(crear("path", { d, class: "chart-line" }));

  muestras.filter((m) => m.cambioBrusco).forEach((m) => {
    svg.appendChild(crear("line", { x1: xDe(m.t), y1: yLineaTop, x2: xDe(m.t), y2: yLineaBottom, class: "chart-tick" }));
  });

  // franja de color: un segmento por segundo, con el último color conocido a esa altura
  for (let s = 0; s < DUR; s++) {
    let ultimo = muestras[0];
    for (const m of muestras) {
      if (m.t > s) break;
      ultimo = m;
    }
    svg.appendChild(crear("rect", {
      x: xDe(s), y: yFranja, width: xDe(s + 1) - xDe(s), height: altoFranja,
      fill: ultimo.colorHex || "#2a2a28",
    }));
  }
}

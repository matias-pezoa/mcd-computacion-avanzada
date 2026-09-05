/* ============================================================
   Desnaturalización IA — instrumento ESP32 multisensor
   Sistema de distorsión: MQTT / USB (entrada) -> reglas -> canvas (salida)

   Plataforma y estilo gráfico tomados de prototipo_desnaturalizacion_ia_project;
   se conserva todo el funcionamiento propio del instrumento multisensor:
     · conexión alternativa por USB / Web Serial (sin MQTT)
     · reconocimiento facial (MediaPipe) — el glitch sigue a la cara
     · glitch avanzado: franjas duplicadas + aberración cromática
     · glitch SOSTENIDO mientras la inclinación se mantiene pasado el umbral
     · escala de profundidad según el eje X del acelerómetro
     · espejo horizontal del video (como videollamada)

   Estructura del archivo:
   01 — CONFIGURACIÓN
   02 — ESCENA (video + canvas)
   02b — RECONOCIMIENTO FACIAL (MediaPipe) — glitch solo en la cara
   03 — CONEXIÓN MQTT
   03b — CONEXIÓN ALTERNATIVA: USB / Web Serial (sin MQTT)
   04 — VISUALIZACIÓN DE LA SEÑAL (forma abstracta / metaballs)
   05 — REGLAS: INPUT -> RELACIÓN -> OUTPUT
   06 — MODO DEMOSTRACIÓN (sin broker)
   07 — INTERFAZ + LOG (menús, ventana fija)
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
  // Grados de inclinación (|ángulo|) a partir de los cuales el glitch de
  // fragmentación queda SOSTENIDO mientras se mantenga esa inclinación,
  // en vez de aparecer solo como flash puntual ante un cambio brusco.
  umbralInclinacionGlitch: 40,
  // Glitch avanzado (franjas duplicadas + aberración cromática): cuántas
  // copias de franjas finas se estampan por pasada, y cuántos píxeles se
  // separan los canales R/B.
  glitchCopias: 8,
  aberracionCromaticaPx: 5,
  // Eje X del acelerómetro -> escala de los fragmentos duplicados (efecto
  // de profundidad: más grande = parece venir "hacia adelante"). 1 = sin
  // efecto, escalaProfundidadMax = tamaño al tope de inclinación en X.
  escalaProfundidadMax: 1.9,
  suavizadoProfundidad: 0.15,
};

const estado = {
  mqttClient: null,
  conectado: false,
  modoDemo: false,
  intensidad: 0, // 0-100, ruido visible en pantalla (derivado de la inclinación), decae en el tiempo
  amplitud: 0, // 0-1, dial manual del potenciómetro/SoftPot: escala ruido y filtro de color
  inclinacion: 0, // último ángulo Y recibido (°), para el overlay de datos durante la captura
  glitchHasta: 0, // timestamp (performance.now) hasta el cual el glitch está activo (flash por cambio brusco)
  glitchSostenido: false, // true mientras |inclinación| > umbralInclinacionGlitch (glitch continuo, no flash)
  inclinacionX: 0, // último valor del eje X (-90 a 90)
  escalaProfundidad: 1, // se acerca suavemente al objetivo derivado de inclinacionX (ver loop)
  colorHex: null, // último color dominante del TCS34725 (null = sensor sin datos aún)
  colorDominante: "—",
  ultimoClientId: null,
};

const CAPTURA_DURACION_MS = 30000;

const captura = {
  activa: false,
  inicio: 0, // performance.now() al arrancar, para calcular t relativo de cada muestra
  muestras: [], // [{ t, inclinacion, cambioBrusco, glitchSostenido, controlValor, colorHex, colorDominante, intensidad }]
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

// El canvas es la pantalla completa (ver .stage-full en style.css): su buffer
// se ajusta al tamaño real del contenedor en vez de usar una resolución fija,
// para que la distorsión se dibuje nítida a cualquier tamaño de ventana.
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
/* 02b — RECONOCIMIENTO FACIAL (MediaPipe) — glitch solo en la cara */
/*                                                                    */
/* Detecta la posición de la cara en cada frame con el FaceDetector   */
/* de MediaPipe (modelo BlazeFace, liviano, corre 100% en el           */
/* navegador, nada se sube a ningún servidor). Mientras está activo,   */
/* aplicarFragmentacion() y aplicarRuido() se restringen a esa región   */
/* (con margen), en vez de cubrir todo el canvas — el glitch "sigue"   */
/* a la cara en vez de distorsionar la imagen completa.                 */
/*                                                                       */
/* Si hay más de una cara, sigue solo la más grande (la más cercana a   */
/* cámara), para que el glitch no salte entre personas.                  */
/* ---------------------------------------------------------- */

let faceDetector = null;
let deteccionFacialActiva = false;
let carasDetectadas = []; // [{x,y,width,height}] en coordenadas de CANVAS

async function activarDeteccionFacial() {
  if (faceDetector) { deteccionFacialActiva = true; return; }
  log("Cargando reconocimiento facial (MediaPipe)…");
  try {
    const { FaceDetector, FilesetResolver } = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs"
    );
    const fileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    faceDetector = await FaceDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
    });
    deteccionFacialActiva = true;
    log("Reconocimiento facial listo: el glitch ahora sigue a la cara.");
  } catch (err) {
    log("No se pudo cargar el reconocimiento facial: " + err.message, true);
    document.getElementById("chk-face-glitch").checked = false;
    deteccionFacialActiva = false;
  }
}

function desactivarDeteccionFacial() {
  deteccionFacialActiva = false;
  carasDetectadas = [];
  cajaSuave = null;
  log("Glitch en toda la imagen (reconocimiento facial desactivado).");
}

document.getElementById("chk-face-glitch").addEventListener("change", (e) => {
  if (e.target.checked) activarDeteccionFacial();
  else desactivarDeteccionFacial();
});

// Convierte un rect en coordenadas de VIDEO (las que entrega MediaPipe, en
// píxeles del video fuente, SIN espejar) a coordenadas de CANVAS, usando el
// mismo encuadre "cover" que ya usa dibujarFrameBase() más abajo — incluido
// el espejo horizontal, para que la región trackeada coincida con la cara
// tal como se ve en pantalla (ya mirror), no con la imagen cruda de la cámara.
function rectVideoACanvas(rect) {
  const escala = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
  const w = video.videoWidth * escala;
  const offX = (canvas.width - w) / 2;
  const offY = (canvas.height - video.videoHeight * escala) / 2;
  const anchoEnCanvas = rect.width * escala;
  return {
    x: offX + w - (rect.originX * escala + anchoEnCanvas), // espejado: refleja X dentro del ancho del video
    y: offY + rect.originY * escala,
    width: anchoEnCanvas,
    height: rect.height * escala,
  };
}

const ALPHA_SUAVIZADO_CARA = 0.35; // 0-1: más alto = sigue más rápido, más nervioso
let cajaSuave = null;

function actualizarDeteccionFacial() {
  if (!deteccionFacialActiva || !faceDetector) return;
  if (video.readyState < 2 || video.videoWidth === 0) return;

  const resultado = faceDetector.detectForVideo(video, performance.now());
  const detecciones = resultado.detections || [];

  if (detecciones.length === 0) {
    cajaSuave = null;
    carasDetectadas = [];
    return;
  }

  const mayor = detecciones.reduce((a, b) =>
    a.boundingBox.width * a.boundingBox.height > b.boundingBox.width * b.boundingBox.height ? a : b
  );
  const caja = rectVideoACanvas(mayor.boundingBox);

  if (!cajaSuave) {
    cajaSuave = caja;
  } else {
    cajaSuave.x += (caja.x - cajaSuave.x) * ALPHA_SUAVIZADO_CARA;
    cajaSuave.y += (caja.y - cajaSuave.y) * ALPHA_SUAVIZADO_CARA;
    cajaSuave.width += (caja.width - cajaSuave.width) * ALPHA_SUAVIZADO_CARA;
    cajaSuave.height += (caja.height - cajaSuave.height) * ALPHA_SUAVIZADO_CARA;
  }

  // Margen alrededor de la caja: el bounding box "ajustado" del detector
  // suele dejar fuera pelo/mentón — se agranda un poco para cubrir la cara completa.
  const margenX = cajaSuave.width * 0.35;
  const margenY = cajaSuave.height * 0.45;
  carasDetectadas = [{
    x: Math.max(0, cajaSuave.x - margenX),
    y: Math.max(0, cajaSuave.y - margenY),
    width: Math.min(canvas.width, cajaSuave.width + margenX * 2),
    height: Math.min(canvas.height, cajaSuave.height + margenY * 2),
  }];
}

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

/* ---------------------------------------------------------- */
/* 03b — CONEXIÓN ALTERNATIVA: USB / Web Serial (sin MQTT)       */
/*                                                                */
/* Lee directo del puerto serie del ESP32 (el mismo cable USB de  */
/* programar). Cada línea JSON que el .ino imprime con             */
/* Serial.println(payload) se parsea y se envía al MISMO           */
/* procesarMensaje() que usa MQTT — el resto del sistema (blob,     */
/* captura, filtro de color) no se entera de dónde vino el dato.    */
/* Requiere Chrome o Edge en computador, y que el Monitor Serie de   */
/* Arduino IDE esté CERRADO (el puerto solo lo puede usar una         */
/* aplicación a la vez).                                              */
/* ---------------------------------------------------------- */

let serialPort = null;

async function conectarSerial() {
  if (!("serial" in navigator)) {
    log("Este navegador no soporta Web Serial. Usa Chrome o Edge en computador.", true);
    return;
  }
  if (estado.mqttClient) {
    estado.mqttClient.end(true);
    estado.mqttClient = null;
  }
  estado.modoDemo = false;

  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 115200 });
    estado.conectado = true;
    setEstadoConexion("conectado");
    log("Conectado por USB/Serial. Si no llegan datos, cierra el Monitor Serie de Arduino IDE.");
    leerSerial();
  } catch (err) {
    log("No se pudo abrir el puerto serial: " + err.message, true);
  }
}

async function leerSerial() {
  const textDecoder = new TextDecoderStream();
  serialPort.readable.pipeTo(textDecoder.writable);
  const reader = textDecoder.readable.getReader();

  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const linea = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!linea) continue;
        try {
          const mensaje = JSON.parse(linea);
          procesarMensaje(mensaje);
        } catch (e) {
          // línea de debug del ESP32 que no es JSON (ej. "[wifi] conectando…") — se ignora
        }
      }
    }
  } catch (err) {
    log("Conexión serial perdida: " + err.message, true);
    estado.conectado = false;
    setEstadoConexion("desconectado");
  } finally {
    reader.releaseLock();
  }
}

document.getElementById("btn-serial").addEventListener("click", conectarSerial);

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
/* Payload esperado (ver instrumento_esp32_multisensor.ino):        */
/*  {                                                               */
/*    "clientId": "instrumento-esp32-01",                          */
/*    "timestamp": 169...,                                         */
/*    "accelX": 1.10, "accelY": -3.24,                             */
/*    "inclinacionX": 6.4,   // ADXL345 eje X -> escala de profundidad */
/*    "inclinacion": 42.1,   // ADXL345 eje Y -> ruido + fragmentación */
/*    "cambioBrusco": false,                                        */
/*    "colorHex": "#B62821", "colorDominante": "rojo",             */
/*    "controlValor": 63.0   // potenciómetro/SoftPot, dial 0-100   */
/*  }                                                               */
/* ---------------------------------------------------------- */

function procesarMensaje(mensaje) {
  estado.ultimoClientId = mensaje.clientId || estado.ultimoClientId;

  const inclinacion = Number(mensaje.inclinacion) || 0;
  const inclinacionX = Number(mensaje.inclinacionX) || 0;
  const cambioBrusco = !!mensaje.cambioBrusco;
  const controlValor = Math.max(0, Math.min(100, Number(mensaje.controlValor) || 0));
  const colorHex = typeof mensaje.colorHex === "string" ? mensaje.colorHex : null;
  const colorDominante = mensaje.colorDominante || "—";

  estado.amplitud = controlValor / 100;
  estado.inclinacion = inclinacion;
  estado.inclinacionX = inclinacionX;
  estado.colorHex = colorHex;
  estado.colorDominante = colorDominante;

  // ruido proporcional al ángulo de inclinación (0-90° -> 0-100), escalado por el dial
  const intensidadInclinacion = Math.min(100, (Math.abs(inclinacion) / 90) * 100);
  const intensidad = intensidadInclinacion * estado.amplitud;
  estado.intensidad = Math.max(estado.intensidad, intensidad); // el cambio brusco se ve, no se pierde entre frames

  // Glitch SOSTENIDO: mientras la inclinación se mantenga más allá del
  // umbral, la fragmentación queda activa de forma continua (no solo el
  // flash puntual que dispara cambioBrusco).
  estado.glitchSostenido = Math.abs(inclinacion) > CONFIG.umbralInclinacionGlitch;

  let regla = "sin alteración (inclinación estable)";
  if (cambioBrusco) {
    estado.glitchHasta = performance.now() + CONFIG.duracionGlitch;
    regla = "cambio brusco → fragmentación del frame";
  } else if (estado.glitchSostenido) {
    regla = `inclinación sostenida (${inclinacion.toFixed(0)}°) → fragmentación continua`;
  } else if (intensidad > CONFIG.umbralInactividad) {
    regla = `inclinación × control → ruido (${controlValor.toFixed(0)}%)`;
  }
  if (colorHex) regla += ` · filtro ${colorDominante}`;

  actualizarVisualizacionBlob(inclinacion, cambioBrusco, controlValor, colorHex);
  actualizarPanelEstado(intensidad, cambioBrusco || estado.glitchSostenido, regla, inclinacion, controlValor, colorHex, colorDominante);
  log(
    `inclinación=${inclinacion.toFixed(0)}° brusco=${cambioBrusco ? "sí" : "no"} sostenido=${estado.glitchSostenido ? "sí" : "no"} control=${controlValor.toFixed(0)} color=${colorDominante} → ${regla}`,
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
      glitchSostenido: estado.glitchSostenido,
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
/* ni de un broker configurado.                                    */
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
  let inclinacionX = 0;
  let control = 40;
  let colorIdx = 0;

  if (demoInterval) clearInterval(demoInterval);
  demoInterval = setInterval(() => {
    inclinacion += (Math.random() - 0.5) * 10;
    inclinacion = Math.max(-80, Math.min(80, inclinacion));

    inclinacionX += (Math.random() - 0.5) * 8;
    inclinacionX = Math.max(-80, Math.min(80, inclinacionX));

    const cambioBrusco = Math.random() < 0.06;
    if (cambioBrusco) inclinacion = Math.max(-85, Math.min(85, inclinacion + (Math.random() - 0.5) * 70));

    control += (Math.random() - 0.5) * 6;
    control = Math.max(0, Math.min(100, control));

    if (Math.random() < 0.02) colorIdx = (colorIdx + 1) % COLORES_DEMO.length;
    const color = COLORES_DEMO[colorIdx];

    procesarMensaje({
      clientId: "demo-local",
      timestamp: Date.now(),
      accelX: 0,
      accelY: 0,
      inclinacion,
      inclinacionX,
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

// Con la ventana "03 · Señal" justo debajo del dock, un panel desplegable
// (Conexión/Registro, 380px de ancho) le queda encima al abrirse. Para que
// no se vean superpuestos, la ventana se opaca mientras haya algún panel
// abierto y vuelve a aparecer al cerrarlo.
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
/* Ventana "03 · Señal" — fija, mismo ancho que el dock, pegada   */
/* justo debajo (ver posicionarVentanaSenalBajoDock). No se        */
/* arrastra ni se redimensiona; solo se puede minimizar.           */
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
// (comparten --dock-w / --dock-edge); acá solo hace falta calcular el top,
// porque la altura del dock varía según el contenido y el ancho de pantalla.
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
/* Cada frame: dibuja el video (espejado), aplica los efectos de  */
/* glitch (fragmentación, franjas duplicadas, aberración cromática */
/* y ruido) — restringidos a la cara si el reconocimiento facial   */
/* está activo — el filtro de color, y decae la intensidad.        */
/* ---------------------------------------------------------- */

function dibujarFrameBase() {
  const listo = video.readyState >= 2 && video.videoWidth > 0;

  // El título del proyecto ocupa el centro mientras no hay fuente activa
  // (ver .stage-title en style.css). Se decide cuadro a cuadro: si la fuente
  // se corta (ej. se desconecta la cámara), el título vuelve a aparecer solo.
  if (stageTitle) stageTitle.hidden = listo;

  if (listo) {
    // "cover": el video llena todo el canvas sin deformarse, recortando el
    // sobrante — el canvas es la pantalla completa y su proporción no
    // coincide con la del video fuente.
    const escala = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const w = video.videoWidth * escala;
    const h = video.videoHeight * escala;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;

    // Espejo horizontal (como una videollamada): se aplica SOLO a este
    // drawImage, no al canvas completo, para que el HUD de grabación (texto)
    // que se dibuja después siga leyéndose normal y no al revés.
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -x - w, y, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// Devuelve dónde deben aplicarse los efectos de glitch: la(s) región(es) de
// la cara si el reconocimiento facial está activo y detectó algo, o el
// canvas completo en cualquier otro caso.
function regionesDeGlitch() {
  if (deteccionFacialActiva && carasDetectadas.length > 0) return carasDetectadas;
  return [{ x: 0, y: 0, width: canvas.width, height: canvas.height }];
}

// Máscara ovalada (elipse matemática inscrita en el rectángulo trackeado),
// no un contorno de landmarks: mucho más simple y robusta. Devuelve null si
// no hay reconocimiento facial activo (en ese caso los efectos usan el
// rectángulo completo, como siempre).
function ovaloActivo() {
  if (!deteccionFacialActiva || carasDetectadas.length === 0) return null;
  const r = carasDetectadas[0];
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, rx: r.width / 2, ry: r.height / 2 };
}

// Ancho del óvalo a la altura y (ecuación de la elipse). Devuelve null si esa
// altura queda fuera del óvalo.
function anchoOvaloEnY(ovalo, y) {
  const t = (y - ovalo.cy) / ovalo.ry;
  if (Math.abs(t) >= 1) return null;
  const mitad = ovalo.rx * Math.sqrt(1 - t * t);
  return { x0: ovalo.cx - mitad, x1: ovalo.cx + mitad };
}

function aplicarRuido(intensidad) {
  if (intensidad <= CONFIG.umbralInactividad) return;
  const cantidad = Math.round((intensidad / 100) * 900);
  ctx.save();
  for (const region of regionesDeGlitch()) {
    for (let i = 0; i < cantidad; i++) {
      const x = region.x + Math.random() * region.width;
      const y = region.y + Math.random() * region.height;
      const size = Math.random() * 2 + 0.5;
      const tono = Math.random() > 0.5 ? 255 : 0;
      ctx.fillStyle = `rgba(${tono},${tono},${tono},${(0.05 + Math.random() * 0.25).toFixed(2)})`;
      ctx.fillRect(x, y, size, size);
    }
    // líneas de barrido para reforzar la sensación de señal degradada
    const lineas = Math.round((intensidad / 100) * 6);
    for (let i = 0; i < lineas; i++) {
      const y = region.y + Math.random() * region.height;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(region.x, y, region.width, 1 + Math.random() * 2);
    }
  }
  ctx.restore();
}

// Fragmentación: el CONTENIDO que se toma (la fuente) se recorta al óvalo
// cuando el reconocimiento facial está activo — solo se distorsiona "cara",
// no fondo. El DESTINO no se recorta a propósito: el desplazamiento puede
// sacar la franja del óvalo (e incluso del rectángulo) hacia afuera, que es
// justo el efecto de "glitch que se sale del borde".
// El eje Y del acelerómetro controla qué tan lejos se desplaza en horizontal.
function aplicarFragmentacion() {
  const ovalo = ovaloActivo();
  const factorY = 0.5 + Math.min(1.5, (Math.abs(estado.inclinacion) / 90) * 1.5);

  for (const region of regionesDeGlitch()) {
    const bandas = 10 + Math.floor(Math.random() * 8);
    const altoBanda = region.height / bandas;
    for (let i = 0; i < bandas; i++) {
      const y = region.y + i * altoBanda;
      const h = altoBanda;

      let sx = region.x, sw = region.width;
      if (ovalo) {
        const corte = anchoOvaloEnY(ovalo, y + h / 2);
        if (!corte) continue; // esta banda cae fuera del óvalo verticalmente
        sx = corte.x0;
        sw = corte.x1 - corte.x0;
      }
      if (sw < 1) continue;

      const desplazamiento = (Math.random() - 0.5) * sw * 0.5 * factorY;
      try {
        const franja = ctx.getImageData(sx, y, sw, h);
        ctx.putImageData(franja, sx + desplazamiento, y); // sin recorte: puede salirse del óvalo
      } catch (err) {
        // getImageData puede fallar por CORS si el video proviene de otro origen sin CORS habilitado
      }
    }
  }
}

// ---- Glitch avanzado (inspirado en retrato de referencia) ----
// Dos capas extra sobre aplicarFragmentacion(): (1) franjas finas que se
// DUPLICAN y estampan varias veces en distintas posiciones (pueden caer
// fuera del óvalo — es el efecto buscado), con su tamaño escalado por el
// eje X (sensación de profundidad/"hacia adelante") y su dispersión
// horizontal escalada por el eje Y — y (2) aberración cromática.

function aplicarFranjasDuplicadas(region) {
  const ovalo = ovaloActivo();
  const factorY = 0.5 + Math.min(1.5, (Math.abs(estado.inclinacion) / 90) * 1.5);
  const escala = estado.escalaProfundidad || 1;

  for (let i = 0; i < CONFIG.glitchCopias; i++) {
    const altoFranja = region.height * (0.03 + Math.random() * 0.07);
    const sy = region.y + Math.random() * Math.max(1, region.height - altoFranja);

    let sx = region.x, sw = region.width;
    if (ovalo) {
      const corte = anchoOvaloEnY(ovalo, sy + altoFranja / 2);
      if (!corte) continue;
      sx = corte.x0;
      sw = corte.x1 - corte.x0;
    }
    if (sw < 1) continue;

    // Tamaño de la copia: escalado por el eje X (más grande = "más cerca").
    const anchoDestino = sw * escala;
    const altoDestino = altoFranja * escala;
    // Posición: dispersión horizontal escalada por el eje Y — puede caer
    // bien fuera del óvalo/rectángulo original, a propósito.
    const dx = region.x + region.width / 2 - anchoDestino / 2
      + (Math.random() - 0.5) * region.width * 1.3 * factorY;
    const dy = sy - (altoDestino - altoFranja) / 2 + (Math.random() - 0.5) * region.height * 0.3;

    try {
      // drawImage del canvas sobre sí mismo: copia una franja ya dibujada
      // y la reestampa (a otra posición y escala) — sin getImageData.
      ctx.drawImage(canvas, sx, sy, sw, altoFranja, dx, dy, anchoDestino, altoDestino);
    } catch (err) {
      // fuera de los límites del canvas: se ignora ese intento
    }
  }
}

function aplicarAberracionCromatica(region) {
  const d = Math.round(CONFIG.aberracionCromaticaPx);
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const w = Math.min(canvas.width - x0, Math.ceil(region.width));
  const h = Math.min(canvas.height - y0, Math.ceil(region.height));
  if (w <= 0 || h <= 0) return;

  try {
    const datos = ctx.getImageData(x0, y0, w, h);
    const salida = ctx.createImageData(w, h);
    const src = datos.data, out = salida.data;

    for (let y = 0; y < h; y++) {
      const filaBase = y * w;
      for (let x = 0; x < w; x++) {
        const iOut = (filaBase + x) * 4;
        const xr = Math.min(w - 1, Math.max(0, x + d));
        const xb = Math.min(w - 1, Math.max(0, x - d));
        const iR = (filaBase + xr) * 4;
        const iG = (filaBase + x) * 4;
        const iB = (filaBase + xb) * 4;
        out[iOut] = src[iR];         // canal rojo, muestreado desplazado hacia un lado
        out[iOut + 1] = src[iG + 1]; // verde, sin desplazar
        out[iOut + 2] = src[iB + 2]; // azul, muestreado desplazado hacia el lado opuesto
        out[iOut + 3] = src[iG + 3];
      }
    }
    ctx.putImageData(salida, x0, y0);
  } catch (err) {
    // getImageData puede fallar por CORS si el video proviene de otro origen sin CORS habilitado
  }
}

function aplicarGlitchAvanzado() {
  for (const region of regionesDeGlitch()) {
    aplicarFranjasDuplicadas(region);
    aplicarAberracionCromatica(region);
  }
}

// Tiñe el frame con el color dominante detectado por el TCS34725. Se usa el
// modo de composición "color" (toma matiz/saturación del tinte y conserva la
// luminosidad del video) para que siga leyéndose la imagen debajo del filtro.
// El dial (controlValor) modula cuánto se nota: nunca desaparece del todo.
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
// muestra por sí solo cómo varió la señal en el tiempo. Se dibuja último.
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
  actualizarDeteccionFacial();
  dibujarFrameBase();

  // Eje X -> escala de profundidad, suavizada para que no salte de golpe.
  const objetivoProfundidad = 1 + (Math.abs(estado.inclinacionX) / 90) * (CONFIG.escalaProfundidadMax - 1);
  estado.escalaProfundidad += (objetivoProfundidad - estado.escalaProfundidad) * CONFIG.suavizadoProfundidad;

  const glitchActivo = performance.now() < estado.glitchHasta || estado.glitchSostenido;
  if (glitchActivo) {
    aplicarFragmentacion();
    aplicarGlitchAvanzado();
  }
  aplicarRuido(estado.intensidad);
  aplicarFiltroColor(estado.colorHex, estado.amplitud);

  const ovalo = ovaloActivo();
  if (ovalo) {
    ctx.save();
    ctx.strokeStyle = "rgba(244,244,241,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(ovalo.cx, ovalo.cy, ovalo.rx, ovalo.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  dibujarHudGrabacion();

  // decaimiento exponencial hacia 0 (la inclinación no queda fija en el tiempo)
  estado.intensidad *= 1 - CONFIG.decaimiento;
  if (estado.intensidad < 0.5) estado.intensidad = 0;

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
log("Sistema listo. Conecta al broker, por USB, o usa el modo demostración.");

/* ---------------------------------------------------------- */
/* 09 — CAPTURA DE SECUENCIA (30 s) + EXPORTAR VIDEO              */
/*                                                                */
/* Vive como un botón directo en el dock (sin ventana ni menú): al   */
/* tocarlo, graba el canvas (ya con el HUD horneado) a .webm vía      */
/* canvas.captureStream() + MediaRecorder, y guarda cada lectura de   */
/* sensor que llega mientras graba. Al terminar, dibuja una línea de  */
/* tiempo discreta y habilita las descargas.                          */
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

  const W = 220, DUR = 30;
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

  muestras.filter((m) => m.cambioBrusco || m.glitchSostenido).forEach((m) => {
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

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
  // Umbral bajo el cual se considera que no hubo respuesta significativa
  // (bajo affectus): la imagen se preserva como contraste.
  umbralInactividad: 6,
  // Duración del efecto de fragmentación al detectar un pico (ms).
  duracionGlitch: 420,
  // Velocidad de decaimiento de la intensidad por frame (0-1, más alto = decae más rápido).
  decaimiento: 0.06,
};

const estado = {
  mqttClient: null,
  conectado: false,
  modoDemo: false,
  intensidad: 0, // 0-100, valor visible que decae en el tiempo
  glitchHasta: 0, // timestamp (performance.now) hasta el cual el glitch está activo
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
/*                                                              */
/* Payload esperado (ver Prototipo_baja_resolucion_...docx):     */
/*  {                                                            */
/*    "clientId": "instrumento-XXXX",                            */
/*    "intensidad": 0-100,   // magnitud de variación biométrica */
/*    "pico": true|false,    // respuesta simpática abrupta      */
/*    "timestamp": 169...                                        */
/*  }                                                             */
/*                                                                */
/* Traducción (Figura 2 del anteproyecto):                       */
/*  intensidad alta y sostenida -> ruido / grano proporcional     */
/*  pico       -> fragmentación y recomposición del frame         */
/*  intensidad bajo umbral -> sin alteración (contraste)          */
/* ---------------------------------------------------------- */

function procesarMensaje(mensaje) {
  const intensidad = Math.max(0, Math.min(100, Number(mensaje.intensidad) || 0));
  const pico = !!mensaje.pico;

  estado.ultimoClientId = mensaje.clientId || estado.ultimoClientId;
  estado.intensidad = Math.max(estado.intensidad, intensidad); // el pico se ve, no se pierde entre frames

  let regla = "sin alteración (bajo affectus)";
  if (pico) {
    estado.glitchHasta = performance.now() + CONFIG.duracionGlitch;
    regla = "pico → fragmentación del frame";
  } else if (intensidad > CONFIG.umbralInactividad) {
    regla = "intensidad → ruido / grano proporcional";
  }

  actualizarPanelEstado(mensaje, intensidad, pico, regla);
  log(
    `intensidad=${intensidad.toFixed(0)} pico=${pico ? "sí" : "no"} → ${regla}`,
    false,
    pico
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

function iniciarModoDemo() {
  if (estado.mqttClient) {
    estado.mqttClient.end(true);
    estado.mqttClient = null;
  }
  estado.modoDemo = true;
  setEstadoConexion("demo");
  log("Modo demostración iniciado: la señal biométrica se simula localmente.");

  let base = 20;
  if (demoInterval) clearInterval(demoInterval);
  demoInterval = setInterval(() => {
    base += (Math.random() - 0.5) * 12;
    base = Math.max(0, Math.min(60, base));
    const ruidoAzar = Math.random() * 15;
    const esPico = Math.random() < 0.08;
    const intensidad = esPico ? 80 + Math.random() * 20 : base + ruidoAzar;

    procesarMensaje({
      clientId: "demo-local",
      intensidad,
      pico: esPico,
      timestamp: Date.now(),
    });
  }, 350);
}

document.getElementById("btn-demo").addEventListener("click", iniciarModoDemo);

/* ---------------------------------------------------------- */
/* 06 — INTERFAZ + LOG                                          */
/* ---------------------------------------------------------- */

function actualizarPanelEstado(mensaje, intensidad, pico, regla) {
  document.getElementById("stat-raw").textContent = JSON.stringify({
    clientId: mensaje.clientId,
    intensidad: Math.round(intensidad),
    pico,
  });
  document.getElementById("stat-intensidad").textContent = intensidad.toFixed(0);
  document.getElementById("stat-pico").textContent = pico ? "sí" : "no";
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

function loop() {
  dibujarFrameBase();

  const glitchActivo = performance.now() < estado.glitchHasta;
  if (glitchActivo) {
    aplicarFragmentacion();
  }
  aplicarRuido(estado.intensidad);

  // decaimiento exponencial hacia 0 (la respuesta biométrica no es un estado permanente)
  estado.intensidad *= 1 - CONFIG.decaimiento;
  if (estado.intensidad < 0.5) estado.intensidad = 0;

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
log("Sistema listo. Conecta al broker o usa el modo demostración para probar las reglas.");

/* ============================================================
   Sesión VJ — desnaturalización IA
   Traduce la data exportada por "05 · Captura" (web/main.js) — o una
   señal sintética equivalente — en visuales generativas sin más
   objetivo que la exploración: no hay una lectura "correcta" del
   dato, cada mutación reescribe cómo se traduce inclinación/brusco/
   control/color en imagen.

   Estructura del archivo:
   01 — ESTADO GLOBAL
   02 — CANVAS (buffers, resize)
   03 — FUENTE: archivo exportado (parseo) + generador sintético
   04 — RELOJ DE REPRODUCCIÓN + MUESTREO DE LA SEÑAL EN EL INSTANTE T
   05 — ENVOLVENTE DE GLITCH (cambioBrusco -> energía que decae)
   06 — MUTACIÓN DE PARÁMETROS VISUALES ("reroll")
   07 — CAPAS VISUALES
   08 — TIPOGRAFÍA DE RUIDO (capa decorativa)
   09 — HUD + LÍNEA DE TIEMPO (DOM)
   10 — LOOP DE RENDER
   11 — INTERFAZ (dock, atajos, drag&drop, fullscreen, blackout)
   ============================================================ */

/* ---------------------------------------------------------- */
/* 01 — ESTADO GLOBAL                                          */
/* ---------------------------------------------------------- */

const state = {
  source: "live", // "live" | "file"
  samples: null, // array del .json exportado, ordenado por t
  duration: 0,
  clock: 0, // segundos, posición de reproducción
  playing: true,
  loop: true,
  speed: 1,
  speeds: [0.5, 1, 2, 4],
  reducedFlash: true,
  blackout: false,
};

let pointerIdx = 0; // último índice de muestra <= state.clock (modo archivo)
let lastFiredIdx = -1; // para detectar cruces de cambioBrusco sin repetir

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, f) => a + (b - a) * f;
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/* ---------------------------------------------------------- */
/* 02 — CANVAS                                                 */
/* ---------------------------------------------------------- */

const stage = document.getElementById("vj-stage");
const canvas = document.getElementById("vj-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const scene = document.createElement("canvas");
const sceneCtx = scene.getContext("2d");

let W = 0,
  H = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  W = stage.clientWidth;
  H = stage.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  scene.width = canvas.width;
  scene.height = canvas.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sceneCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  initParticles();
}
window.addEventListener("resize", resize);

/* ---------------------------------------------------------- */
/* 03 — FUENTE: archivo exportado + generador sintético         */
/* ---------------------------------------------------------- */

const COLORES_VIVO = [
  { hex: "#B62821", dominante: "rojo" },
  { hex: "#2E9E5B", dominante: "verde" },
  { hex: "#2B6FD9", dominante: "azul" },
  { hex: "#9A9A96", dominante: "equilibrado" },
];

const live = { t: 0, inclinacion: 0, control: 40, colorIdx: 0, cooldown: 0.6 };
let liveLastSample = null;

function stepLive(dt) {
  if (dt <= 0) return liveLastSample || stepLive(0.0001);

  live.t += dt;
  live.inclinacion += (Math.random() - 0.5) * 46 * dt;
  live.inclinacion = clamp(live.inclinacion, -85, 85);
  live.control += (Math.random() - 0.5) * 34 * dt;
  live.control = clamp(live.control, 4, 100);
  live.cooldown -= dt;

  let cambioBrusco = false;
  if (live.cooldown <= 0 && Math.random() < 0.22) {
    cambioBrusco = true;
    live.inclinacion = clamp(live.inclinacion + (Math.random() - 0.5) * 150, -90, 90);
    live.cooldown = 0.5 + Math.random() * 1.6;
  }
  if (Math.random() < 0.012) live.colorIdx = (live.colorIdx + 1) % COLORES_VIVO.length;
  const color = COLORES_VIVO[live.colorIdx];

  const intensidadInclinacion = Math.min(100, (Math.abs(live.inclinacion) / 90) * 100);
  const intensidad = intensidadInclinacion * (live.control / 100);

  liveLastSample = {
    t: live.t,
    inclinacion: live.inclinacion,
    controlValor: live.control,
    intensidad,
    colorHex: color.hex,
    colorDominante: color.dominante,
    cambioBrusco,
  };
  return liveLastSample;
}

function cargarArchivo(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const datos = JSON.parse(reader.result);
      if (!Array.isArray(datos) || !datos.length) throw new Error("vacío");
      const limpio = datos
        .filter((m) => m && typeof m.t === "number")
        .map((m) => ({
          t: Number(m.t) || 0,
          inclinacion: Number(m.inclinacion) || 0,
          controlValor: clamp(Number(m.controlValor) || 0, 0, 100),
          intensidad: clamp(Number(m.intensidad) || 0, 0, 100),
          colorHex: typeof m.colorHex === "string" ? m.colorHex : "#9A9A96",
          colorDominante: m.colorDominante || "—",
          cambioBrusco: !!m.cambioBrusco,
        }))
        .sort((a, b) => a.t - b.t);
      if (!limpio.length) throw new Error("sin muestras válidas");

      state.samples = limpio;
      state.duration = limpio[limpio.length - 1].t || 1;
      state.source = "file";
      state.clock = 0;
      state.playing = true;
      pointerIdx = 0;
      lastFiredIdx = -1;
      setEstado(`Archivo cargado: ${limpio.length} muestras, ${state.duration.toFixed(1)}s.`, false);
      setFuenteUI("archivo", file.name);
      dibujarLineaTiempo();
      ocultarIntro();
    } catch (err) {
      setEstado(`No se pudo leer el archivo: ${err.message}. Se mantiene la señal sintética.`, true);
    }
  };
  reader.onerror = () => setEstado("Error leyendo el archivo.", true);
  reader.readAsText(file);
}

function volverADemo() {
  state.source = "live";
  state.samples = null;
  state.duration = 0;
  live.t = 0;
  live.cooldown = 0.6;
  setFuenteUI("vivo");
  setEstado("Señal sintética corriendo — sin archivo cargado.", false);
  document.getElementById("vj-scrub").hidden = true;
  document.getElementById("vj-timecode").textContent = "en vivo";
}

/* ---------------------------------------------------------- */
/* 04 — RELOJ DE REPRODUCCIÓN + MUESTREO                        */
/* ---------------------------------------------------------- */

function avanzarYMuestrear(dt) {
  if (state.source === "file" && state.samples && state.samples.length) {
    if (state.playing) state.clock += dt;
    const dur = Math.max(state.duration, 0.0001);
    if (state.clock >= dur) {
      if (state.loop) {
        state.clock = state.samples.length > 1 ? state.clock % dur : 0;
        pointerIdx = 0;
        lastFiredIdx = -1;
      } else {
        state.clock = dur;
        state.playing = false;
      }
    }
    const s = state.samples;
    if (pointerIdx >= s.length - 1 || s[pointerIdx].t > state.clock) {
      pointerIdx = 0;
      if (lastFiredIdx > 0) lastFiredIdx = -1; // salto hacia atrás (loop/scrub): no redisparar en cascada
    }
    while (pointerIdx < s.length - 2 && s[pointerIdx + 1].t <= state.clock) pointerIdx++;

    let cambioBrusco = false;
    if (pointerIdx > lastFiredIdx) {
      for (let k = Math.max(lastFiredIdx + 1, 0); k <= pointerIdx; k++) {
        if (s[k] && s[k].cambioBrusco) cambioBrusco = true;
      }
    }
    lastFiredIdx = pointerIdx;

    const a = s[pointerIdx];
    const b = s[Math.min(pointerIdx + 1, s.length - 1)];
    const span = Math.max(0.0001, b.t - a.t);
    const f = clamp((state.clock - a.t) / span, 0, 1);
    return {
      t: state.clock,
      inclinacion: lerp(a.inclinacion, b.inclinacion, f),
      controlValor: lerp(a.controlValor, b.controlValor, f),
      intensidad: lerp(a.intensidad, b.intensidad, f),
      colorHex: a.colorHex,
      colorDominante: a.colorDominante,
      cambioBrusco,
    };
  }
  return stepLive(state.playing ? dt : 0);
}

function saltarEnArchivo(fraccion) {
  if (state.source !== "file" || !state.samples) return;
  state.clock = clamp(fraccion, 0, 1) * state.duration;
  pointerIdx = 0;
  lastFiredIdx = -1;
}

/* ---------------------------------------------------------- */
/* 05 — ENVOLVENTE DE GLITCH                                    */
/* ---------------------------------------------------------- */

let glitchEnergy = 0;
let lastFlashAt = -Infinity;
let sliceGlitchFrames = 0;

function actualizarEnvolvente(dt, sample) {
  glitchEnergy *= Math.exp(-dt * 3.4);
  if (sample && sample.cambioBrusco) {
    glitchEnergy = Math.min(1, glitchEnergy + 0.85);
    dispararBrusco();
  }
}

function dispararBrusco() {
  impulsarParticulas();
  sliceGlitchFrames = 3 + ((Math.random() * 4) | 0);
  const now = performance.now();
  const minInterval = state.reducedFlash ? 420 : 160;
  if (now - lastFlashAt > minInterval) {
    lastFlashAt = now;
    flashAlpha = state.reducedFlash ? 0.16 : 0.45 + Math.random() * 0.2;
  }
}

let flashAlpha = 0;

/* ---------------------------------------------------------- */
/* 06 — MUTACIÓN DE PARÁMETROS VISUALES                         */
/* ---------------------------------------------------------- */

const mutation = {};

function mutar() {
  mutation.paletteMode = pick(["dato", "acido", "mono", "invertido"]);
  mutation.trailAlpha = 0.05 + Math.random() * 0.16; // más alto = se borra más rápido (menos estela)
  mutation.grainDensity = 0.5 + Math.random() * 1.6;
  mutation.chromaAmount = Math.random() < 0.25 ? 0 : 1 + Math.random() * 5;
  mutation.scanlines = Math.random() < 0.7;
  mutation.waveform = Math.random() < 0.65;
  mutation.particleStyle = pick(["linea", "punto", "estela"]);
  mutation.washBlend = pick(["screen", "overlay", "difference", "exclusion"]);
  mutation.particleBlend = pick(["lighten", "screen", "source-over"]);
  mutation.turbulence = 0.5 + Math.random() * 2.4;
  mutation.textoRuido = Math.random() < 0.75;
  setEstado(
    `Mutación aplicada — paleta ${mutation.paletteMode}, partícula ${mutation.particleStyle}, mezcla ${mutation.washBlend}.`,
    false
  );
}

function colorMutado(sample) {
  switch (mutation.paletteMode) {
    case "acido":
      return "#c1ff72";
    case "mono":
      return "#f4f4f1";
    case "invertido":
      return invertirHex(sample.colorHex);
    default:
      return sample.colorHex || "#c1ff72";
  }
}

function invertirHex(hex) {
  if (!hex) return "#c1ff72";
  const n = parseInt(hex.slice(1), 16);
  const inv = 0xffffff ^ n;
  return "#" + inv.toString(16).padStart(6, "0");
}

/* ---------------------------------------------------------- */
/* 07 — CAPAS VISUALES                                          */
/* ---------------------------------------------------------- */

let particles = [];
const PARTICLE_MAX = 260;

function initParticles() {
  particles = new Array(PARTICLE_MAX).fill(0).map(() => ({
    x: Math.random() * W,
    y: Math.random() * H,
    vx: 0,
    vy: 0,
  }));
}

function impulsarParticulas() {
  for (const p of particles) {
    const a = Math.random() * Math.PI * 2;
    const f = 3 + Math.random() * 6;
    p.vx += Math.cos(a) * f;
    p.vy += Math.sin(a) * f;
  }
}

function dibujarParticulas(sample, dt) {
  const count = clamp(30 + (sample.controlValor / 100) * (PARTICLE_MAX - 30), 30, PARTICLE_MAX) | 0;
  const angle = ((sample.inclinacion || 0) / 90) * (Math.PI / 2);
  const speed = (10 + (sample.intensidad / 100) * 70) * mutation.turbulence * dt;
  const color = colorMutado(sample);

  sceneCtx.save();
  sceneCtx.globalCompositeOperation = mutation.particleBlend;
  sceneCtx.strokeStyle = color;
  sceneCtx.fillStyle = color;

  for (let i = 0; i < count; i++) {
    const p = particles[i];
    const turb = mutation.turbulence * (0.4 + sample.intensidad / 140);
    p.vx += (Math.cos(angle) * speed - p.vx) * 0.06 + (Math.random() - 0.5) * turb;
    p.vy += (Math.sin(angle) * speed - p.vy) * 0.06 + (Math.random() - 0.5) * turb;
    p.vx *= 0.94;
    p.vy *= 0.94;

    const px = p.x,
      py = p.y;
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0) p.x += W;
    if (p.x > W) p.x -= W;
    if (p.y < 0) p.y += H;
    if (p.y > H) p.y -= H;

    sceneCtx.globalAlpha = 0.35 + (sample.intensidad / 100) * 0.5;
    if (mutation.particleStyle === "punto") {
      sceneCtx.beginPath();
      sceneCtx.arc(p.x, p.y, 1.1 + sample.intensidad / 60, 0, Math.PI * 2);
      sceneCtx.fill();
    } else {
      sceneCtx.lineWidth = mutation.particleStyle === "estela" ? 2 : 1;
      sceneCtx.beginPath();
      sceneCtx.moveTo(px, py);
      sceneCtx.lineTo(p.x, p.y);
      sceneCtx.stroke();
    }
  }
  sceneCtx.restore();
}

function dibujarVeloColor(sample) {
  const color = colorMutado(sample);
  const alpha = 0.06 + (sample.controlValor / 100) * 0.22;
  sceneCtx.save();
  sceneCtx.globalCompositeOperation = mutation.washBlend;
  sceneCtx.globalAlpha = alpha;
  sceneCtx.fillStyle = color;
  sceneCtx.fillRect(0, 0, W, H);
  sceneCtx.restore();
}

function dibujarGrano(sample) {
  const n = Math.floor((10 + (sample.intensidad / 100) * 220) * mutation.grainDensity);
  sceneCtx.save();
  sceneCtx.globalCompositeOperation = "lighten";
  for (let i = 0; i < n; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const s = Math.random() * 1.6 + 0.3;
    sceneCtx.globalAlpha = Math.random() * 0.5;
    sceneCtx.fillStyle = Math.random() < 0.5 ? "#fff" : "#888";
    sceneCtx.fillRect(x, y, s, s);
  }
  sceneCtx.restore();
}

const waveHistory = [];
function dibujarOsciloscopio(sample) {
  if (!mutation.waveform) return;
  waveHistory.push(sample.intensidad);
  if (waveHistory.length > 240) waveHistory.shift();
  const baseY = H - 40;
  const amp = 34;
  sceneCtx.save();
  sceneCtx.globalCompositeOperation = "lighten";
  sceneCtx.strokeStyle = colorMutado(sample);
  sceneCtx.globalAlpha = 0.5;
  sceneCtx.lineWidth = 1.2;
  sceneCtx.beginPath();
  waveHistory.forEach((v, i) => {
    const x = (i / 239) * W;
    const y = baseY - (v / 100) * amp;
    if (i === 0) sceneCtx.moveTo(x, y);
    else sceneCtx.lineTo(x, y);
  });
  sceneCtx.stroke();
  sceneCtx.restore();
}

function dibujarSliceGlitch() {
  if (sliceGlitchFrames <= 0) return;
  sliceGlitchFrames--;
  const bands = 2 + ((Math.random() * 5) | 0);
  for (let i = 0; i < bands; i++) {
    const y = Math.random() * H;
    const h = 3 + Math.random() * 46;
    const dx = (Math.random() - 0.5) * 120;
    try {
      ctx.drawImage(canvas, 0, y * (canvas.height / H), canvas.width, h * (canvas.height / H), dx, y, W, h);
    } catch (e) {
      /* fuente de imagen inválida en algún frame de resize: se ignora, el próximo frame ya está bien */
    }
  }
}

function compositarEscena(sample) {
  // 1. estela: se aclara/oscurece el buffer persistente en vez de limpiarlo
  ctx.save();
  ctx.globalAlpha = mutation.trailAlpha;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // 2. capa fresca (partículas, velo, grano, osciloscopio) sobre el buffer persistente
  ctx.drawImage(scene, 0, 0, W, H);

  // 3. aberración cromática: copias desplazadas de la capa fresca, sin acumular brillo sin control
  if (mutation.chromaAmount > 0) {
    const amt = mutation.chromaAmount * (0.4 + glitchEnergy);
    ctx.save();
    ctx.globalCompositeOperation = "lighten";
    ctx.globalAlpha = 0.4;
    ctx.drawImage(scene, -amt, 0, W, H);
    ctx.drawImage(scene, amt, 0, W, H);
    ctx.restore();
  }

  // 4. datamosh: franjas horizontales autorreferenciadas sobre el buffer persistente
  dibujarSliceGlitch();

  // 5. scanlines
  if (mutation.scanlines) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#000";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.restore();
  }

  // 6. destello (rate-limited, ver dispararBrusco)
  if (flashAlpha > 0.002) {
    ctx.save();
    ctx.globalCompositeOperation = "lighten";
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle = mutation.paletteMode === "mono" ? "#fff" : colorMutado(sample);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    flashAlpha *= 0.82;
  }
}

/* ---------------------------------------------------------- */
/* 08 — TIPOGRAFÍA DE RUIDO (decorativa, sobre el canvas)        */
/* ---------------------------------------------------------- */

let ruidoTexto = [];
let ruidoTimer = 0;
const HEX_CHARS = "0123456789ABCDEF";

function refrescarRuidoTexto(sample) {
  const n = 4 + ((glitchEnergy * 10) | 0);
  ruidoTexto = new Array(n).fill(0).map(() => {
    let str = "";
    const len = 4 + ((Math.random() * 8) | 0);
    for (let i = 0; i < len; i++) str += HEX_CHARS[(Math.random() * 16) | 0];
    return {
      str,
      x: Math.random() * W,
      y: Math.random() * H,
    };
  });
}

function dibujarTipografiaRuido(sample, dt) {
  if (!mutation.textoRuido) return;
  ruidoTimer -= dt;
  if (ruidoTimer <= 0) {
    refrescarRuidoTexto(sample);
    ruidoTimer = 0.14 + Math.random() * 0.12;
  }
  ctx.save();
  ctx.font = '10px "TT Autonomous Mono Trial", monospace';
  ctx.globalAlpha = 0.16 + glitchEnergy * 0.35;
  ctx.fillStyle = colorMutado(sample);
  for (const t of ruidoTexto) ctx.fillText(t.str, t.x, t.y);
  ctx.restore();
}

/* ---------------------------------------------------------- */
/* 09 — AVISO TRANSITORIO + LÍNEA DE TIEMPO (DOM)                */
/*                                                                */
/* Deliberadamente sin readout de datos en vivo (ni ángulos ni   */
/* porcentajes): la pieza es material gráfico, no un instrumento. */
/* El toast solo confirma carga de archivos o errores, y se apaga  */
/* solo.                                                           */
/* ---------------------------------------------------------- */

const toastEl = document.getElementById("vj-toast");
const scrubEl = document.getElementById("vj-scrub");
const scrubHead = document.getElementById("vj-scrub-head");
let toastTimer = null;

function setEstado(msg, esError) {
  toastEl.textContent = msg;
  toastEl.classList.toggle("is-error", !!esError);
  toastEl.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("on"), esError ? 4200 : 2600);
}

function setFuenteUI(tipo) {
  scrubEl.hidden = tipo !== "archivo";
}

function actualizarScrubHead() {
  if (state.source !== "file" || scrubEl.hidden) return;
  scrubHead.style.left = clamp((state.clock / state.duration) * 100, 0, 100) + "%";
}

function dibujarLineaTiempo() {
  const svg = document.getElementById("vj-scrub-svg");
  svg.innerHTML = "";
  if (!state.samples || !state.samples.length) return;
  const dur = Math.max(state.duration, 0.0001);
  const pts = state.samples.map((m) => `${(m.t / dur) * 1000},${100 - (m.intensidad / 100) * 96}`);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "vj-scrub-path");
  path.setAttribute("d", "M " + pts.join(" L "));
  svg.appendChild(path);

  state.samples
    .filter((m) => m.cambioBrusco)
    .forEach((m) => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      const x = (m.t / dur) * 1000;
      line.setAttribute("class", "vj-scrub-brusco");
      line.setAttribute("x1", x);
      line.setAttribute("x2", x);
      line.setAttribute("y1", 0);
      line.setAttribute("y2", 100);
      svg.appendChild(line);
    });
}

function ocultarIntro() {
  const intro = document.getElementById("vj-intro");
  if (intro.hasAttribute("hidden")) return;
  intro.classList.add("vj-fade");
  setTimeout(() => intro.setAttribute("hidden", ""), 650);
}

/* ---------------------------------------------------------- */
/* 10 — LOOP DE RENDER                                          */
/* ---------------------------------------------------------- */

let lastFrame = performance.now();
const blackoutLayer = document.getElementById("vj-blackout");

function frame(now) {
  requestAnimationFrame(frame);
  const dtRaw = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (state.blackout) return; // el canvas queda tal cual, la capa negra lo tapa

  const dt = dtRaw * state.speed;
  const sample = avanzarYMuestrear(dt);

  if (state.playing) {
    actualizarEnvolvente(dt, sample);
    sceneCtx.clearRect(0, 0, W, H);
    dibujarVeloColor(sample);
    dibujarParticulas(sample, dtRaw);
    dibujarGrano(sample);
    dibujarOsciloscopio(sample);
    compositarEscena(sample);
    dibujarTipografiaRuido(sample, dtRaw);
  }
  actualizarHud(sample);
}

/* ---------------------------------------------------------- */
/* 11 — INTERFAZ                                                */
/* ---------------------------------------------------------- */

const btnPlay = document.getElementById("vj-btn-play");
const btnLoop = document.getElementById("vj-btn-loop");
const btnSpeed = document.getElementById("vj-btn-speed");
const btnMutar = document.getElementById("vj-btn-mutar");
const btnFlash = document.getElementById("vj-btn-flash");
const btnBlackout = document.getElementById("vj-btn-blackout");
const btnFull = document.getElementById("vj-btn-full");
const btnDemo = document.getElementById("vj-btn-demo");
const fileInput = document.getElementById("vj-file-input");

function togglePlay() {
  state.playing = !state.playing;
  btnPlay.textContent = state.playing ? "Pausa" : "Reanudar";
}
function toggleLoop() {
  state.loop = !state.loop;
  btnLoop.classList.toggle("active", state.loop);
}
function ciclarVelocidad() {
  const i = state.speeds.indexOf(state.speed);
  state.speed = state.speeds[(i + 1) % state.speeds.length];
  btnSpeed.textContent = `Velocidad ${state.speed}×`;
}
function toggleFlash() {
  state.reducedFlash = !state.reducedFlash;
  btnFlash.textContent = `Destellos: ${state.reducedFlash ? "mín" : "full"}`;
  btnFlash.classList.toggle("active", state.reducedFlash);
}
function toggleBlackout() {
  state.blackout = !state.blackout;
  blackoutLayer.classList.toggle("on", state.blackout);
  btnBlackout.classList.toggle("active", state.blackout);
}
function toggleFullscreen() {
  if (!document.fullscreenElement) stage.requestFullscreen?.();
  else document.exitFullscreen?.();
}

btnPlay.addEventListener("click", togglePlay);
btnLoop.addEventListener("click", toggleLoop);
btnSpeed.addEventListener("click", ciclarVelocidad);
btnMutar.addEventListener("click", mutar);
btnFlash.addEventListener("click", toggleFlash);
btnBlackout.addEventListener("click", toggleBlackout);
btnFull.addEventListener("click", toggleFullscreen);
btnDemo.addEventListener("click", () => {
  volverADemo();
  btnDemo.classList.add("active");
  ocultarIntro();
});

fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) {
    cargarArchivo(file);
    btnDemo.classList.remove("active");
  }
});

["dragover", "dragenter"].forEach((ev) =>
  stage.addEventListener(ev, (e) => {
    e.preventDefault();
  })
);
stage.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) {
    cargarArchivo(file);
    btnDemo.classList.remove("active");
  }
});

// scrub: click/arrastre sobre la línea de tiempo (solo con archivo cargado)
let arrastrandoScrub = false;
function scrubDesdeEvento(e) {
  const rect = scrubEl.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  saltarEnArchivo(x / rect.width);
}
scrubEl.addEventListener("mousedown", (e) => {
  arrastrandoScrub = true;
  scrubDesdeEvento(e);
});
window.addEventListener("mousemove", (e) => {
  if (arrastrandoScrub) scrubDesdeEvento(e);
});
window.addEventListener("mouseup", () => (arrastrandoScrub = false));
scrubEl.addEventListener("touchstart", scrubDesdeEvento, { passive: true });
scrubEl.addEventListener("touchmove", scrubDesdeEvento, { passive: true });

window.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  switch (e.key.toLowerCase()) {
    case " ":
      e.preventDefault();
      togglePlay();
      break;
    case "m":
      mutar();
      break;
    case "l":
      toggleLoop();
      break;
    case "b":
      toggleBlackout();
      break;
    case "f":
      toggleFullscreen();
      break;
    case "arrowright":
      if (state.source === "file") saltarEnArchivo((state.clock + 5) / state.duration);
      break;
    case "arrowleft":
      if (state.source === "file") saltarEnArchivo((state.clock - 5) / state.duration);
      break;
  }
});

document.addEventListener(
  "pointerdown",
  () => {
    ocultarIntro();
  },
  { once: true }
);

/* ---------------------------------------------------------- */
/* ARRANQUE                                                     */
/* ---------------------------------------------------------- */

resize();
mutar();
setFuenteUI("vivo");
requestAnimationFrame(frame);

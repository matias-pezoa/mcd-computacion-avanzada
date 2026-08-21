import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ======================================================
// 01 — PARÁMETROS
// ======================================================

const valoresIniciales = {
  columnas: 15,
  filas: 15,
  separacion: 1.2,
  amplitud: 5.0,
  frecuencia: 0.15,
  rotacion: 0.3,
  aleatoriedad: 0.0,
  semilla: 42,
  atractorActivo: false,
  atractorFuerza: 3.0,
  atractorRadio: 6.0,
  atractorFrecuencia: 0.6,
  atractorX: 0,
  atractorZ: 0,
  microfonoActivo: false,
  microfonoFuerza: 2.0,
};

const colorAtractorInicial = "#ff5a3c";

const parametros = { ...valoresIniciales };

// ======================================================
// 02 — ESCENA
// ======================================================

const viewport = document.querySelector("#viewport");

const escena = new THREE.Scene();
escena.background = new THREE.Color(0x0b0b0c);

const camara = new THREE.PerspectiveCamera(
  42,
  viewport.clientWidth / viewport.clientHeight,
  0.1,
  200
);

camara.position.set(18, 16, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

viewport.appendChild(renderer.domElement);

const controlesOrbita = new OrbitControls(camara, renderer.domElement);
controlesOrbita.enableDamping = true;
controlesOrbita.target.set(0, 1.2, 0);

// Iluminación general.
const luzHemisferica = new THREE.HemisphereLight(0xf3efe5, 0x202229, 1.7);
escena.add(luzHemisferica);

// Luz principal.
const luzPrincipal = new THREE.DirectionalLight(0xffffff, 3.1);
luzPrincipal.position.set(8, 14, 9);
luzPrincipal.castShadow = true;
escena.add(luzPrincipal);

// Luz secundaria para suavizar el contraste.
const luzRelleno = new THREE.DirectionalLight(0xc8d8ff, 0.8);
luzRelleno.position.set(-8, 6, -6);
escena.add(luzRelleno);

// Plano base.
const suelo = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({
    color: 0x101114,
    roughness: 1,
    metalness: 0,
  })
);

suelo.rotation.x = -Math.PI / 2;
suelo.position.y = -0.03;
suelo.receiveShadow = true;
escena.add(suelo);

// Grilla de referencia para leer mejor escala y posición.
const grilla = new THREE.GridHelper(50, 50, 0x35383d, 0x202227);
grilla.position.y = 0.001;
escena.add(grilla);

// ======================================================
// 03 — OBJETO GENERATIVO
// ======================================================

const grupoCampo = new THREE.Group();
escena.add(grupoCampo);

const geometriaModulo = new THREE.SphereGeometry(0.5, 20, 14);

const materialModulo = new THREE.MeshStandardMaterial({
  color: 0xd7d2c8,
  roughness: 0.58,
  metalness: 0.03,
});

// Color que tiñe los módulos dentro del radio de influencia del atractor.
let colorAtractor = new THREE.Color(colorAtractorInicial);

// Marcador visual de la posición del punto atractor.
const marcadorAtractor = new THREE.Mesh(
  new THREE.SphereGeometry(0.35, 20, 20),
  new THREE.MeshStandardMaterial({
    color: colorAtractor,
    emissive: colorAtractor,
    emissiveIntensity: 0.6,
    roughness: 0.3,
  })
);
marcadorAtractor.position.set(0, 0.35, 0);
marcadorAtractor.visible = false;
escena.add(marcadorAtractor);

function actualizarMarcadorAtractor() {
  marcadorAtractor.visible = parametros.atractorActivo;
  marcadorAtractor.position.set(parametros.atractorX, 0.35, parametros.atractorZ);
  marcadorAtractor.material.color.copy(colorAtractor);
  marcadorAtractor.material.emissive.copy(colorAtractor);
}

// ======================================================
// 04 — REGLAS GENERATIVAS
// ======================================================
// Estas funciones representan decisiones de diseño.
// Si cambian estas reglas, cambia la familia de resultados.

// Regla A:
// posición → distancia al origen de onda → onda → tamaño
// El origen de la onda y su frecuencia se desplazan hacia el atractor
// cuando está activo: la onda "nace" en el punto atractor y se
// vuelve más rápida cerca de él.
function calcularAlturaModulo(x, z, influenciaAtractor) {
  const origenOnda = parametros.atractorActivo
    ? { x: parametros.atractorX, z: parametros.atractorZ }
    : { x: 0, z: 0 };

  const dxOnda = x - origenOnda.x;
  const dzOnda = z - origenOnda.z;
  const distancia = Math.sqrt(dxOnda * dxOnda + dzOnda * dzOnda);

  const frecuenciaEfectiva =
    parametros.frecuencia + influenciaAtractor * parametros.atractorFrecuencia;

  const onda = Math.sin(distancia * frecuenciaEfectiva) * parametros.amplitud;

  const ruido =
    aleatoriedadConSemilla(x, z, parametros.semilla) *
    parametros.aleatoriedad;

  const empuje = influenciaAtractor * parametros.atractorFuerza;

  return Math.max(0.25, 1.2 + onda + ruido + empuje);
}

// Regla B:
// la orientación depende de la dirección radial respecto al centro.
function calcularRotacionModulo(x, z) {
  const direccion = Math.atan2(z, x);
  return direccion * parametros.rotacion;
}

// Regla C:
// posición → distancia al punto atractor → intensidad (0..1).
// Esta intensidad se usa luego para elevar y teñir los módulos cercanos.
function calcularInfluenciaAtractor(x, z) {
  if (!parametros.atractorActivo) return 0;

  const dx = x - parametros.atractorX;
  const dz = z - parametros.atractorZ;
  const distancia = Math.sqrt(dx * dx + dz * dz);

  const caida = Math.max(0, 1 - distancia / parametros.atractorRadio);

  // Se eleva al cuadrado para suavizar el borde del área de influencia.
  return caida * caida;
}

// ======================================================
// 05 — GENERAR CAMPO
// ======================================================

function generarCampo() {
  limpiarCampo();

  const ancho = (parametros.columnas - 1) * parametros.separacion;
  const profundidad = (parametros.filas - 1) * parametros.separacion;

  for (let columna = 0; columna < parametros.columnas; columna++) {
    for (let fila = 0; fila < parametros.filas; fila++) {
      const x = columna * parametros.separacion - ancho / 2;
      const z = fila * parametros.separacion - profundidad / 2;

      const influenciaAtractor = calcularInfluenciaAtractor(x, z);
      const altura = calcularAlturaModulo(x, z, influenciaAtractor);
      const rotacion = calcularRotacionModulo(x, z);

      const modulo = new THREE.Mesh(geometriaModulo, materialModulo);

      // Los módulos dentro del radio del atractor reciben un material propio
      // teñido hacia el color del atractor; el resto comparte el material base.
      if (influenciaAtractor > 0) {
        modulo.material = new THREE.MeshStandardMaterial({
          color: materialModulo.color.clone().lerp(colorAtractor, influenciaAtractor),
          roughness: 0.58,
          metalness: 0.03,
        });
      }

      // Escalamos en las tres dimensiones: el "tamaño" de la esfera
      // reemplaza a la altura de la barra original.
      modulo.scale.setScalar(altura);

      // La esfera crece desde su centro en todas direcciones.
      // Por eso la elevamos la mitad de su tamaño para que apoye en el suelo.
      const yBase = altura / 2;
      modulo.position.set(x, yBase, z);

      // Guardamos la posición de reposo y una fase propia: el micrófono
      // desplaza cada módulo verticalmente a partir de estos valores.
      modulo.userData.yBase = yBase;
      modulo.userData.fase = (x + z) * 0.6;

      modulo.rotation.y = rotacion;
      modulo.castShadow = true;
      modulo.receiveShadow = true;

      grupoCampo.add(modulo);
    }
  }
}

function limpiarCampo() {
  while (grupoCampo.children.length > 0) {
    grupoCampo.remove(grupoCampo.children[0]);
  }
}

// ======================================================
// 06 — ALEATORIEDAD CONTROLADA
// ======================================================
// Devuelve un valor repetible entre -1 y 1.
// Una misma semilla produce siempre el mismo patrón.

function aleatoriedadConSemilla(x, z, semilla) {
  const valor =
    Math.sin(
      x * 12.9898 +
      z * 78.233 +
      semilla * 37.719
    ) * 43758.5453;

  const normalizado = valor - Math.floor(valor);

  return normalizado * 2 - 1;
}

// ======================================================
// 06B — ATRACTOR: UBICACIÓN POR CLICK
// ======================================================
// Un click sobre el suelo proyecta un rayo desde la cámara y calcula
// dónde cruza el plano y=0. Ese punto pasa a ser el atractor.

const raycaster = new THREE.Raycaster();
const planoSuelo = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const puntoInterseccion = new THREE.Vector3();
let inicioPuntero = null;

function obtenerCoordenadasNormalizadas(evento) {
  const rect = renderer.domElement.getBoundingClientRect();

  return new THREE.Vector2(
    ((evento.clientX - rect.left) / rect.width) * 2 - 1,
    -((evento.clientY - rect.top) / rect.height) * 2 + 1
  );
}

renderer.domElement.addEventListener("pointerdown", (evento) => {
  // Solo el click izquierdo ubica el atractor; el derecho desplaza la cámara.
  if (evento.button !== 0) return;

  inicioPuntero = { x: evento.clientX, y: evento.clientY };
});

renderer.domElement.addEventListener("pointerup", (evento) => {
  if (!inicioPuntero) return;

  const distanciaArrastre = Math.hypot(
    evento.clientX - inicioPuntero.x,
    evento.clientY - inicioPuntero.y
  );

  inicioPuntero = null;

  // Si el puntero se movió lo suficiente, fue un arrastre de cámara
  // (OrbitControls), no un intento de ubicar el atractor.
  if (distanciaArrastre > 4) return;

  raycaster.setFromCamera(obtenerCoordenadasNormalizadas(evento), camara);

  if (!raycaster.ray.intersectPlane(planoSuelo, puntoInterseccion)) return;

  parametros.atractorX = puntoInterseccion.x;
  parametros.atractorZ = puntoInterseccion.z;
  parametros.atractorActivo = true;

  controlAtractorActivo.checked = true;
  actualizarPosicionAtractorUI();
  actualizarMarcadorAtractor();
  generarCampo();
});

// ======================================================
// 06C — MICRÓFONO: MOVIMIENTO VERTICAL
// ======================================================
// El volumen del micrófono controla cuánto "flotan" los módulos.
// Cada módulo tiene su propia fase, así el movimiento se ve como
// una ola que recorre el campo en lugar de un salto rígido.

let flujoMicrofono = null;
let analizadorMicrofono = null;
let datosMicrofono = null;
let nivelMicrofono = 0;

async function activarMicrofono() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    // Ocurre en contextos no seguros: abrir index.html con file:// en vez
    // de servirlo desde http://localhost (Live Server u otro servidor).
    salidaMicrofonoEstado.textContent =
      "El navegador bloqueó el micrófono: abre el proyecto con un servidor local (http://localhost), no con file://";
    return;
  }

  try {
    flujoMicrofono = await navigator.mediaDevices.getUserMedia({ audio: true });

    const contextoAudio = new (window.AudioContext || window.webkitAudioContext)();
    if (contextoAudio.state === "suspended") await contextoAudio.resume();

    const fuente = contextoAudio.createMediaStreamSource(flujoMicrofono);

    analizadorMicrofono = contextoAudio.createAnalyser();
    analizadorMicrofono.fftSize = 256;
    datosMicrofono = new Uint8Array(analizadorMicrofono.frequencyBinCount);

    fuente.connect(analizadorMicrofono);

    parametros.microfonoActivo = true;
    controlMicrofonoActivar.textContent = "Detener micrófono";
    salidaMicrofonoEstado.textContent = "Escuchando…";
  } catch (error) {
    console.error("Error al activar el micrófono:", error);

    const mensajes = {
      NotAllowedError: "Permiso denegado. Habilita el micrófono para este sitio en el navegador.",
      NotFoundError: "No se encontró ningún micrófono conectado.",
      NotReadableError: "El micrófono está siendo usado por otra aplicación.",
    };

    salidaMicrofonoEstado.textContent =
      mensajes[error.name] || `No se pudo acceder al micrófono (${error.name || error.message})`;
  }
}

function detenerMicrofono() {
  parametros.microfonoActivo = false;
  nivelMicrofono = 0;

  if (flujoMicrofono) {
    flujoMicrofono.getTracks().forEach((pista) => pista.stop());
    flujoMicrofono = null;
  }

  analizadorMicrofono = null;
  datosMicrofono = null;

  controlMicrofonoActivar.textContent = "Activar micrófono";
  salidaMicrofonoEstado.textContent = "Micrófono apagado";
  salidaMicrofonoNivel.value = "0%";
}

function actualizarNivelMicrofono() {
  if (!parametros.microfonoActivo || !analizadorMicrofono) return;

  analizadorMicrofono.getByteFrequencyData(datosMicrofono);

  let suma = 0;
  for (let i = 0; i < datosMicrofono.length; i++) {
    suma += datosMicrofono[i];
  }

  nivelMicrofono = suma / datosMicrofono.length / 255;
  salidaMicrofonoNivel.value = `${Math.round(nivelMicrofono * 100)}%`;
}

function aplicarMovimientoMicrofono(tiempo) {
  grupoCampo.children.forEach((modulo) => {
    const oscilacion = (Math.sin(tiempo * 6 + modulo.userData.fase) + 1) / 2;
    const empujeMicrofono = nivelMicrofono * parametros.microfonoFuerza * oscilacion;

    modulo.position.y = modulo.userData.yBase + empujeMicrofono;
  });
}

// ======================================================
// 07 — INTERFAZ
// ======================================================

const controles = {
  columnas: document.querySelector("#columnas"),
  filas: document.querySelector("#filas"),
  separacion: document.querySelector("#separacion"),
  amplitud: document.querySelector("#amplitud"),
  frecuencia: document.querySelector("#frecuencia"),
  rotacion: document.querySelector("#rotacion"),
  aleatoriedad: document.querySelector("#aleatoriedad"),
  semilla: document.querySelector("#semilla"),
  atractorFuerza: document.querySelector("#atractor-fuerza"),
  atractorRadio: document.querySelector("#atractor-radio"),
  atractorFrecuencia: document.querySelector("#atractor-frecuencia"),
  microfonoFuerza: document.querySelector("#microfono-fuerza"),
};

const valoresVisibles = {
  columnas: document.querySelector("#columnas-valor"),
  filas: document.querySelector("#filas-valor"),
  separacion: document.querySelector("#separacion-valor"),
  amplitud: document.querySelector("#amplitud-valor"),
  frecuencia: document.querySelector("#frecuencia-valor"),
  rotacion: document.querySelector("#rotacion-valor"),
  aleatoriedad: document.querySelector("#aleatoriedad-valor"),
  semilla: document.querySelector("#semilla-valor"),
  atractorFuerza: document.querySelector("#atractor-fuerza-valor"),
  atractorRadio: document.querySelector("#atractor-radio-valor"),
  atractorFrecuencia: document.querySelector("#atractor-frecuencia-valor"),
  microfonoFuerza: document.querySelector("#microfono-fuerza-valor"),
};

const controlAtractorActivo = document.querySelector("#atractor-activo");
const controlAtractorColor = document.querySelector("#atractor-color");
const salidaAtractorPosicion = document.querySelector("#atractor-posicion");

const controlMicrofonoActivar = document.querySelector("#microfono-activar");
const salidaMicrofonoEstado = document.querySelector("#microfono-estado");
const salidaMicrofonoNivel = document.querySelector("#microfono-nivel");

function actualizarPosicionAtractorUI() {
  salidaAtractorPosicion.value =
    `x ${parametros.atractorX.toFixed(2)} · z ${parametros.atractorZ.toFixed(2)}`;
}

function actualizarParametro(nombre, valor) {
  const parametrosEnteros = ["columnas", "filas", "semilla"];

  parametros[nombre] = parametrosEnteros.includes(nombre)
    ? Number.parseInt(valor, 10)
    : Number.parseFloat(valor);

  valoresVisibles[nombre].value = parametrosEnteros.includes(nombre)
    ? parametros[nombre]
    : parametros[nombre].toFixed(2);

  generarCampo();
}

Object.entries(controles).forEach(([nombre, control]) => {
  control.addEventListener("input", (event) => {
    actualizarParametro(nombre, event.target.value);
  });
});

controlAtractorActivo.addEventListener("change", (evento) => {
  parametros.atractorActivo = evento.target.checked;
  actualizarMarcadorAtractor();
  generarCampo();
});

controlAtractorColor.addEventListener("input", (evento) => {
  colorAtractor.set(evento.target.value);
  actualizarMarcadorAtractor();
  generarCampo();
});

controlMicrofonoActivar.addEventListener("click", () => {
  if (parametros.microfonoActivo) {
    detenerMicrofono();
  } else {
    activarMicrofono();
  }
});

document.querySelector("#regenerar").addEventListener("click", () => {
  parametros.semilla = Math.floor(Math.random() * 100) + 1;

  controles.semilla.value = parametros.semilla;
  valoresVisibles.semilla.value = parametros.semilla;

  generarCampo();
});

document.querySelector("#restablecer").addEventListener("click", () => {
  Object.assign(parametros, valoresIniciales);

  const parametrosEnteros = ["columnas", "filas", "semilla"];

  Object.entries(controles).forEach(([nombre, control]) => {
    control.value = parametros[nombre];

    valoresVisibles[nombre].value = parametrosEnteros.includes(nombre)
      ? parametros[nombre]
      : parametros[nombre].toFixed(2);
  });

  controlAtractorActivo.checked = parametros.atractorActivo;
  colorAtractor.set(colorAtractorInicial);
  controlAtractorColor.value = colorAtractorInicial;
  actualizarPosicionAtractorUI();
  actualizarMarcadorAtractor();

  detenerMicrofono();

  generarCampo();
});

// ======================================================
// 08 — BUCLE DE ANIMACIÓN
// ======================================================

const reloj = new THREE.Clock();

function animar() {
  requestAnimationFrame(animar);

  actualizarNivelMicrofono();
  aplicarMovimientoMicrofono(reloj.getElapsedTime());

  controlesOrbita.update();
  renderer.render(escena, camara);
}

function ajustarVentana() {
  const ancho = viewport.clientWidth;
  const altura = viewport.clientHeight;

  camara.aspect = ancho / altura;
  camara.updateProjectionMatrix();

  renderer.setSize(ancho, altura);
}

window.addEventListener("resize", ajustarVentana);

actualizarPosicionAtractorUI();
actualizarMarcadorAtractor();
generarCampo();
animar();

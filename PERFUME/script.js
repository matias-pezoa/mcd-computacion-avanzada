import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import * as d3 from "d3";

// ======================================================
// 01 — PALETA Y REGLAS DE FAMILIA
// (color, curvatura, elongación, densidad, transmisión)
// ======================================================

const PALETTE = {
  cyan: 0x3fe6d2,
  deepBlue: 0x4f6bff,
  coral: 0xff6a52,
  orange: 0xff9640,
  yellow: 0xffd23f,
  pink: 0xff5fa8,
  violet: 0xa06bff,
  neutral: 0x8a8f96,
};

const FAMILY_TABLE = {
  "floral": { color: PALETTE.pink, curvature: 1.05, elongation: 0.95, density: 0.42, transmission: 0.55 },
  "soft floral": { color: PALETTE.pink, curvature: 1.25, elongation: 0.9, density: 0.3, transmission: 0.68 },
  "oriental": { color: PALETTE.orange, curvature: 0.8, elongation: 1.05, density: 0.62, transmission: 0.32 },
  "soft oriental": { color: PALETTE.orange, curvature: 1.0, elongation: 1.0, density: 0.45, transmission: 0.48 },
  "floral oriental": { color: PALETTE.coral, curvature: 0.95, elongation: 1.0, density: 0.5, transmission: 0.42 },
  "woody oriental": { color: PALETTE.violet, curvature: 0.65, elongation: 1.2, density: 0.68, transmission: 0.28 },
  "woody": { color: PALETTE.deepBlue, curvature: 0.55, elongation: 1.3, density: 0.75, transmission: 0.22 },
  "aromatic": { color: PALETTE.cyan, curvature: 0.9, elongation: 1.0, density: 0.4, transmission: 0.5 },
  "fruity": { color: PALETTE.coral, curvature: 1.35, elongation: 0.85, density: 0.32, transmission: 0.62 },
  "citrus": { color: PALETTE.yellow, curvature: 1.45, elongation: 0.8, density: 0.28, transmission: 0.72 },
  "leather": { color: PALETTE.deepBlue, curvature: 0.45, elongation: 1.2, density: 0.85, transmission: 0.16 },
  "oud": { color: PALETTE.violet, curvature: 0.5, elongation: 1.15, density: 0.88, transmission: 0.18 },
  "aquatic": { color: PALETTE.cyan, curvature: 1.55, elongation: 0.9, density: 0.25, transmission: 0.78 },
  "arabian": { color: PALETTE.violet, curvature: 0.6, elongation: 1.1, density: 0.8, transmission: 0.22 },
  "chypre": { color: PALETTE.deepBlue, curvature: 0.7, elongation: 1.05, density: 0.6, transmission: 0.36 },
  "sweet": { color: PALETTE.pink, curvature: 1.2, elongation: 0.95, density: 0.4, transmission: 0.55 },
};
const FAMILY_FALLBACK = { color: PALETTE.neutral, curvature: 1.0, elongation: 1.0, density: 0.4, transmission: 0.5 };

function familyParams(key) {
  return FAMILY_TABLE[key] || FAMILY_FALLBACK;
}

// ======================================================
// 02 — UTILIDADES: HASH, PRNG, RUIDO 3D (seedeable)
// ======================================================

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise3D(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (t, a, b) => a + t * (b - a);
  const grad = (hash, x, y, z) => {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  };

  return function noise3D(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(
      w,
      lerp(
        v,
        lerp(u, grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z)),
        lerp(u, grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z))
      ),
      lerp(
        v,
        lerp(u, grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1)),
        lerp(u, grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1))
      )
    );
  };
}

const noteDirCache = new Map();
function noteDirection(key) {
  if (noteDirCache.has(key)) return noteDirCache.get(key);
  const h = hashString(key);
  const r1 = mulberry32(h)();
  const r2 = mulberry32(h ^ 0x9e3779b9)();
  const theta = r1 * Math.PI * 2;
  const phi = Math.acos(2 * r2 - 1);
  const dir = new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
  noteDirCache.set(key, dir);
  return dir;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ======================================================
// 03 — CARGA Y LIMPIEZA DE DATOS
// ======================================================

function cleanNoteList(raw) {
  if (!raw) return [];
  const seen = new Set();
  const out = [];
  raw.forEach((tok) => {
    let n = (tok || "").trim().replace(/\.+$/, "").trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (key === "unknown") return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label: n, key });
  });
  return out;
}

function cleanFamilyList(raw) {
  if (!raw) return [];
  const seen = new Set();
  const out = [];
  raw.split(",").forEach((tok) => {
    const n = tok.trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return out;
}

async function loadPerfumes() {
  const rows = await d3.json("./perfume_visualization.json");
  const records = rows.map((r, i) => {
    const families = cleanFamilyList(r.fragrance_family);
    return {
      id: r.perfume_id || `row-${i}`,
      name: (r.name || "").trim() || "Sin nombre",
      brand: (r.brand || "").trim() || "—",
      gender: (r.gender || "").trim(),
      year: Number.isFinite(r.year) ? Math.round(r.year) : null,
      family: families,
      familyLabel: families.length ? families.join(" / ") : "sin familia",
      familyPrimary: families[0] || "unknown",
      rate: Number.isFinite(r.rate) ? r.rate : null,
      ratingCount: Number.isFinite(r.rating_count) ? r.rating_count : null,
      concentration: (r.concentration || "").trim(),
      top: cleanNoteList(r.top_notes),
      middle: cleanNoteList(r.middle_notes),
      base: cleanNoteList(r.base_notes),
    };
  });
  return records;
}

// ======================================================
// 04 — ESCALAS (D3)
// ======================================================

function buildScales(records) {
  const years = records.map((r) => r.year).filter((y) => y != null);
  const rates = records.map((r) => r.rate).filter((v) => v != null);
  const counts = records.map((r) => r.ratingCount).filter((v) => v != null);

  const yearDomainFull = d3.extent(years);
  // dominio de despliegue espacial: recortado en el percentil bajo para que
  // un puñado de años muy antiguos (outliers) no compriman el resto de la línea
  const sortedYears = [...years].sort((a, b) => a - b);
  const yearLow = d3.quantileSorted(sortedYears, 0.02) ?? yearDomainFull[0];

  const yearScale = d3.scaleLinear().domain([yearLow, yearDomainFull[1]]).range([-4.2, 4.2]).clamp(true);
  const rateScale = d3.scaleLinear().domain([1, 5]).range([0, 1]).clamp(true);
  const countScale = d3.scaleSqrt().domain(d3.extent(counts)).range([0, 1]).clamp(true);

  return { yearScale, yearDomainFull, rateScale, countScale };
}

// ======================================================
// 05 — ESCENA THREE.JS
// ======================================================

const root = document.getElementById("scene-root");

function getViewSize() {
  const w = root.clientWidth || window.innerWidth || 1;
  const h = root.clientHeight || window.innerHeight || 1;
  return { w, h };
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
{
  const { w, h } = getViewSize();
  renderer.setSize(w, h);
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.052);

// entorno neutro (habitación) para que vidrio/cromo/clearcoat reflejen algo
// coherente en vez de verse planos — estándar en three.js para PBR realista
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(36, getViewSize().w / getViewSize().h, 0.1, 200);
camera.position.set(10.5, 5.2, 11.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 4;
controls.maxDistance = 26;
controls.target.set(0, 0, 0);

scene.add(new THREE.AmbientLight(0x223344, 1.2));
const keyLight = new THREE.PointLight(0xffffff, 55, 60, 1.6);
keyLight.position.set(6, 8, 6);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x4f6bff, 40, 60, 1.6);
rimLight.position.set(-7, -3, -6);
scene.add(rimLight);
const fillLight = new THREE.PointLight(0xff6a52, 26, 60, 1.6);
fillLight.position.set(-4, 6, -3);
scene.add(fillLight);

function handleResize() {
  const { w, h } = getViewSize();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener("resize", handleResize);
new ResizeObserver(handleResize).observe(root);
// el viewport puede reportar 0px en los primeros frames (layout aún no
// resuelto); se reintenta unos frames hasta que el tamaño se estabiliza.
let resizeRetries = 0;
(function settleInitialSize() {
  handleResize();
  if (resizeRetries++ < 30) requestAnimationFrame(settleInitialSize);
})();

// ---- línea temporal en escena ----
const timelineGroup = new THREE.Group();
const timelineMat = new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.5 });
const timelineGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-4.6, -4.6, 0),
  new THREE.Vector3(4.6, -4.6, 0),
]);
timelineGroup.add(new THREE.Line(timelineGeo, timelineMat));
const timelineMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.07, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0x3fe6d2 })
);
timelineMarker.position.set(0, -4.6, 0);
timelineGroup.add(timelineMarker);
scene.add(timelineGroup);

const perfumeGroup = new THREE.Group();
scene.add(perfumeGroup);

// ======================================================
// 06 — ARQUETIPOS DE NOTA
// cada nota olfativa es un elemento 3D independiente — su forma es un
// hash determinístico de su nombre, así que la misma nota siempre genera
// el mismo objeto base (comparable entre perfumes); sólo su color, tamaño
// y posición relativa cambian según el perfume que la contiene.
// ======================================================

const ARCHETYPES = ["blob", "chrome", "fuzz", "concrete", "glass"];

// el arquetipo remite formalmente al ingrediente: cítricos → facetado
// translúcido, florales → lóbulos glossy, maderas → bloque macizo, almizcle
// → textura fibrosa, acuático/metálico → cromo, resinas → vidrio cálido.
// se resuelve por palabras clave en el propio nombre de la nota (con
// límites de palabra, para no confundir subcadenas sueltas); si no calza
// con ninguna categoría, cae al hash determinístico de siempre.
const NOTE_CATEGORY_DEFS = [
  { archetype: "glass", keywords: ["lemon", "lime", "bergamot", "orange", "grapefruit", "mandarin", "tangerine", "citrus", "yuzu", "clementine", "citron", "kumquat"] },
  { archetype: "blob", keywords: ["rose", "jasmine", "lily", "lilac", "peony", "peonies", "violet", "iris", "lavender", "ylang", "magnolia", "freesia", "gardenia", "tuberose", "orchid", "geranium", "mimosa", "narcissus", "neroli", "blossom", "petal", "flower", "carnation", "hyacinth", "osmanthus"] },
  { archetype: "chrome", keywords: ["aldehyde", "ozone", "ozonic", "marine", "aquatic", "mineral", "metallic", "metal", "steel", "rain", "sea salt", "salt"] },
  { archetype: "fuzz", keywords: ["musk", "powder", "powdery", "ambrette", "talc", "cashmere", "cotton", "green", "grass", "leaf", "mint", "basil", "sage", "thyme", "rosemary", "herbal", "galbanum", "tea"] },
  { archetype: "glass", keywords: ["amber", "vanilla", "tonka", "benzoin", "honey", "caramel", "praline", "resin", "balsam", "myrrh", "frankincense", "labdanum", "opoponax", "sugar", "gourmand"] },
  { archetype: "concrete", keywords: ["cedar", "sandalwood", "oud", "agarwood", "vetiver", "patchouli", "oak", "birch", "pine", "guaiac", "wood", "driftwood", "cypress", "bark", "smoke", "incense", "tobacco", "tar", "moss", "mushroom", "earthy", "leather", "suede", "castoreum", "civet", "animalic", "hay", "pepper", "cinnamon", "clove", "cardamom", "ginger", "nutmeg", "saffron", "spice", "chili", "anise", "cumin"] },
  { archetype: "blob", keywords: ["apple", "pear", "peach", "berry", "cherry", "plum", "fig", "raspberry", "blackcurrant", "apricot", "mango", "pineapple", "coconut", "melon", "grape", "fruit", "fruity", "strawberry"] },
];
const NOTE_CATEGORIES = NOTE_CATEGORY_DEFS.map((cat) => ({
  archetype: cat.archetype,
  regexes: cat.keywords.map((kw) => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i")),
}));

function classifyNoteArchetype(key) {
  for (const cat of NOTE_CATEGORIES) {
    for (const re of cat.regexes) {
      if (re.test(key)) return cat.archetype;
    }
  }
  return null;
}

const archetypeCache = new Map();
function archetypeForNote(key) {
  if (archetypeCache.has(key)) return archetypeCache.get(key);
  const result = classifyNoteArchetype(key) || ARCHETYPES[hashString("archetype:" + key) % ARCHETYPES.length];
  archetypeCache.set(key, result);
  return result;
}

function makeOrganicGeometry(radius, detail, seed, freq, amp) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.getAttribute("position");
  const noise = makeNoise3D(seed);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = radius;
    r += noise(v.x * freq + (seed % 13), v.y * freq, v.z * freq - (seed % 7)) * amp * radius;
    pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  geo.computeVertexNormals();
  return geo;
}

// esfera UV de alta resolución (en vez de icosaedro subdividido) para
// superficies que deben leerse lisas — el cromo pulido, sobre todo
function makeSmoothNoisyGeometry(radius, widthSeg, heightSeg, seed, freq, amp) {
  const geo = new THREE.SphereGeometry(radius, widthSeg, heightSeg);
  const pos = geo.getAttribute("position");
  const noise = makeNoise3D(seed);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = radius;
    r += noise(v.x * freq + (seed % 13), v.y * freq, v.z * freq - (seed % 7)) * amp * radius;
    pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  geo.computeVertexNormals();
  return geo;
}

function randomOrientation(seed) {
  const rand = mulberry32(seed ^ 0x2244);
  return new THREE.Euler(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2);
}

// ---- blob: superficie orgánica, glossy, con leve iridiscencia ----
// rango paramétrico amplio: de una gota casi lisa a un lóbulo muy marcado
// y estirado — para que dos notas florales/frutales no se vean clonadas
function buildBlobNote(seed, colorHex) {
  const rand = mulberry32(seed ^ 0x1001);
  const axes = ["x", "y", "z"];
  const axis = axes[Math.floor(rand() * 3)];
  const elong = 0.04 + rand() * 0.58;
  const geo = makeOrganicGeometry(1, 3, seed, 0.9 + rand() * 2.4, 0.12 + rand() * 0.34);
  geo.scale(axis === "x" ? 1 + elong : 1, axis === "y" ? 1 + elong : 1, axis === "z" ? 1 + elong : 1);
  const mat = new THREE.MeshPhysicalMaterial({
    color: colorHex,
    roughness: 0.14,
    metalness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    iridescence: 0.55,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 420],
    transmission: 0.06,
    thickness: 0.6,
    envMapIntensity: 1.3,
  });
  const mesh = new THREE.Mesh(geo, mat);
  return { object: mesh, colorMaterials: [mat] };
}

// ---- chrome: de bola espejo casi perfecta a un metal abollado/alargado ----
function buildChromeNote(seed, colorHex) {
  const rand = mulberry32(seed ^ 0x2002);
  const geo = makeSmoothNoisyGeometry(1, 40, 28, seed, 0.6 + rand() * 2.2, 0.01 + rand() * 0.13);
  const axes = ["x", "y", "z"];
  const axis = axes[Math.floor(rand() * 3)];
  const elong = rand() * 0.4;
  geo.scale(axis === "x" ? 1 + elong : 1, axis === "y" ? 1 + elong : 1, axis === "z" ? 1 + elong : 1);
  const c = new THREE.Color(colorHex).lerp(new THREE.Color(0xffffff), 0.4 + rand() * 0.35);
  const mat = new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.03 + rand() * 0.1,
    metalness: 1,
    clearcoat: 0.3,
    envMapIntensity: 1.6,
  });
  const mesh = new THREE.Mesh(geo, mat);
  return { object: mesh, colorMaterials: [mat] };
}

// ---- fuzz: núcleo + cerdas instanciadas — de pelusa rala y corta a un
// pompón denso y largo, según la nota ----
function buildFuzzNote(seed, colorHex) {
  const rand = mulberry32(seed ^ 0x3003);
  const coreR = 0.4 + rand() * 0.24;
  const group = new THREE.Group();
  const coreGeo = new THREE.SphereGeometry(coreR, 10, 10);
  const coreMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 1, metalness: 0 });
  group.add(new THREE.Mesh(coreGeo, coreMat));

  const count = 55 + Math.round(rand() * 160);
  const bristleLen = 0.35 + rand() * 0.85;
  const bristleGeo = new THREE.CylinderGeometry(0.015 + rand() * 0.02, 0.035 + rand() * 0.04, bristleLen, 5, 1);
  bristleGeo.translate(0, bristleLen / 2, 0);
  const bristleMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.95, metalness: 0 });
  const inst = new THREE.InstancedMesh(bristleGeo, bristleMat, count);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    dummy.position.copy(dir).multiplyScalar(coreR);
    dummy.quaternion.setFromUnitVectors(up, dir);
    const s = 0.6 + rand() * 0.75;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  group.add(inst);
  return { object: group, colorMaterials: [coreMat, bristleMat] };
}

// ---- concrete: de bloque cúbico compacto a losa/torre alargada, con
// agregados — la proporción y la porosidad varían con cada nota ----
function buildConcreteNote(seed, colorHex) {
  const rand = mulberry32(seed ^ 0x4004);
  const w = 0.85 + rand() * 0.65;
  const h = 1.0 + rand() * 1.15;
  const noiseAmp = 0.03 + rand() * 0.16;

  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, w, 3, 4, 3);
  const pos = geo.getAttribute("position");
  const noise = makeNoise3D(seed);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise(v.x * 2.6 + (seed % 11), v.y * 2.6, v.z * 2.6 - (seed % 7)) * noiseAmp;
    pos.setXYZ(i, v.x + n, v.y + n * 0.6, v.z + n);
  }
  geo.computeVertexNormals();
  const baseColor = new THREE.Color(0x9a9a95).lerp(new THREE.Color(colorHex), 0.22);
  const mat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.95, metalness: 0.05 });
  group.add(new THREE.Mesh(geo, mat));

  const colorMaterials = [mat];
  const pebbleCount = 1 + Math.round(rand() * 4);
  for (let i = 0; i < pebbleCount; i++) {
    const s = 0.07 + rand() * 0.1;
    const dark = rand() > 0.5;
    const pebbleMat = new THREE.MeshStandardMaterial({
      color: dark ? 0x161616 : colorHex,
      roughness: 0.35,
      metalness: 0.3,
    });
    const pebble = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 8), pebbleMat);
    pebble.position.set((rand() - 0.5) * w * 0.8, h / 2 + rand() * 0.25, (rand() - 0.5) * w * 0.8);
    group.add(pebble);
    if (!dark) colorMaterials.push(pebbleMat);
  }
  return { object: group, colorMaterials };
}

// ---- glass: de gota translúcida lisa a un cristal facetado e irregular,
// según cuánto "muerda" la nota ----
function buildGlassNote(seed, colorHex) {
  const rand = mulberry32(seed ^ 0x5005);
  const geo = makeSmoothNoisyGeometry(1, 36, 24, seed, 0.7 + rand() * 2.6, 0.02 + rand() * 0.22);
  const axes = ["x", "y", "z"];
  const axis = axes[Math.floor(rand() * 3)];
  const elong = rand() * 0.35;
  geo.scale(axis === "x" ? 1 + elong : 1, axis === "y" ? 1 + elong : 1, axis === "z" ? 1 + elong : 1);
  const mat = new THREE.MeshPhysicalMaterial({
    color: colorHex,
    transmission: 0.85 + rand() * 0.15,
    thickness: 0.7 + rand() * 0.9,
    roughness: 0.03 + rand() * 0.12,
    ior: 1.25 + rand() * 0.35,
    envMapIntensity: 1.3,
    clearcoat: 0.4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  return { object: mesh, colorMaterials: [mat] };
}

const NOTE_BUILDERS = {
  blob: buildBlobNote,
  chrome: buildChromeNote,
  fuzz: buildFuzzNote,
  concrete: buildConcreteNote,
  glass: buildGlassNote,
};

function noteColor(baseColorHex, key) {
  const c = new THREE.Color(baseColorHex);
  const rand = mulberry32(hashString("tint:" + key));
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  hsl.h = (hsl.h + (rand() - 0.5) * 0.09 + 1) % 1;
  hsl.l = clamp01(hsl.l + (rand() - 0.5) * 0.14);
  hsl.s = clamp01(hsl.s + (rand() - 0.5) * 0.1);
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

// ======================================================
// 07 — COLUMNA CENTRAL Y CACHÉ DE NOTAS
// la columna atraviesa las tres capas y le da coherencia física a la
// composición; cada nota se ancla a ella mediante un tendón (glass tube).
// ======================================================

const LAYER_DEFS = {
  top: { yOffset: 2.4, distance: 2.15, spread: 1.0, objBase: 0.46 },
  middle: { yOffset: 0, distance: 1.6, spread: 0.92, objBase: 0.58 },
  base: { yOffset: -2.1, distance: 1.05, spread: 0.8, objBase: 0.66 },
};
const MAX_NOTES_PER_LAYER = 9;
const LAYER_VISIBLE = { top: true, middle: true, base: true };

function buildSpineGeometry() {
  const height = 5.6;
  const geo = new THREE.CylinderGeometry(0.12, 0.17, height, 14, 10, false);
  const pos = geo.getAttribute("position");
  const noise = makeNoise3D(4242);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise(v.x * 2, v.y * 0.7, v.z * 2) * 0.05;
    const len = Math.hypot(v.x, v.z) || 1;
    pos.setXYZ(i, v.x + (v.x / len) * n, v.y, v.z + (v.z / len) * n);
  }
  geo.computeVertexNormals();
  return geo;
}

const spineMat = new THREE.MeshPhysicalMaterial({
  color: PALETTE.neutral,
  roughness: 0.6,
  metalness: 0.3,
  clearcoat: 0.3,
  clearcoatRoughness: 0.4,
  envMapIntensity: 1,
});
const spineMesh = new THREE.Mesh(buildSpineGeometry(), spineMat);
spineMesh.position.y = (LAYER_DEFS.top.yOffset + LAYER_DEFS.base.yOffset) / 2;
perfumeGroup.add(spineMesh);

["top", "middle", "base"].forEach((role) => {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 14, 14),
    new THREE.MeshStandardMaterial({ color: 0xf4f4f1, metalness: 0.6, roughness: 0.25, emissive: 0x161616 })
  );
  marker.position.set(0, LAYER_DEFS[role].yOffset, 0);
  perfumeGroup.add(marker);
});

// key -> entry (una entrada persiste durante toda la sesión una vez vista;
// una nota "ausente" simplemente queda con escala 0 y oculta)
const noteCache = new Map();

function rebuildTendrilGeometry(mesh, fromV, toV, seed) {
  if (fromV.distanceToSquared(toV) < 1e-5) {
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BufferGeometry();
    return;
  }
  const rand = mulberry32(seed ^ 0x77);
  const mid = fromV
    .clone()
    .lerp(toV, 0.5)
    .add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.55));
  const curve = new THREE.QuadraticBezierCurve3(fromV, mid, toV);
  const geo = new THREE.TubeGeometry(curve, 10, 0.026, 5, false);
  mesh.geometry.dispose();
  mesh.geometry = geo;
}

function ensureNoteEntry(key, role, label) {
  let entry = noteCache.get(key);
  if (entry) return entry;

  const seed = hashString(key);
  const archetype = archetypeForNote(key);
  const built = NOTE_BUILDERS[archetype](seed, PALETTE.neutral);
  built.object.rotation.copy(randomOrientation(seed));
  built.object.scale.setScalar(0.0001);
  built.object.visible = false;
  built.object.userData.noteKey = key;
  perfumeGroup.add(built.object);

  const tendrilMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 0.85,
    roughness: 0.25,
    thickness: 0.3,
    ior: 1.3,
    transparent: true,
    opacity: 0,
    envMapIntensity: 1,
  });
  const tendrilMesh = new THREE.Mesh(new THREE.BufferGeometry(), tendrilMat);
  tendrilMesh.visible = false;
  perfumeGroup.add(tendrilMesh);

  entry = {
    key,
    role,
    label,
    archetype,
    object: built.object,
    colorMaterials: built.colorMaterials,
    tendrilMesh,
    tendrilMat,
    spineAnchor: new THREE.Vector3(0, LAYER_DEFS[role].yOffset, 0),
  };
  noteCache.set(key, entry);
  return entry;
}

// ======================================================
// 08 — OBJETIVO POR NOTA PARA UN PERFUME DADO
// ======================================================

function computeNoteTarget(role, note, family, scales, record, totalInLayer) {
  const layerDef = LAYER_DEFS[role];
  const dir = noteDirection(note.key);
  const seed = hashString(note.key);
  const rand = mulberry32(seed ^ 0x9f);

  const radialJitter = 0.82 + rand() * 0.36;
  const offset = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(layerDef.objBase * 0.7);

  const rateNorm = record.rate != null ? scales.rateScale(record.rate) : 0.35;
  const countNorm = record.ratingCount != null ? scales.countScale(record.ratingCount) : 0.2;
  const globalMul = 1 + 0.2 * rateNorm + 0.12 * countNorm;
  const countFactor = 1 / Math.sqrt(totalInLayer + 1);
  const scale = layerDef.objBase * (0.55 + 0.85 * countFactor) * globalMul;

  // el componente vertical de la dirección-nota se amortigua: cada capa ya
  // fija su propia franja vertical (yOffset), así que dir.y sólo aporta una
  // variación acotada en vez de poder empujar el objeto fuera de cuadro
  const pos = new THREE.Vector3(dir.x, dir.y * 0.42, dir.z).multiplyScalar(layerDef.distance * radialJitter).add(offset);
  pos.x *= layerDef.spread;
  pos.z *= layerDef.spread;
  pos.y += layerDef.yOffset;
  if (role === "base") pos.y -= 0.15;

  return {
    role,
    label: note.label,
    pos,
    scale,
    color: noteColor(family.color, note.key),
  };
}

function buildTargetsForRecord(record, scales) {
  const family = familyParams(record.familyPrimary);
  const targets = new Map();
  ["top", "middle", "base"].forEach((role) => {
    const all = record[role];
    const notes = all.slice(0, MAX_NOTES_PER_LAYER);
    notes.forEach((note) => {
      targets.set(note.key, computeNoteTarget(role, note, family, scales, record, all.length));
    });
  });
  return { family, targets };
}

// ======================================================
// 09 — TRANSICIÓN: entrada / actualización / salida por nota
// ======================================================

let transition = null;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function startTransition(record, scales) {
  const { family, targets } = buildTargetsForRecord(record, scales);

  const touched = new Set(targets.keys());
  noteCache.forEach((entry, key) => {
    if (entry.object.scale.x > 0.01) touched.add(key);
  });

  const tendrilColor = new THREE.Color(0xffffff).lerp(new THREE.Color(family.color), 0.3);

  touched.forEach((key) => {
    const target = targets.get(key);
    const entry = ensureNoteEntry(key, target ? target.role : (noteCache.get(key) || {}).role || "middle", target ? target.label : (noteCache.get(key) || {}).label || key);

    entry._fromPos = entry.object.position.clone();
    entry._fromScale = entry.object.scale.x;
    entry._fromColor = entry.colorMaterials[0].color.clone();
    entry._fromTendrilColor = entry.tendrilMat.color.clone();
    entry._fromOpacity = entry.tendrilMat.opacity;

    if (target) {
      entry.role = target.role;
      entry.label = target.label;
      entry._toPos = target.pos;
      entry._toScale = target.scale;
      entry._toColor = target.color;
    } else {
      entry._toPos = entry._fromPos.clone();
      entry._toScale = 0;
      entry._toColor = entry._fromColor.clone();
    }
    entry._toTendrilColor = tendrilColor;
    entry.spineAnchor.set(0, LAYER_DEFS[entry.role].yOffset, 0);
  });

  const targetMetal = clamp01(family.density);
  const targetRough = clamp01(1 - family.transmission);
  const targetClearcoat = clamp01(family.transmission);

  const fromZ = perfumeGroup.position.z;
  const toZ = record.year != null ? scales.yearScale(record.year) : 0;
  const fromScaleY = perfumeGroup.scale.y;
  const toScaleY = family.elongation;
  const fromMarkerX = timelineMarker.position.x;
  const toMarkerX = record.year != null ? (scales.yearScale(record.year) / 4.2) * 4.6 : 0;

  // encuadre automático: cada nota cae en una dirección-hash fija, así que
  // según el perfume el conjunto puede crecer hacia cualquier lado — en vez
  // de una cámara fija que recorta composiciones grandes, se ajusta la
  // distancia (preservando el ángulo de órbita actual del usuario) para
  // que la caja que envuelve al conjunto siempre quepa en cuadro
  // el conjunto vive en el espacio LOCAL de perfumeGroup, que además se
  // rota continuamente en Y y se traslada en Z (profundidad ↔ año) — el
  // radio horizontal debe medirse desde el eje de rotación (no como una
  // caja alineada a ejes, que subestima la barrida real al girar), y el
  // objetivo de cámara debe mirar al desplazamiento en Z del propio grupo,
  // no al centro local (que gira y por tanto no es un punto fijo en mundo)
  let minY = LAYER_DEFS.base.yOffset - 0.8;
  let maxY = LAYER_DEFS.top.yOffset + 0.8;
  let maxRadial = 0.35;
  targets.forEach((t) => {
    const r = t.scale * 2.6; // margen extra: la geometría por nota ahora varía más (formas más extremas)
    minY = Math.min(minY, t.pos.y - r);
    maxY = Math.max(maxY, t.pos.y + r);
    maxRadial = Math.max(maxRadial, Math.hypot(t.pos.x, t.pos.z) + r);
  });
  const centerYLocal = (minY + maxY) / 2;

  const vFovHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hFovHalf = Math.atan(Math.tan(vFovHalf) * camera.aspect);
  const halfHeight = Math.max(((maxY - minY) * toScaleY) / 2, 0.6);
  const halfWidth = Math.max(maxRadial, 0.6);
  const fitDist = THREE.MathUtils.clamp(
    Math.max(halfHeight / Math.tan(vFovHalf), halfWidth / Math.tan(hFovHalf)) * 1.25,
    controls.minDistance,
    controls.maxDistance
  );

  const camFrom = camera.position.clone();
  const targetFrom = controls.target.clone();
  const targetTo = new THREE.Vector3(0, centerYLocal * toScaleY, toZ);
  const offset = camFrom.clone().sub(targetFrom);
  const camDir = offset.lengthSq() > 1e-6 ? offset.normalize() : new THREE.Vector3(0.65, 0.35, 0.75).normalize();
  const camTo = targetTo.clone().addScaledVector(camDir, fitDist);

  transition = {
    start: performance.now(),
    duration: 900,
    entries: touched,
    spineFromColor: spineMat.color.clone(),
    spineToColor: new THREE.Color(family.color),
    spineFromMetal: spineMat.metalness,
    spineToMetal: targetMetal,
    spineFromRough: spineMat.roughness,
    spineToRough: targetRough,
    spineFromClearcoat: spineMat.clearcoat,
    spineToClearcoat: targetClearcoat,
    fromZ,
    toZ,
    fromScaleY,
    toScaleY,
    fromMarkerX,
    toMarkerX,
    camFrom,
    camTo,
    targetFrom,
    targetTo,
  };
}

function updateTransition() {
  if (!transition) return;
  const t = clamp01((performance.now() - transition.start) / transition.duration);
  const e = easeInOutCubic(t);

  transition.entries.forEach((key) => {
    const entry = noteCache.get(key);
    if (!entry) return;
    const pos = entry._fromPos.clone().lerp(entry._toPos, e);
    const scale = entry._fromScale + (entry._toScale - entry._fromScale) * e;
    const color = entry._fromColor.clone().lerp(entry._toColor, e);
    const tColor = entry._fromTendrilColor.clone().lerp(entry._toTendrilColor, e);
    const visible = scale > 0.006 && LAYER_VISIBLE[entry.role];

    entry.object.position.copy(pos);
    entry.object.scale.setScalar(Math.max(scale, 0.0001));
    entry.object.visible = visible;
    entry.colorMaterials.forEach((m) => m.color.copy(color));

    rebuildTendrilGeometry(entry.tendrilMesh, entry.spineAnchor, pos, hashString(key));
    entry.tendrilMat.color.copy(tColor);
    entry.tendrilMat.opacity = clamp01(scale) * 0.85;
    entry.tendrilMesh.visible = visible;
  });

  spineMat.color.copy(transition.spineFromColor).lerp(transition.spineToColor, e);
  spineMat.metalness = transition.spineFromMetal + (transition.spineToMetal - transition.spineFromMetal) * e;
  spineMat.roughness = transition.spineFromRough + (transition.spineToRough - transition.spineFromRough) * e;
  spineMat.clearcoat = transition.spineFromClearcoat + (transition.spineToClearcoat - transition.spineFromClearcoat) * e;

  perfumeGroup.position.z = transition.fromZ + (transition.toZ - transition.fromZ) * e;
  perfumeGroup.scale.y = transition.fromScaleY + (transition.toScaleY - transition.fromScaleY) * e;
  timelineMarker.position.x = transition.fromMarkerX + (transition.toMarkerX - transition.fromMarkerX) * e;

  camera.position.lerpVectors(transition.camFrom, transition.camTo, e);
  controls.target.lerpVectors(transition.targetFrom, transition.targetTo, e);

  if (t >= 1) transition = null;
}

// ======================================================
// 10 — RAYCASTING / TOOLTIP
// ======================================================

const raycaster = new THREE.Raycaster();
const mouseNdc = new THREE.Vector2();
const tooltip = document.getElementById("tooltip");
let hoverActive = false;

function onPointerMove(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouseNdc, camera);
  const targets = [];
  noteCache.forEach((entry) => {
    if (entry.object.visible) targets.push(entry.object);
  });
  const hits = raycaster.intersectObjects(targets, true);

  if (hits.length === 0) {
    hoverActive = false;
    tooltip.hidden = true;
    return;
  }

  let obj = hits[0].object;
  while (obj && !obj.userData.noteKey) obj = obj.parent;
  const entry = obj ? noteCache.get(obj.userData.noteKey) : null;
  if (!entry) {
    tooltip.hidden = true;
    hoverActive = false;
    return;
  }

  hoverActive = true;
  tooltip.hidden = false;
  tooltip.style.left = e.clientX + "px";
  tooltip.style.top = e.clientY + "px";

  const layerLabel = entry.role === "top" ? "TOP" : entry.role === "middle" ? "HEART" : "BASE";
  tooltip.innerHTML = `<strong>${layerLabel} · ${entry.label}</strong>nota → elemento propio en la composición · forma y dirección fijas, color por familia`;
}
renderer.domElement.addEventListener("pointermove", onPointerMove);
renderer.domElement.addEventListener("pointerleave", () => {
  tooltip.hidden = true;
  hoverActive = false;
});

// ======================================================
// 11 — ANIMACIÓN
// ======================================================

const clock = new THREE.Clock();

let mapOpen = false; // pausa el render principal mientras el mapa de notas cubre la pantalla

function animate() {
  requestAnimationFrame(animate);
  if (mapOpen) return;
  const dt = clock.getDelta();
  updateTransition();
  if (!hoverActive) perfumeGroup.rotation.y += dt * 0.06;
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ======================================================
// 12 — ESTADO / UI
// ======================================================

const els = {
  loading: document.getElementById("loading"),
  legendToggle: document.getElementById("legend-toggle"),
  legendPanel: document.getElementById("legend-panel"),
  infoName: document.getElementById("info-name"),
  infoBrand: document.getElementById("info-brand"),
  infoYear: document.getElementById("info-year"),
  infoFamily: document.getElementById("info-family"),
  infoTop: document.getElementById("info-top"),
  infoMiddle: document.getElementById("info-middle"),
  infoBase: document.getElementById("info-base"),
  infoRate: document.getElementById("info-rate"),
  layerBtns: Array.from(document.querySelectorAll(".layer-btn")),
  searchInput: document.getElementById("search-input"),
  familyFilter: document.getElementById("family-filter"),
  yearMin: document.getElementById("year-min"),
  yearMax: document.getElementById("year-max"),
  resultsList: document.getElementById("results-list"),
  relatedList: document.getElementById("related-list"),
  mapToggle: document.getElementById("map-toggle"),
  mapPanel: document.getElementById("map-panel"),
  mapClose: document.getElementById("map-close"),
  mapRoot: document.getElementById("map-root"),
  mapFocusName: document.getElementById("map-focus-name"),
  mapStatus: document.getElementById("map-status"),
  mapInfoCard: document.getElementById("map-info-card"),
  mapInfoName: document.getElementById("map-info-name"),
  mapInfoMeta: document.getElementById("map-info-meta"),
  mapInfoShared: document.getElementById("map-info-shared"),
  mapViewComposition: document.getElementById("map-view-composition"),
  mapLegendToggle: document.getElementById("map-legend-toggle"),
  mapLegendPanel: document.getElementById("map-legend-panel"),
};

let RECORDS = [];
let SCALES = null;
let current = null;

function selectPerfume(record, opts = {}) {
  if (!record) return;
  current = record;
  startTransition(record, SCALES);
  renderInfoPanel(record);
  renderRelated(record);
  highlightSelected(record.id);
  if (!opts.silent) els.searchInput.value = "";
  renderResults();
}

function renderInfoPanel(r) {
  els.infoName.textContent = r.name;
  els.infoBrand.textContent = r.brand;
  els.infoYear.textContent = r.year != null ? r.year : "—";
  els.infoFamily.textContent = r.familyLabel;
  els.infoTop.textContent = r.top.length ? r.top.map((n) => n.label).join(", ") : "—";
  els.infoMiddle.textContent = r.middle.length ? r.middle.map((n) => n.label).join(", ") : "—";
  els.infoBase.textContent = r.base.length ? r.base.map((n) => n.label).join(", ") : "—";
  els.infoRate.textContent =
    r.rate != null
      ? `rate ${r.rate.toFixed(2)} · ${r.ratingCount ?? 0} ratings`
      : "sin calificación registrada";
}

function relatedScore(a, b) {
  let score = 0;
  if (a.familyPrimary === b.familyPrimary) score += 3;
  if (a.brand === b.brand) score += 2;
  if (a.year != null && b.year != null) score += Math.max(0, 1 - Math.abs(a.year - b.year) / 15);
  return score;
}

function renderRelated(r) {
  const candidates = RECORDS.filter((x) => x.id !== r.id)
    .map((x) => ({ rec: x, score: relatedScore(r, x) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  els.relatedList.innerHTML = "";
  candidates.forEach(({ rec }) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="rel-name">${rec.name}</span><span class="rel-meta">${rec.brand} · ${rec.year ?? "s/f"}</span>`;
    li.addEventListener("click", () => selectPerfume(rec));
    els.relatedList.appendChild(li);
  });
}

function highlightSelected(id) {
  Array.from(els.resultsList.children).forEach((li) => {
    li.classList.toggle("selected", li.dataset.id === id);
  });
}

const DIACRITICS_RE = new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g");
function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "");
}

function filteredRecords() {
  const q = normalizeText(els.searchInput.value.trim());
  const fam = els.familyFilter.value;
  const yMin = els.yearMin.value ? parseInt(els.yearMin.value, 10) : null;
  const yMax = els.yearMax.value ? parseInt(els.yearMax.value, 10) : null;

  return RECORDS.filter((r) => {
    if (q && !normalizeText(r.name).includes(q) && !normalizeText(r.brand).includes(q)) return false;
    if (fam && r.familyPrimary !== fam) return false;
    if (yMin != null && (r.year == null || r.year < yMin)) return false;
    if (yMax != null && (r.year == null || r.year > yMax)) return false;
    return true;
  });
}

function renderResults() {
  const list = filteredRecords().slice(0, 60);
  els.resultsList.innerHTML = "";
  list.forEach((r) => {
    const li = document.createElement("li");
    li.dataset.id = r.id;
    if (current && current.id === r.id) li.classList.add("selected");
    li.innerHTML = `<span class="result-name">${r.name}</span><span class="result-meta">${r.brand} · ${r.year ?? "s/f"} · ${r.familyLabel}</span>`;
    li.addEventListener("click", () => selectPerfume(r));
    els.resultsList.appendChild(li);
  });
}

function populateFamilyFilter() {
  const counts = new Map();
  RECORDS.forEach((r) => counts.set(r.familyPrimary, (counts.get(r.familyPrimary) || 0) + 1));
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([fam, count]) => {
    const opt = document.createElement("option");
    opt.value = fam;
    opt.textContent = `${fam} (${count})`;
    els.familyFilter.appendChild(opt);
  });
}

function wireLayerToggles() {
  els.layerBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const role = btn.dataset.layer;
      LAYER_VISIBLE[role] = !LAYER_VISIBLE[role];
      btn.classList.toggle("active", LAYER_VISIBLE[role]);
      noteCache.forEach((entry) => {
        if (entry.role !== role) return;
        const visible = entry.object.scale.x > 0.006 && LAYER_VISIBLE[role];
        entry.object.visible = visible;
        entry.tendrilMesh.visible = visible;
      });
    });
  });
}

function wireLegend() {
  els.legendToggle.addEventListener("click", () => {
    const expanded = els.legendToggle.getAttribute("aria-expanded") === "true";
    els.legendToggle.setAttribute("aria-expanded", String(!expanded));
    els.legendPanel.hidden = expanded;
  });
}

function wireExplore() {
  els.searchInput.addEventListener("input", renderResults);
  els.familyFilter.addEventListener("change", renderResults);
  els.yearMin.addEventListener("change", renderResults);
  els.yearMax.addEventListener("change", renderResults);
}

// ======================================================
// 13 — INIT
// ======================================================

async function init() {
  try {
    RECORDS = await loadPerfumes();
  } catch (err) {
    els.loading.querySelector(".loading-sub").textContent =
      "no se pudo cargar perfume_visualization.json — revisa que el archivo esté junto a index.html";
    console.error(err);
    return;
  }

  SCALES = buildScales(RECORDS);
  buildNoteIndex(RECORDS);

  els.yearMin.placeholder = String(SCALES.yearDomainFull[0]);
  els.yearMax.placeholder = String(SCALES.yearDomainFull[1]);

  populateFamilyFilter();
  wireLayerToggles();
  wireLegend();
  wireExplore();
  wireMapUI();
  renderResults();

  const rated = RECORDS.filter((r) => r.rate != null && r.ratingCount != null && r.top.length + r.middle.length + r.base.length > 0);
  rated.sort((a, b) => b.ratingCount - a.ratingCount);
  const hero = rated[0] || RECORDS.find((r) => r.top.length + r.middle.length + r.base.length > 0) || RECORDS[0];

  selectPerfume(hero, { silent: true });
  // salta directo al estado final en la primera carga (sin animar desde cero)
  transition.start = performance.now() - transition.duration - 1;
  updateTransition();

  els.loading.classList.add("hidden");
  setTimeout(() => (els.loading.hidden = true), 600);
}

init();

// ======================================================
// 14 — MAPA DE NOTAS: red 3D expandible de perfumes
// vinculados por notas olfativas compartidas. Vive en su propia escena
// three.js (canvas separado), independiente de la composición principal.
// ======================================================

// ---- 14.1 índice invertido nota → perfumes, para encontrar candidatos ----

let NOTE_INDEX = new Map();
let RECORD_BY_ID = new Map();

function buildNoteIndex(records) {
  RECORD_BY_ID = new Map(records.map((r) => [r.id, r]));
  NOTE_INDEX = new Map();
  records.forEach((r) => {
    r.noteKeySet = new Set([...r.top, ...r.middle, ...r.base].map((n) => n.key));
    r.noteKeySet.forEach((key) => {
      if (!NOTE_INDEX.has(key)) NOTE_INDEX.set(key, new Set());
      NOTE_INDEX.get(key).add(r.id);
    });
  });
}

function sharedNoteKeys(a, b) {
  const [small, big] = a.noteKeySet.size <= b.noteKeySet.size ? [a.noteKeySet, b.noteKeySet] : [b.noteKeySet, a.noteKeySet];
  const keys = [];
  small.forEach((k) => {
    if (big.has(k)) keys.push(k);
  });
  return keys;
}

// notas en común expresadas con su forma legible original (para UI)
function sharedNoteLabels(a, b) {
  const keys = sharedNoteKeys(a, b);
  const byKey = new Map();
  [...a.top, ...a.middle, ...a.base].forEach((n) => byKey.set(n.key, n.label));
  return keys.map((k) => byKey.get(k) || k);
}

// el mapa no vincula por notas sueltas sino por composición: una nota que
// coincide en la MISMA capa (top/middle/base) en ambos perfumes pesa más
// que si coincide entre capas distintas — dos "vainilla" en base y base
// hablan de una estructura de fondo compartida; una en base de un perfume
// y en top del otro es una coincidencia mucho más débil estructuralmente
const LAYER_INDEX = { top: 0, middle: 1, base: 2 };
const LAYER_MATCH_WEIGHT = [1, 0.5, 0.25]; // por distancia de capa: misma, adyacente, opuesta

function layeredSimilarity(a, b) {
  const layersInA = new Map(); // key -> Set(role)
  ["top", "middle", "base"].forEach((role) => {
    a[role].forEach((n) => {
      if (!layersInA.has(n.key)) layersInA.set(n.key, new Set());
      layersInA.get(n.key).add(role);
    });
  });
  const layersInB = new Map();
  ["top", "middle", "base"].forEach((role) => {
    b[role].forEach((n) => {
      if (!layersInB.has(n.key)) layersInB.set(n.key, new Set());
      layersInB.get(n.key).add(role);
    });
  });

  let score = 0;
  layersInA.forEach((rolesA, key) => {
    const rolesB = layersInB.get(key);
    if (!rolesB) return;
    let bestDist = 2;
    rolesA.forEach((ra) => {
      rolesB.forEach((rb) => {
        const d = Math.abs(LAYER_INDEX[ra] - LAYER_INDEX[rb]);
        if (d < bestDist) bestDist = d;
      });
    });
    score += LAYER_MATCH_WEIGHT[bestDist];
  });
  return score;
}

const MAP_MIN_SHARED = 1.5; // recalibrado para la escala fraccionaria de layeredSimilarity
const MAP_MAX_NODES = 60;
const MAP_EXPAND_LIMIT = 10;

// candidatos con similitud de composición ≥ MAP_MIN_SHARED con `record`,
// ordenados por peso descendente, excluyendo ids ya presentes
function findLinkedCandidates(record, excludeIds, limit) {
  const candidateIds = new Set();
  record.noteKeySet.forEach((key) => {
    const set = NOTE_INDEX.get(key);
    if (set) set.forEach((id) => candidateIds.add(id));
  });
  const scored = [];
  candidateIds.forEach((id) => {
    if (id === record.id || excludeIds.has(id)) return;
    const other = RECORD_BY_ID.get(id);
    const weight = layeredSimilarity(record, other);
    if (weight >= MAP_MIN_SHARED) scored.push({ id, weight });
  });
  scored.sort((a, b) => b.weight - a.weight);
  return scored.slice(0, limit);
}

// ---- 14.2 escena three.js propia (se crea una sola vez, se reutiliza) ----

let mapInitialized = false;
let mapScene, mapCamera, mapRenderer, mapControls, mapClock;
let mapEdgeGeometry, mapEdgeMaterial, mapEdgeLines;
let mapAnimId = null;

function ensureMapScene() {
  if (mapInitialized) return;
  mapInitialized = true;

  mapScene = new THREE.Scene();
  mapScene.background = new THREE.Color(0x060606);
  mapScene.environment = scene.environment; // mismo entorno PMREM que la escena principal

  mapCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  mapCamera.position.set(0, 0.6, 9);

  mapRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  mapRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  mapRenderer.outputColorSpace = THREE.SRGBColorSpace;
  mapRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  mapRenderer.toneMappingExposure = 1.1;
  els.mapRoot.appendChild(mapRenderer.domElement);

  mapControls = new OrbitControls(mapCamera, mapRenderer.domElement);
  mapControls.enableDamping = true;
  mapControls.dampingFactor = 0.08;
  mapControls.minDistance = 2;
  mapControls.maxDistance = 40;
  // el foco siempre es el centro de referencia — no tiene sentido "panear"
  // lejos de él, y hacerlo por accidente (arrastre derecho / gesto de dos
  // dedos) es la causa más probable de "perder el centro" al interactuar
  mapControls.enablePan = false;

  mapScene.add(new THREE.AmbientLight(0x334455, 1.4));
  const mapKey = new THREE.PointLight(0xffffff, 40, 60, 1.6);
  mapKey.position.set(5, 6, 6);
  mapScene.add(mapKey);
  const mapRim = new THREE.PointLight(0x4f6bff, 26, 60, 1.6);
  mapRim.position.set(-6, -3, -5);
  mapScene.add(mapRim);

  mapEdgeGeometry = new THREE.BufferGeometry();
  mapEdgeMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.48 });
  mapEdgeLines = new THREE.LineSegments(mapEdgeGeometry, mapEdgeMaterial);
  mapScene.add(mapEdgeLines);

  mapClock = new THREE.Clock();

  const handleMapResize = () => {
    const w = els.mapRoot.clientWidth || 1;
    const h = els.mapRoot.clientHeight || 1;
    mapCamera.aspect = w / h;
    mapCamera.updateProjectionMatrix();
    mapRenderer.setSize(w, h);
  };
  window.addEventListener("resize", handleMapResize);
  new ResizeObserver(handleMapResize).observe(els.mapRoot);
  handleMapResize();

  els.mapRoot.addEventListener("pointermove", onMapPointerMove);
  els.mapRoot.addEventListener("pointerleave", () => {
    tooltip.hidden = true;
    setMapHover(null);
  });
  els.mapRoot.addEventListener("click", onMapClick);
  els.mapRoot.addEventListener("dblclick", onMapDblClick);
}

// ---- 14.2b nodo del mapa = la propia composición 3D del perfume, en
// miniatura — reutiliza los mismos arquetipos de nota (blob/cromo/fuzz/
// concreto/vidrio) que la vista principal, así que comparte su lenguaje
// gráfico y textural; sin columna ni tendones (a esta escala no se leen).

const MAP_NODE_NOTE_CAP = 12; // misma lógica que la vista principal (arquetipo/prioridad/columna), tope intermedio para que el mapa siga siendo legible con decenas de nodos
const MAP_NOTES_PER_LAYER = 4;
const MAP_MINI_LAYER_Y = { top: 0.24, middle: 0, base: -0.24 };
const MAP_MINI_RADIUS = 0.85; // margen extra: más notas + columna propia por nodo
const MAP_FOCUS_SCALE = 1.5;

function disposeObject3D(root) {
  root.traverse((obj) => {
    // los Sprite comparten una única BufferGeometry a nivel de módulo en
    // three.js — disponerla aquí rompería el aura de todos los demás nodos
    if (obj.geometry && !obj.isSprite) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
}

// textura de brillo radial compartida por todos los halos de familia —
// se construye una sola vez y se reutiliza (sólo cambia el tinte)
let MAP_GLOW_TEXTURE = null;
function getMapGlowTexture() {
  if (MAP_GLOW_TEXTURE) return MAP_GLOW_TEXTURE;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.26)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  MAP_GLOW_TEXTURE = new THREE.CanvasTexture(canvas);
  return MAP_GLOW_TEXTURE;
}

// hasta MAP_NOTES_PER_LAYER notas por capa, capadas a MAP_NODE_NOTE_CAP en
// total — tope intermedio entre las 6 de antes y las ~27 de la vista
// principal, para que el mapa siga siendo legible con decenas de nodos.
// se priorizan las notas que comparte con el foco actual, para que lo que
// conecta a dos perfumes sea justamente lo que se alcanza a ver
function pickMiniNotes(record) {
  const focusNode = mapFocusId != null ? mapNodes.get(mapFocusId) : null;
  const focusKeys = focusNode ? focusNode.record.noteKeySet : null;

  const picks = [];
  ["top", "middle", "base"].forEach((role) => {
    const notes = record[role].slice();
    if (focusKeys) notes.sort((a, b) => Number(focusKeys.has(b.key)) - Number(focusKeys.has(a.key)));
    notes.slice(0, MAP_NOTES_PER_LAYER).forEach((note) => picks.push({ role, note }));
  });
  return picks.slice(0, MAP_NODE_NOTE_CAP);
}

// tendón local (estático — a diferencia del de la vista principal, un nodo
// del mapa nunca cambia de perfume, así que no necesita reconstruirse)
function buildMiniTendril(fromV, toV, seed) {
  const rand = mulberry32(seed ^ 0x77);
  const mid = fromV
    .clone()
    .lerp(toV, 0.5)
    .add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.08));
  const curve = new THREE.QuadraticBezierCurve3(fromV, mid, toV);
  const geo = new THREE.TubeGeometry(curve, 8, 0.006, 5, false);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 0.85,
    roughness: 0.25,
    thickness: 0.15,
    ior: 1.3,
    transparent: true,
    opacity: 0.55,
    envMapIntensity: 1,
  });
  return new THREE.Mesh(geo, mat);
}

// nodo del mapa = núcleo (color de familia) + halo de familia (aura) +
// hasta 6 elementos-nota (color por identidad de nota, no por familia).
// devuelve también la lista de materiales-color para poder atenuarlos al
// resaltar vecinos, cada uno con su color base guardado para poder volver.
function buildMiniComposition(record) {
  const family = familyParams(record.familyPrimary);
  const group = new THREE.Group();
  const colorMaterials = [];
  const noteElements = [];

  const coreMat = new THREE.MeshPhysicalMaterial({
    color: family.color,
    roughness: 0.3,
    metalness: 0.1,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
    emissive: family.color,
    emissiveIntensity: 0.4,
    envMapIntensity: 1,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), coreMat));
  colorMaterials.push({ material: coreMat, baseColor: coreMat.color.clone() });

  const auraMat = new THREE.SpriteMaterial({
    map: getMapGlowTexture(),
    color: family.color,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const aura = new THREE.Sprite(auraMat);
  aura.scale.setScalar(1.9);
  aura.renderOrder = -1;
  group.add(aura);
  colorMaterials.push({ material: auraMat, baseColor: auraMat.color.clone() });

  // columna central propia del nodo — misma lógica que la vista principal:
  // metalness/roughness/clearcoat por densidad/transmisión de la familia
  const spineHeight = MAP_MINI_LAYER_Y.top - MAP_MINI_LAYER_Y.base + 0.16;
  const spineMat = new THREE.MeshPhysicalMaterial({
    color: family.color,
    roughness: clamp01(1 - family.transmission),
    metalness: clamp01(family.density),
    clearcoat: clamp01(family.transmission),
    envMapIntensity: 1,
  });
  const spineMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, spineHeight, 10, 3, false), spineMat);
  spineMesh.position.y = (MAP_MINI_LAYER_Y.top + MAP_MINI_LAYER_Y.base) / 2;
  group.add(spineMesh);
  colorMaterials.push({ material: spineMat, baseColor: spineMat.color.clone() });

  pickMiniNotes(record).forEach(({ role, note }) => {
    const seed = hashString(note.key);
    const archetype = archetypeForNote(note.key);
    const built = NOTE_BUILDERS[archetype](seed, noteColor(family.color, note.key));

    // cromo y vidrio dependen casi por completo del reflejo/transmisión del
    // entorno para mostrar su color — a la escala minúscula de esta
    // miniatura eso los deja prácticamente negros; se les da un piso
    // emisivo para que su color de identidad siempre se lea
    if (archetype === "chrome" || archetype === "glass") {
      built.colorMaterials.forEach((m) => {
        m.emissive = m.color.clone();
        m.emissiveIntensity = 0.4;
      });
    }

    const rand = mulberry32(seed ^ 0x6f);
    const dir = noteDirection(note.key);

    const baseScale = 0.1 + rand() * 0.045;
    built.object.scale.setScalar(baseScale);
    built.object.position.copy(dir).multiplyScalar(0.42);
    built.object.position.y += MAP_MINI_LAYER_Y[role];
    built.object.rotation.copy(randomOrientation(seed));
    group.add(built.object);

    const spineAnchor = new THREE.Vector3(0, MAP_MINI_LAYER_Y[role], 0);
    const tendril = buildMiniTendril(spineAnchor, built.object.position, seed);
    group.add(tendril);
    colorMaterials.push({ material: tendril.material, baseColor: tendril.material.color.clone() });

    built.colorMaterials.forEach((m) => colorMaterials.push({ material: m, baseColor: m.color.clone() }));

    // se guarda para poder resaltar/atenuar esta nota puntual según
    // comparta o no con el foco actual (independiente del atenuado de
    // todo el nodo por hover)
    noteElements.push({ key: note.key, object: built.object, baseScale, tendril, shared: 1 });
  });

  return { object: group, colorMaterials, noteElements };
}

// ---- 14.3 estado del grafo ----

const mapNodes = new Map(); // id -> { id, record, ring, pos, vel, mesh, targetScale }
let mapEdges = []; // { a, b, weight }
let mapFocusId = null;
let mapSelectedId = null;
let mapHoverId = null;
let mapHoverNeighbors = new Set();
let mapHoverLabelIds = [];
const MAP_MAX_LABELS = 9; // + el propio nodo bajo el cursor = 10 etiquetas como máximo

// vecinos directos del nodo bajo el cursor — cambia sólo al cambiar de
// nodo (no cada frame), y dispara el atenuado del resto del grafo. las
// etiquetas flotantes usan sólo los N vecinos más afines (por notas en
// común), para no amontonarse en grafos grandes donde un nodo puede tener
// decenas de vecinos — el atenuado, en cambio, sigue considerándolos todos
function setMapHover(id) {
  if (id === mapHoverId) return;
  mapHoverId = id;
  mapHoverNeighbors = new Set();
  mapHoverLabelIds = [];
  if (id != null) {
    const weighted = [];
    mapEdges.forEach((e) => {
      if (e.a === id) {
        mapHoverNeighbors.add(e.b);
        weighted.push({ id: e.b, weight: e.weight });
      } else if (e.b === id) {
        mapHoverNeighbors.add(e.a);
        weighted.push({ id: e.a, weight: e.weight });
      }
    });
    weighted.sort((a, b) => b.weight - a.weight);
    mapHoverLabelIds = weighted.slice(0, MAP_MAX_LABELS).map((w) => w.id);
  }
}

function seedMapPosition(id, ring, around) {
  const h = hashString("map:" + id);
  const r1 = mulberry32(h)();
  const r2 = mulberry32(h ^ 0x55)();
  const theta = r1 * Math.PI * 2;
  const phi = Math.acos(2 * r2 - 1);
  const shell = 1.5 + ring * 1.6;
  const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
  return around.clone().addScaledVector(dir, shell);
}

function clearMapNodes() {
  mapNodes.forEach((node) => {
    mapScene.remove(node.mesh);
    disposeObject3D(node.mesh);
  });
  mapNodes.clear();
  mapEdges = [];
  mapFocusId = null;
  mapSelectedId = null;
  mapHoverId = null;
  mapHoverNeighbors = new Set();
  mapLabelPool.forEach((l) => (l.el.style.display = "none"));
}

// tamaño = nivel de similitud con el foco (nº de notas en común, normalizado
// por el perfume con menos notas de los dos) — el foco mismo usa una escala
// fija que lo distingue como ancla, no una "similitud consigo mismo"
function computeNodeTargetScale(node) {
  if (node.id === mapFocusId) return MAP_FOCUS_SCALE;
  const focus = mapNodes.get(mapFocusId);
  if (!focus) return 0.7;
  const shared = layeredSimilarity(focus.record, node.record);
  const denom = Math.max(1, Math.min(focus.record.noteKeySet.size, node.record.noteKeySet.size));
  const ratio = clamp01(shared / denom);
  return 0.45 + 0.75 * ratio;
}

function refreshMapNodeScales() {
  const focus = mapFocusId != null ? mapNodes.get(mapFocusId) : null;
  const focusKeys = focus ? focus.record.noteKeySet : null;
  mapNodes.forEach((node) => {
    node.targetScale = computeNodeTargetScale(node);
    // dentro de cada composición, sólo las notas que comparte con el foco
    // se ven a tamaño/brillo normal — el resto de sus propias notas se
    // reduce, para que la asociación se lea por lo que brilla, no
    // descifrando hasta 12 formas por nodo
    node.noteElements.forEach((el) => {
      el.sharedTarget = !focusKeys || focusKeys.has(el.key) ? 1 : 0;
    });
  });
}

function addMapNode(record, ring, seedPos) {
  if (mapNodes.has(record.id)) return mapNodes.get(record.id);
  const built = buildMiniComposition(record);
  const mesh = built.object;
  mesh.position.copy(seedPos);
  mesh.scale.setScalar(0.0001); // crece desde cero al aparecer
  mesh.userData.perfumeId = record.id;
  mapScene.add(mesh);

  const node = {
    id: record.id,
    record,
    ring,
    pos: seedPos.clone(),
    vel: new THREE.Vector3(),
    mesh,
    colorMaterials: built.colorMaterials,
    noteElements: built.noteElements,
    baseRadius: MAP_MINI_RADIUS,
    targetScale: 1,
    dim: 0,
    dimTarget: 0,
    wasDimmed: false,
  };
  mapNodes.set(record.id, node);
  return node;
}

function setMapFocus(id) {
  mapFocusId = id;
  const node = mapNodes.get(id);
  if (node) {
    // recentrar de inmediato: expandMapNode siembra a los nuevos vecinos
    // alrededor de esta posición justo después, y el encuadre de cámara
    // también se calcula ya — no puede esperar al próximo frame de la sim
    node.pos.set(0, 0, 0);
    node.vel.set(0, 0, 0);
    node.mesh.position.set(0, 0, 0);
  }
  els.mapFocusName.textContent = node ? `${node.record.name} — ${node.record.brand}` : "—";
  refreshMapNodeScales();
}

function rebuildMapEdges() {
  mapEdges = [];
  const ids = Array.from(mapNodes.keys());
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = mapNodes.get(ids[i]);
      const b = mapNodes.get(ids[j]);
      const weight = layeredSimilarity(a.record, b.record);
      if (weight >= MAP_MIN_SHARED) mapEdges.push({ a: ids[i], b: ids[j], weight });
    }
  }
  const posArr = new Float32Array(mapEdges.length * 2 * 3);
  const colArr = new Float32Array(mapEdges.length * 2 * 3);
  mapEdgeGeometry.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  mapEdgeGeometry.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
  updateMapStatus();
}

// aleja la cámara lo justo para que el radio actual del grafo entre en
// cuadro, preservando el ángulo de órbita actual del usuario — se llama
// tras cambios estructurales (expandir/reenfocar), no en cada frame, para
// no pelear con el zoom manual del usuario mientras explora
function fitMapCameraToNodes() {
  let maxDist = 2;
  mapNodes.forEach((node) => {
    maxDist = Math.max(maxDist, node.pos.length() + node.baseRadius * node.targetScale * 2.2);
  });
  const vFovHalf = THREE.MathUtils.degToRad(mapCamera.fov) / 2;
  const dist = THREE.MathUtils.clamp((maxDist / Math.tan(vFovHalf)) * 1.2, mapControls.minDistance, mapControls.maxDistance);
  const dir = mapCamera.position.clone().sub(mapControls.target);
  const dirN = dir.lengthSq() > 1e-6 ? dir.normalize() : new THREE.Vector3(0, 0.15, 1).normalize();
  mapCamera.position.copy(mapControls.target).addScaledVector(dirN, dist);
}

function expandMapNode(id) {
  const node = mapNodes.get(id);
  if (!node) return;
  if (mapNodes.size >= MAP_MAX_NODES) {
    flashMapStatus("límite de nodos alcanzado");
    return;
  }
  const excludeIds = new Set(mapNodes.keys());
  const remaining = MAP_MAX_NODES - mapNodes.size;
  const candidates = findLinkedCandidates(node.record, excludeIds, Math.min(MAP_EXPAND_LIMIT, remaining));
  const nextRing = node.ring + 1;
  candidates.forEach((c) => {
    addMapNode(RECORD_BY_ID.get(c.id), nextRing, seedMapPosition(c.id, nextRing, node.pos));
  });
  rebuildMapEdges();
  refreshMapNodeScales();
  fitMapCameraToNodes();
  // las posiciones recién sembradas no reflejan aún dónde asienta la
  // simulación de fuerzas — se reencuadra un par de veces más a medida
  // que se acomoda, en vez de una sola vez a mitad de camino
  [500, 1400].forEach((delay) => {
    setTimeout(() => {
      if (mapOpen) fitMapCameraToNodes();
    }, delay);
  });
}

function resetMapTo(record) {
  clearMapNodes();
  const root = addMapNode(record, 0, new THREE.Vector3(0, 0, 0));
  root.pos.set(0, 0, 0);
  root.mesh.position.set(0, 0, 0);
  setMapFocus(record.id);
  expandMapNode(record.id);
  els.mapInfoCard.hidden = true;
}

let mapStatusFlashUntil = 0;
let mapStatusFlashText = "";
function flashMapStatus(text) {
  mapStatusFlashText = text;
  mapStatusFlashUntil = performance.now() + 1800;
}
function updateMapStatus() {
  if (performance.now() < mapStatusFlashUntil) {
    els.mapStatus.textContent = mapStatusFlashText;
    return;
  }
  els.mapStatus.textContent = `${mapNodes.size} perfumes · ${mapEdges.length} vínculos`;
}

// ---- 14.4 simulación de fuerzas en 3D (repulsión + resortes + centrado) ----

function stepMapSimulation(dt) {
  const nodes = Array.from(mapNodes.values());
  const n = nodes.length;
  if (n === 0) return;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const delta = a.pos.clone().sub(b.pos);
      let dist = delta.length();
      if (dist < 0.001) {
        delta.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        dist = 0.001;
      }
      // el piso de distancia evita que 1/dist² explote a velocidades
      // absurdas cuando dos nodos casi se superponen (inestabilidad clásica
      // de simulaciones de n-cuerpos con pasos de tiempo discretos)
      const force = 1.5 / Math.max(dist, 0.35) ** 2;
      delta.normalize().multiplyScalar(force);
      a.vel.add(delta);
      b.vel.sub(delta);
    }
  }

  mapEdges.forEach((e) => {
    const a = mapNodes.get(e.a);
    const b = mapNodes.get(e.b);
    if (!a || !b) return;
    // más notas en común → resorte más corto: la cercanía espacial en el
    // mapa pasa a leerse directamente como nivel de parentesco olfativo —
    // pero nunca por debajo de lo que ocupan físicamente las dos
    // composiciones, o se solapan y saturan el espacio en vez de leerse
    // como "cerca"
    const minSafeDist = (a.baseRadius * a.targetScale + b.baseRadius * b.targetScale) * 1.25;
    const weightedRest = 3.4 - e.weight * 0.42;
    const rest = Math.max(minSafeDist, weightedRest, 0.9);
    const delta = b.pos.clone().sub(a.pos);
    const dist = Math.max(delta.length(), 0.001);
    const diff = (dist - rest) * 0.09;
    delta.normalize().multiplyScalar(diff);
    a.vel.add(delta);
    b.vel.sub(delta);
  });

  nodes.forEach((node) => {
    node.vel.addScaledVector(node.pos, -0.02);
    if (node.id === mapFocusId) {
      // el nodo enfocado queda fijo en el centro como ancla visual
      node.pos.set(0, 0, 0);
      node.vel.set(0, 0, 0);
    } else {
      node.vel.multiplyScalar(0.82);
      node.vel.clampLength(0, 6); // red de seguridad ante picos de fuerza puntuales
      node.pos.addScaledVector(node.vel, dt);
    }
    node.mesh.position.copy(node.pos);

    const approach = Math.min(1, dt * 4);
    const s = node.mesh.scale.x + (node.targetScale - node.mesh.scale.x) * approach;
    node.mesh.scale.setScalar(Math.max(s, 0.0001));

    // resaltar vecinos: atenúa todo lo que no esté conectado al nodo bajo
    // el cursor — sólo toca materiales mientras algo está (o estuvo)
    // atenuado, para no pagar el costo en el caso común sin hover
    node.dimTarget = mapHoverId == null ? 0 : node.id === mapHoverId || mapHoverNeighbors.has(node.id) ? 0 : 1;
    node.dim += (node.dimTarget - node.dim) * Math.min(1, dt * 6);
    const isDimmed = node.dim > 0.003;
    if (isDimmed || node.wasDimmed) {
      node.colorMaterials.forEach(({ material, baseColor }) => {
        material.color.copy(baseColor);
        if (isDimmed) material.color.multiplyScalar(1 - node.dim * 0.82);
      });
      node.wasDimmed = isDimmed;
    }

    // dentro del propio nodo: las notas que no comparte con el foco se
    // encogen y sus tendones se apagan, para que lo que conecta a dos
    // perfumes sea lo único que realmente resalte en la composición
    node.noteElements.forEach((el) => {
      const target = el.sharedTarget != null ? el.sharedTarget : 1;
      el.shared += (target - el.shared) * approach;
      const factor = 0.3 + 0.7 * el.shared;
      el.object.scale.setScalar(el.baseScale * factor);
      el.tendril.material.opacity = 0.12 + 0.43 * el.shared;
    });
  });
}

const MAP_EDGE_LO = new THREE.Color(0x11181a); // casi el negro de fondo — los vínculos débiles casi se funden con la escena
const MAP_EDGE_HI = new THREE.Color(0x3fe6d2);
const MAP_EDGE_DIM = new THREE.Color(0x0b0e0e);
const mapEdgeScratch = new THREE.Color();

function updateMapEdgeGeometry() {
  const posAttr = mapEdgeGeometry.getAttribute("position");
  if (!posAttr) return;
  const colAttr = mapEdgeGeometry.getAttribute("color");
  const maxWeight = mapEdges.reduce((m, e) => Math.max(m, e.weight), MAP_MIN_SHARED);
  mapEdges.forEach((e, i) => {
    const a = mapNodes.get(e.a);
    const b = mapNodes.get(e.b);
    if (!a || !b) return;
    posAttr.setXYZ(i * 2, a.pos.x, a.pos.y, a.pos.z);
    posAttr.setXYZ(i * 2 + 1, b.pos.x, b.pos.y, b.pos.z);
    const tLinear = clamp01((e.weight - MAP_MIN_SHARED) / Math.max(1, maxWeight - MAP_MIN_SHARED));
    const t = tLinear * tLinear; // curva: sólo los vínculos realmente fuertes se acercan al color vivo
    mapEdgeScratch.copy(MAP_EDGE_LO).lerp(MAP_EDGE_HI, t);
    if (mapHoverId != null && e.a !== mapHoverId && e.b !== mapHoverId) {
      mapEdgeScratch.lerp(MAP_EDGE_DIM, 0.88);
    }
    colAttr.setXYZ(i * 2, mapEdgeScratch.r, mapEdgeScratch.g, mapEdgeScratch.b);
    colAttr.setXYZ(i * 2 + 1, mapEdgeScratch.r, mapEdgeScratch.g, mapEdgeScratch.b);
  });
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
}

function mapAnimate() {
  mapAnimId = requestAnimationFrame(mapAnimate);
  const dt = Math.min(mapClock.getDelta(), 0.05);
  stepMapSimulation(dt);
  updateMapEdgeGeometry();
  updateMapLabels();
  updateMapStatus();
  mapControls.target.set(0, 0, 0); // red de seguridad: el target nunca debe alejarse del foco
  mapControls.update();
  mapRenderer.render(mapScene, mapCamera);
}

// ---- 14.5 interacción: hover / click (info) / doble click (enfocar + expandir) ----

const mapRaycaster = new THREE.Raycaster();

function mapNodeAtEvent(e) {
  const rect = mapRenderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  mapRaycaster.setFromCamera(ndc, mapCamera);
  const meshes = Array.from(mapNodes.values()).map((n) => n.mesh);
  const hits = mapRaycaster.intersectObjects(meshes, true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj && !obj.userData.perfumeId) obj = obj.parent;
  return obj ? mapNodes.get(obj.userData.perfumeId) : null;
}

// ---- 14.5b etiquetas flotantes: nombre del nodo bajo el cursor + sus
// vecinos resaltados, proyectados a coordenadas de pantalla cada frame.
// pool de <div> reutilizados en vez de uno por nodo (sólo se necesitan
// mientras hay hover activo, y como mucho foco+vecinos)

const mapLabelPool = [];

function projectToMapRoot(vec3) {
  const v = vec3.clone().project(mapCamera);
  const w = els.mapRoot.clientWidth;
  const h = els.mapRoot.clientHeight;
  return {
    x: (v.x * 0.5 + 0.5) * w,
    y: (-v.y * 0.5 + 0.5) * h,
    behind: v.z > 1 || v.z < -1,
  };
}

function getMapLabelEl(i) {
  let entry = mapLabelPool[i];
  if (!entry) {
    const el = document.createElement("div");
    el.className = "map-label";
    els.mapRoot.appendChild(el);
    entry = { el };
    mapLabelPool[i] = entry;
  }
  return entry.el;
}

function updateMapLabels() {
  if (mapHoverId == null) {
    mapLabelPool.forEach((l) => (l.el.style.display = "none"));
    return;
  }
  const ids = [mapHoverId, ...mapHoverLabelIds];
  ids.forEach((id, i) => {
    const node = mapNodes.get(id);
    const el = getMapLabelEl(i);
    if (!node) {
      el.style.display = "none";
      return;
    }
    const p = projectToMapRoot(node.mesh.position);
    el.style.display = p.behind ? "none" : "block";
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";
    el.textContent = node.record.name;
    el.classList.toggle("map-label-focus", id === mapHoverId);
  });
  for (let i = ids.length; i < mapLabelPool.length; i++) {
    mapLabelPool[i].el.style.display = "none";
  }
}

function onMapPointerMove(e) {
  const node = mapNodeAtEvent(e);
  if (!node) {
    tooltip.hidden = true;
    setMapHover(null);
    return;
  }
  setMapHover(node.id);
  tooltip.hidden = false;
  tooltip.style.left = e.clientX + "px";
  tooltip.style.top = e.clientY + "px";
  const focus = mapFocusId ? mapNodes.get(mapFocusId) : null;
  if (focus && focus.id !== node.id) {
    const shared = sharedNoteLabels(focus.record, node.record);
    tooltip.innerHTML = `<strong>${node.record.name}</strong>${node.record.brand} · comparte con el foco: ${shared.join(", ")}`;
  } else {
    tooltip.innerHTML = `<strong>${node.record.name}</strong>${node.record.brand} · foco actual`;
  }
}

function showMapInfoCard(node) {
  const focus = mapFocusId ? mapNodes.get(mapFocusId) : null;
  els.mapInfoCard.hidden = false;
  els.mapInfoName.textContent = node.record.name;
  els.mapInfoMeta.textContent = `${node.record.brand} · ${node.record.year ?? "s/f"} · ${node.record.familyLabel}`;
  if (focus && focus.id !== node.id) {
    const shared = sharedNoteLabels(focus.record, node.record);
    els.mapInfoShared.textContent = shared.length ? shared.join(", ") : "—";
  } else {
    els.mapInfoShared.textContent = "es el perfume foco";
  }
}

function onMapClick(e) {
  const node = mapNodeAtEvent(e);
  if (!node) return;
  mapSelectedId = node.id;
  showMapInfoCard(node);
}

function onMapDblClick(e) {
  const node = mapNodeAtEvent(e);
  if (!node) return;
  setMapFocus(node.id);
  mapSelectedId = node.id;
  expandMapNode(node.id);
  showMapInfoCard(node);
}

// ---- 14.6 abrir / cerrar / wiring ----

function openMap() {
  if (!current) return;
  ensureMapScene();
  els.mapPanel.hidden = false;
  els.mapToggle.setAttribute("aria-expanded", "true");
  mapOpen = true;
  resetMapTo(current);
  if (mapAnimId == null) mapAnimate();
}

function closeMap() {
  els.mapPanel.hidden = true;
  els.mapToggle.setAttribute("aria-expanded", "false");
  mapOpen = false;
  if (mapAnimId != null) {
    cancelAnimationFrame(mapAnimId);
    mapAnimId = null;
  }
  stopLegendPreviews();
  tooltip.hidden = true;
}

// ---- 14.6b leyenda con vista previa 3D real de cada arquetipo — reutiliza
// los mismos NOTE_BUILDERS que arman los nodos, así la miniatura es
// exactamente fiel a lo que se ve en el mapa (no un ícono aparte que se
// puede desincronizar). Cada fila tiene su propio canvas/renderer chico,
// creados una sola vez y sólo animados mientras la leyenda está abierta.
const LEGEND_PREVIEW_SPECS = [
  { archetype: "blob", canvasId: "legend-preview-blob", color: 0xff5fa8 },
  { archetype: "glass", canvasId: "legend-preview-glass", color: 0xffd23f },
  { archetype: "concrete", canvasId: "legend-preview-concrete", color: 0x4f6bff },
  { archetype: "fuzz", canvasId: "legend-preview-fuzz", color: 0x8a8f96 },
  { archetype: "chrome", canvasId: "legend-preview-chrome", color: 0x3fe6d2 },
];
const LEGEND_PREVIEW_SEED = 42;
let legendPreviewsInitialized = false;
let legendPreviewInstances = [];
let legendAnimId = null;

function ensureLegendPreviews() {
  if (legendPreviewsInitialized) return;
  legendPreviewsInitialized = true;

  LEGEND_PREVIEW_SPECS.forEach((spec) => {
    const canvas = document.getElementById(spec.canvasId);
    if (!canvas) return;
    const w = canvas.clientWidth || 44;
    const h = canvas.clientHeight || 44;

    const previewScene = new THREE.Scene();
    previewScene.environment = scene.environment;

    const fovDeg = 35;
    const camera = new THREE.PerspectiveCamera(fovDeg, w / h, 0.1, 20);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    previewScene.add(new THREE.AmbientLight(0x334455, 1.6));
    const key = new THREE.PointLight(0xffffff, 26, 20, 1.6);
    key.position.set(2, 2, 2);
    previewScene.add(key);

    const built = NOTE_BUILDERS[spec.archetype](LEGEND_PREVIEW_SEED, spec.color);
    if (spec.archetype === "chrome" || spec.archetype === "glass") {
      built.colorMaterials.forEach((m) => {
        m.emissive = m.color.clone();
        m.emissiveIntensity = 0.4;
      });
    }
    previewScene.add(built.object);

    // el tamaño real de cada arquetipo varía mucho (el concreto puede medir
    // hasta ~2.2 de alto, blob/vidrio/cromo rondan 1) — se encuadra la
    // cámara a la esfera envolvente real en vez de asumir una distancia
    // fija; se usa la esfera (no el bounding box) porque el objeto sigue
    // rotando después de este cálculo, y el radio no cambia al rotar
    built.object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(built.object);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const radius = Math.max(sphere.radius, 0.3);
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(fovDeg) / 2)) * 1.3;
    const dir = new THREE.Vector3(0.35, 0.25, 0.85).normalize();
    camera.position.copy(sphere.center).addScaledVector(dir, dist);
    camera.lookAt(sphere.center);

    legendPreviewInstances.push({ scene: previewScene, camera, renderer, object: built.object });
  });
}

function legendPreviewAnimate() {
  legendAnimId = requestAnimationFrame(legendPreviewAnimate);
  legendPreviewInstances.forEach(({ scene: previewScene, camera, renderer, object }) => {
    object.rotation.y += 0.012;
    object.rotation.x += 0.004;
    renderer.render(previewScene, camera);
  });
}

function stopLegendPreviews() {
  if (legendAnimId != null) {
    cancelAnimationFrame(legendAnimId);
    legendAnimId = null;
  }
}

function wireMapUI() {
  els.mapToggle.addEventListener("click", () => openMap());
  els.mapClose.addEventListener("click", () => closeMap());
  els.mapViewComposition.addEventListener("click", () => {
    const id = mapSelectedId || mapFocusId;
    if (!id) return;
    const record = RECORD_BY_ID.get(id);
    if (record) {
      selectPerfume(record);
      closeMap();
    }
  });
  els.mapLegendToggle.addEventListener("click", () => {
    const expanded = els.mapLegendToggle.getAttribute("aria-expanded") === "true";
    els.mapLegendToggle.setAttribute("aria-expanded", String(!expanded));
    els.mapLegendPanel.hidden = expanded;
    if (!expanded) {
      ensureLegendPreviews();
      if (legendAnimId == null) legendPreviewAnimate();
    } else {
      stopLegendPreviews();
    }
  });
}

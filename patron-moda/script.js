import { MEASUREMENT_GROUPS, defaultMeasurements } from "./measurements.js";
import { buildBodice, mirrorToFullPiece } from "./bodice.js";
import { renderBodiceSvg, renderRuler } from "./render.js";
import { buildDxf, downloadDxf } from "./dxf.js";

// v2: la pinza de espalda pasó a 3 cm y centrada; se descartan medidas guardadas antes.
const STORAGE_KEY = "patron-moda:measurements:v2";
const SCALE = 6; // px por cm

const form = document.getElementById("measurement-form");
const canvas = document.getElementById("pattern-canvas");
const rulerWrap = document.getElementById("ruler-wrap");
const mirrorToggle = document.getElementById("mirror-toggle");
const resetBtn = document.getElementById("reset-btn");
const exportBtn = document.getElementById("export-btn");
const statusLine = document.getElementById("status-line");
const modeCaption = document.getElementById("mode-caption");

let measurements = loadMeasurements();

function loadMeasurements() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMeasurements();
    return { ...defaultMeasurements(), ...JSON.parse(raw) };
  } catch {
    return defaultMeasurements();
  }
}

function saveMeasurements() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(measurements));
  } catch {
    // localStorage puede fallar (modo privado, cuota); no es crítico.
  }
}

function clamp(v, min, max) {
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

function buildForm() {
  form.innerHTML = "";
  for (const group of MEASUREMENT_GROUPS) {
    const details = document.createElement("details");
    if (group.open) details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = group.label;
    details.appendChild(summary);

    const list = document.createElement("div");
    list.className = "field-list";
    for (const field of group.fields) list.appendChild(buildFieldRow(field));
    details.appendChild(list);

    const section = document.createElement("section");
    section.appendChild(details);
    form.appendChild(section);
  }
  refreshConditionalRows();
}

// Filas con `showIf`: solo visibles mientras su interruptor está activo.
function refreshConditionalRows() {
  for (const row of form.querySelectorAll("[data-show-if]")) {
    row.hidden = !measurements[row.dataset.showIf];
  }
}

function buildToggleRow(field) {
  const row = document.createElement("label");
  row.className = "switch-row";
  const text = document.createElement("span");
  text.textContent = field.label;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(measurements[field.key]);
  input.addEventListener("change", () => {
    measurements[field.key] = input.checked;
    saveMeasurements();
    refreshConditionalRows();
    update();
  });
  row.append(text, input);
  return row;
}

function buildFieldRow(field) {
  if (field.type === "toggle") return buildToggleRow(field);
  const row = document.createElement("div");
  row.className = "spec-row";
  if (field.showIf) row.dataset.showIf = field.showIf;

  const label = document.createElement("label");
  label.htmlFor = `f-${field.key}`;
  label.textContent = field.label;

  const leader = document.createElement("div");
  leader.className = "leader";

  const value = document.createElement("div");
  value.className = "value";
  const number = document.createElement("input");
  number.type = "number";
  number.id = `f-${field.key}`;
  number.min = field.min;
  number.max = field.max;
  number.step = field.step;
  number.value = measurements[field.key];
  const unit = document.createElement("span");
  unit.className = "unit";
  unit.textContent = field.unit;
  value.append(number, unit);

  const range = document.createElement("input");
  range.type = "range";
  range.className = "slider";
  range.min = field.min;
  range.max = field.max;
  range.step = field.step;
  range.value = measurements[field.key];
  range.setAttribute("aria-label", field.label);

  const sync = (v) => {
    const val = clamp(Number(v), field.min, field.max);
    measurements[field.key] = val;
    range.value = val;
    number.value = val;
    saveMeasurements();
    update();
  };
  range.addEventListener("input", (e) => sync(e.target.value));
  number.addEventListener("change", (e) => sync(e.target.value));

  row.append(label, leader, value, range);
  return row;
}

function currentPieces() {
  const { front, back } = buildBodice(measurements);
  if (mirrorToggle.checked) return { front: mirrorToFullPiece(front), back: mirrorToFullPiece(back) };
  return { front, back };
}

function update() {
  const pieces = currentPieces();
  canvas.innerHTML = renderBodiceSvg(pieces, { scale: SCALE });
  const spanCm = Math.max(pieces.front.bounds.width, 20);
  rulerWrap.innerHTML = renderRuler(Math.ceil(spanCm / 5) * 5, SCALE);
  const view = mirrorToggle.checked
    ? "Vista: pieza completa (delantero + espalda espejados sobre el doblez)."
    : "Vista: mitad de pieza — la línea de doblez (punteada) va sobre el centro delantero/espalda.";
  const { front, back } = pieces;
  const side = front.sideMatched
    ? `Costado: delantero ${front.sideLength.toFixed(1)} cm = espalda ${back.sideLength.toFixed(1)} cm (pinza de busto cerrada).`
    : `Costado sin igualar: delantero ${front.sideLength.toFixed(1)} cm / espalda ${back.sideLength.toFixed(1)} cm — revisa pinza de busto o largos de talle.`;
  const dart = measurements.bustDartManual
    ? `Pinza de busto: ${front.bustDartDepth.toFixed(1)} cm (manual).`
    : `Pinza de busto: ${front.bustDartDepth.toFixed(1)} cm (talle delantero − talle espalda).`;
  modeCaption.textContent = `${view} ${dart} ${side}`;
}

buildForm();
mirrorToggle.addEventListener("change", update);
resetBtn.addEventListener("click", () => {
  measurements = defaultMeasurements();
  saveMeasurements();
  buildForm();
  update();
});
exportBtn.addEventListener("click", () => {
  const pieces = currentPieces();
  downloadDxf(buildDxf([pieces.front, pieces.back]), "patron-cuerpo-base.dxf");
  statusLine.textContent = "DXF generado.";
});

update();

import { MEASUREMENT_GROUPS, defaultMeasurements } from "./measurements.js";
import { buildBodice, mirrorToFullPiece } from "./bodice.js";
import { renderBodiceSvg } from "./render.js";
import { buildDxf, downloadDxf } from "./dxf.js";

const STORAGE_KEY = "patron-moda:measurements";

const form = document.getElementById("measurement-form");
const canvas = document.getElementById("pattern-canvas");
const mirrorToggle = document.getElementById("mirror-toggle");
const resetBtn = document.getElementById("reset-btn");
const exportBtn = document.getElementById("export-btn");

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

function buildForm() {
  form.innerHTML = "";
  for (const group of MEASUREMENT_GROUPS) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "field-group";
    if (group.collapsed) fieldset.classList.add("collapsed");

    const legend = document.createElement("legend");
    legend.textContent = group.label;
    legend.addEventListener("click", () => fieldset.classList.toggle("collapsed"));
    fieldset.appendChild(legend);

    for (const field of group.fields) {
      fieldset.appendChild(buildFieldRow(field));
    }
    form.appendChild(fieldset);
  }
}

function buildFieldRow(field) {
  const row = document.createElement("div");
  row.className = "field-row";

  const label = document.createElement("label");
  label.htmlFor = `f-${field.key}`;
  label.textContent = `${field.label} (${field.unit})`;

  const range = document.createElement("input");
  range.type = "range";
  range.id = `f-${field.key}`;
  range.min = field.min;
  range.max = field.max;
  range.step = field.step;
  range.value = measurements[field.key];

  const number = document.createElement("input");
  number.type = "number";
  number.className = "field-number";
  number.min = field.min;
  number.max = field.max;
  number.step = field.step;
  number.value = measurements[field.key];

  const sync = (value) => {
    const v = clamp(Number(value), field.min, field.max);
    measurements[field.key] = v;
    range.value = v;
    number.value = v;
    saveMeasurements();
    update();
  };

  range.addEventListener("input", (e) => sync(e.target.value));
  number.addEventListener("change", (e) => sync(e.target.value));

  row.appendChild(label);
  row.appendChild(range);
  row.appendChild(number);
  return row;
}

function clamp(v, min, max) {
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

function currentPieces() {
  const { front, back } = buildBodice(measurements);
  if (mirrorToggle.checked) {
    return { front: mirrorToFullPiece(front), back: mirrorToFullPiece(back) };
  }
  return { front, back };
}

function update() {
  const pieces = currentPieces();
  canvas.innerHTML = renderBodiceSvg(pieces);
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
  const dxfText = buildDxf([pieces.front, pieces.back]);
  downloadDxf(dxfText, "patron-cuerpo-base.dxf");
});

update();

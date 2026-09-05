// Motor geométrico del patrón de cuerpo base (delantero + espalda).
//
// Traduce paso a paso el método descrito en:
// https://thecopycat.blog/2021/03/01/como-hacer-un-patron-de-cuerpo-base/
//
// Sistema de coordenadas de cada pieza (independiente entre delantero/espalda):
//   x = 0  es el centro (delantero: centro delantero: CF · espalda: centro espalda: CB)
//   y = 0  es la línea superior de referencia (altura del hombro/cuello)
//   x crece hacia el costado, y crece hacia abajo (cintura, cadera).
//
// Puntos donde el artículo usa una instrucción de trazado "a mano" (curva suave,
// curva más pronunciada) se resuelven con curvas de Bézier cuyos puntos de control
// están anotados con el paso del artículo que representan — quedan documentados
// en el README del proyecto como aproximaciones, no como medidas literales del original.

const P = (x, y) => ({ x, y });
const add = (a, b) => P(a.x + b.x, a.y + b.y);
const sub = (a, b) => P(a.x - b.x, a.y - b.y);
const scale = (a, s) => P(a.x * s, a.y * s);
const lerp = (a, b, t) => add(a, scale(sub(b, a), t));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
function normalize(v) {
  const len = Math.hypot(v.x, v.y) || 1;
  return P(v.x / len, v.y / len);
}

function line(p0, p1, extra = {}) {
  return { type: "line", p0, p1, ...extra };
}
function quad(p0, c, p1, extra = {}) {
  return { type: "quad", p0, c, p1, ...extra };
}
function cubic(p0, c1, c2, p1, extra = {}) {
  return { type: "cubic", p0, c1, c2, p1, ...extra };
}

function bounds(segments) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (pt) => {
    minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
  };
  for (const seg of segments) {
    visit(seg.p0); visit(seg.p1);
    if (seg.c) visit(seg.c);
    if (seg.c1) visit(seg.c1);
    if (seg.c2) visit(seg.c2);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// --- Cuello (paso 3): curva inscrita en la esquina A, tangente al borde
// superior en A1 y al borde central en A2 — control = la esquina misma. ---
function neckCurve(A, A1, A2) {
  return quad(A1, A, A2, { role: "cuello" });
}

// --- Sisa: curva suave desde el punto de aplomo en el costado (U) hasta el
// hombro (S) — se traza en ese sentido porque el contorno recorre el costado
// de abajo hacia arriba. Ambos controles se acercan a la esquina de la caja
// de sisa (más angosta que el costado), que es el punto guía del paso 9
// ("aplomo de sisa"): el trazo entra "curvo" desde el costado y sale
// "más pronunciado" hacia el hombro. ---
function armholeCurve(U, boxCorner, S) {
  // boxCorner (esquina inferior de la caja de sisa) comparte la altura de U
  // por construcción, así que el primer control usa una fracción de esa
  // profundidad en vez de la diferencia (que sería cero).
  const c1 = P(boxCorner.x, U.y * 0.6);
  const c2 = P(boxCorner.x * 0.7 + S.x * 0.3, boxCorner.y * 0.3 + S.y * 0.7);
  return cubic(U, c1, c2, S, { role: "sisa" });
}

// --- Costado cadera→cintura: curva suave que cierra desde el ancho de
// cadera hacia el ancho de cintura (el contorno sube desde la cadera). ---
function hipCurve(H, W) {
  const c = P(H.x, W.y + (H.y - W.y) * 0.3);
  return quad(H, c, W, { role: "cadera" });
}

function shoulderPoint(A1, boxTopCorner, shoulderDrop, shoulderLength) {
  const guide = P(boxTopCorner.x, shoulderDrop);
  const dir = normalize(sub(guide, A1));
  return add(A1, scale(dir, shoulderLength));
}

/**
 * Construye una pieza (delantero o espalda).
 * @param {object} m measurements
 * @param {"front"|"back"} side
 */
function buildPiece(m, side) {
  const isFront = side === "front";
  const waistLength = isFront ? m.frontWaistLength : m.backWaistLength;
  const armholeDrop = isFront ? m.frontArmholeDrop : m.backArmholeDrop;
  const halfWidth = isFront ? m.chestWidth / 2 : m.backWidth / 2;
  const waistExtra = isFront ? m.frontWaistExtra : m.backWaistExtra;
  const waistDartLength = isFront ? m.frontWaistDartLength : m.backWaistDartLength;
  const waistDartWidth = isFront ? m.frontWaistDartWidth : m.backWaistDartWidth;

  // Paso 1: rectángulo base — alto = largo de talle, ancho = 1/4 contorno de busto.
  const A = P(0, 0); // esquina superior centro (CF/CB)
  const boxTopCorner = P(m.bust / 4, 0); // esquina superior costado

  // Paso 2: caja de sisa.
  const boxBottomCorner = P(halfWidth, armholeDrop);

  // Paso 3: cuello.
  const A1 = P(m.neck / 6 + m.neckHorizontalConst, 0);
  const neckVertical = isFront ? m.neck / 6 + m.neckVerticalConst : m.backNeckDrop;
  const A2 = P(0, neckVertical);

  // Paso 4: hombro.
  const S = shoulderPoint(A1, boxTopCorner, m.shoulderDrop, m.shoulderLength);

  // Punto de aplomo / costado a la altura de la sisa.
  const U = P(m.bust / 4, armholeDrop);

  // Cintura (costado).
  const W = P(m.waist / 4 + waistExtra, waistLength);
  const D = P(0, waistLength); // CF/CB en la cintura

  // Cadera.
  const H = P(m.hip / 4, waistLength + m.hipHeight);
  const Hc = P(0, waistLength + m.hipHeight); // CF/CB en la cadera

  const outline = [];
  const darts = [];
  const points = { A, boxTopCorner, boxBottomCorner, A1, A2, S, U, W, D, H, Hc };

  if (isFront) {
    // Pasos 6-7: ápice de busto y pinza lateral (sobre el costado).
    const apex = P(m.bustSeparation / 2, m.bustHeight);
    const L1 = P(m.bust / 4, m.bustHeight - m.bustDartDepth / 2);
    const L2 = P(m.bust / 4, m.bustHeight + m.bustDartDepth / 2);
    // Paso 9: despegar la pinza del ápice real (queda "corta" respecto a P),
    // desplazando el vértice hacia el costado (L1/L2 comparten x con U).
    const dartDir = normalize(sub(P(L1.x, apex.y), apex));
    const dartTip = add(apex, scale(dartDir, m.dartRelease));

    points.apex = apex;
    points.bustDartTip = dartTip;

    outline.push(line(A2, D, { fold: true }));
    outline.push(line(D, Hc, { fold: true }));
    outline.push(line(Hc, H));
    outline.push(hipCurve(H, W));
    // Paso 8-9: costado con la muesca de la pinza de busto.
    outline.push(line(W, L2));
    outline.push(line(L2, dartTip, { role: "pinza-busto" }));
    outline.push(line(dartTip, L1, { role: "pinza-busto" }));
    outline.push(line(L1, U));
    outline.push(armholeCurve(U, boxBottomCorner, S));
    outline.push(line(S, A1));
    outline.push(neckCurve(A, A1, A2));

    // Paso 8: pinza de talle delantera (independiente, hacia arriba desde la cintura).
    const dartCenterX = m.bustSeparation / 2;
    const wd1 = P(dartCenterX - waistDartWidth / 2, waistLength);
    const wd2 = P(dartCenterX + waistDartWidth / 2, waistLength);
    const wTip = P(dartCenterX, waistLength - waistDartLength);
    darts.push({ id: "pinza-talle-delantera", points: [wd1, wTip, wd2] });
  } else {
    outline.push(line(A2, D, { fold: true }));
    outline.push(line(D, Hc, { fold: true }));
    outline.push(line(Hc, H));
    outline.push(hipCurve(H, W));
    outline.push(line(W, U));
    outline.push(armholeCurve(U, boxBottomCorner, S));
    outline.push(line(S, A1));
    outline.push(neckCurve(A, A1, A2));

    // Pinza de talle espalda, centrada bajo el ancho de espalda (no especificado
    // por el artículo con una posición exacta; se asume centrada — ver README).
    const dartCenterX = m.backWidth / 2;
    const bd1 = P(dartCenterX - waistDartWidth / 2, waistLength);
    const bd2 = P(dartCenterX + waistDartWidth / 2, waistLength);
    const bTip = P(dartCenterX, waistLength - waistDartLength);
    darts.push({ id: "pinza-talle-espalda", points: [bd1, bTip, bd2] });
  }

  return {
    id: side,
    label: isFront ? "Delantero (mitad, doblar en el centro)" : "Espalda (mitad, doblar en el centro)",
    outline,
    darts,
    points,
    bounds: bounds(outline),
  };
}

export function buildBodice(measurements) {
  return {
    front: buildPiece(measurements, "front"),
    back: buildPiece(measurements, "back"),
  };
}

function mirrorXPoint(p) {
  return P(-p.x, p.y);
}

function mirrorXSegment(seg) {
  const out = { ...seg, p0: mirrorXPoint(seg.p0), p1: mirrorXPoint(seg.p1) };
  if (seg.c) out.c = mirrorXPoint(seg.c);
  if (seg.c1) out.c1 = mirrorXPoint(seg.c1);
  if (seg.c2) out.c2 = mirrorXPoint(seg.c2);
  return out;
}

function reverseSegment(seg) {
  const out = { ...seg, p0: seg.p1, p1: seg.p0 };
  if (seg.type === "cubic") {
    out.c1 = seg.c2;
    out.c2 = seg.c1;
  }
  return out;
}

/**
 * A partir de la mitad trazada (CF/CB en x=0), genera la pieza completa
 * espejada. El borde de doblez deja de ser perímetro de corte y pasa a ser
 * una línea guía interior (`centerLine`).
 */
export function mirrorToFullPiece(piece) {
  const cutSegs = piece.outline.filter((s) => !s.fold);
  const foldSegs = piece.outline.filter((s) => s.fold);
  const mirroredReversed = cutSegs
    .slice()
    .reverse()
    .map((s) => reverseSegment(mirrorXSegment(s)));
  const fullOutline = cutSegs.concat(mirroredReversed);
  const fullDarts = piece.darts.concat(
    piece.darts.map((d) => ({ id: `${d.id}-espejo`, points: d.points.map(mirrorXPoint) }))
  );
  return {
    ...piece,
    label: piece.label.replace("(mitad, doblar en el centro)", "(pieza completa)"),
    outline: fullOutline,
    darts: fullDarts,
    centerLine: foldSegs,
    mirrored: true,
    bounds: bounds(fullOutline),
  };
}

export const geom = { P, add, sub, scale, lerp, dist, normalize };

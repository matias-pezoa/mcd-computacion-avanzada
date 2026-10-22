// Motor geométrico del patrón de cuerpo base (delantero + espalda).
//
// Traduce paso a paso el método de:
// https://thecopycat.blog/2021/03/01/como-hacer-un-patron-de-cuerpo-base/
//
// Coordenadas de cada pieza (independientes entre delantero y espalda):
//   x = 0  es el centro (CF delantero · CB espalda), borde de doblez
//   y = 0  es la línea superior de referencia (altura del hombro/cuello)
//   x crece hacia el costado, y crece hacia abajo (cintura, cadera).
//
// Donde el artículo pide "curva suave" a mano alzada, se usan curvas de
// Bézier con puntos de control elegidos para pasar cerca de las esquinas de
// construcción; ver README.

const P = (x, y) => ({ x, y });
const add = (a, b) => P(a.x + b.x, a.y + b.y);
const sub = (a, b) => P(a.x - b.x, a.y - b.y);
const scale = (a, s) => P(a.x * s, a.y * s);
function normalize(v) {
  const len = Math.hypot(v.x, v.y) || 1;
  return P(v.x / len, v.y / len);
}

const line = (p0, p1, extra = {}) => ({ type: "line", p0, p1, ...extra });
const quad = (p0, c, p1, extra = {}) => ({ type: "quad", p0, c, p1, ...extra });
const cubic = (p0, c1, c2, p1, extra = {}) => ({ type: "cubic", p0, c1, c2, p1, ...extra });

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

// Escote (paso 3): scoop que se hunde hacia el interior de la pieza. Sale
// vertical desde el cuello-hombro (A1) y llega horizontal al centro (A2): queda
// perpendicular al doblez y cóncavo respecto de la esquina A.
function neckCurve(A1, A2) {
  const c1 = P(A1.x, A2.y * 0.55);
  const c2 = P(A1.x * 0.55, A2.y);
  return cubic(A1, c1, c2, A2, { role: "cuello" });
}

// Sisa: desde el costado (U) hasta el hombro (S), en el sentido en que el
// contorno recorre la pieza. Ambos controles se acercan a la esquina de la caja
// de sisa (más angosta que el costado), el punto guía del "aplomo de sisa".
function armholeCurve(U, boxCorner, S) {
  const c1 = P(boxCorner.x, U.y * 0.6);
  const c2 = P(boxCorner.x * 0.7 + S.x * 0.3, boxCorner.y * 0.3 + S.y * 0.7);
  return cubic(U, c1, c2, S, { role: "sisa" });
}

// Costado cadera -> cintura.
function hipCurve(H, W) {
  const c = P(H.x, W.y + (H.y - W.y) * 0.3);
  return quad(H, c, W, { role: "cadera" });
}

function shoulderPoint(A1, boxTopCorner, shoulderDrop, shoulderLength) {
  const guide = P(boxTopCorner.x, shoulderDrop);
  const dir = normalize(sub(guide, A1));
  return add(A1, scale(dir, shoulderLength));
}

// Pinza de talle en diamante: ancho máximo sobre la cintura, puntas superior e
// inferior sobre la misma vertical.
function waistDart(id, x0, waistY, width, topY, bottomY) {
  return {
    id,
    closed: true,
    points: [P(x0, topY), P(x0 + width / 2, waistY), P(x0, bottomY), P(x0 - width / 2, waistY)],
  };
}

/**
 * @param {object} m medidas
 * @param {"front"|"back"} side
 */
function buildPiece(m, side) {
  const isFront = side === "front";
  const waistLength = isFront ? m.frontWaistLength : m.backWaistLength;
  const armholeDrop = isFront ? m.frontArmholeDrop : m.backArmholeDrop;
  const halfWidth = isFront ? m.chestWidth / 2 : m.backWidth / 2;
  const dartWidth = isFront ? m.frontWaistDartWidth : m.backWaistDartWidth;
  const dartDown = isFront ? m.frontWaistDartLength : m.backWaistDartLength;

  // Pasos 1-2: rectángulo base (alto = largo de talle, ancho = busto/4) y caja de sisa.
  const A = P(0, 0);
  const boxTopCorner = P(m.bust / 4, 0);
  const boxBottomCorner = P(halfWidth, armholeDrop);

  // Paso 3: cuello.
  const A1 = P(m.neck / 6 + m.neckHorizontalConst, 0);
  const neckVertical = isFront ? m.neck / 6 + m.neckVerticalConst : m.backNeckDrop;
  const A2 = P(0, neckVertical);

  // Paso 4: hombro.
  const S = shoulderPoint(A1, boxTopCorner, m.shoulderDrop, m.shoulderLength);

  const U = P(m.bust / 4, armholeDrop);
  // La pinza consume `dartWidth` en la cintura: el panel se traza a
  // cintura/4 + ancho de pinza para que, cosida la pinza, quede cintura/4.
  const W = P(m.waist / 4 + dartWidth, waistLength);
  const D = P(0, waistLength);
  const H = P(m.hip / 4, waistLength + m.hipHeight);
  const Hc = P(0, waistLength + m.hipHeight);

  const outline = [];
  const darts = [];
  const guides = [{ points: [D, W] }];
  const points = { A, boxTopCorner, boxBottomCorner, A1, A2, S, U, W, D, H, Hc };

  if (isFront) {
    // Pasos 6-7: ápice de busto y pinza lateral (muesca sobre el costado).
    const apex = P(m.bustSeparation / 2, m.bustHeight);
    const L1 = P(m.bust / 4, m.bustHeight - m.bustDartDepth / 2);
    const L2 = P(m.bust / 4, m.bustHeight + m.bustDartDepth / 2);
    // Paso 9: despegar la pinza del ápice real hacia el costado.
    const dartDir = normalize(sub(P(L1.x, apex.y), apex));
    const dartTip = add(apex, scale(dartDir, m.dartRelease));
    points.apex = apex;
    points.bustDartTip = dartTip;

    outline.push(line(A2, D, { fold: true }));
    outline.push(line(D, Hc, { fold: true }));
    outline.push(line(Hc, H));
    outline.push(hipCurve(H, W));
    outline.push(line(W, L2));
    outline.push(line(L2, dartTip, { role: "pinza-busto" }));
    outline.push(line(dartTip, L1, { role: "pinza-busto" }));
    outline.push(line(L1, U));
    outline.push(armholeCurve(U, boxBottomCorner, S));
    outline.push(line(S, A1));
    outline.push(neckCurve(A1, A2));

    // Paso 8: pinza de talle sobre la vertical del busto; la punta superior
    // apunta al ápice y se despega `dartRelease`, la inferior se proyecta a la cadera.
    const x0 = m.bustSeparation / 2;
    darts.push(waistDart("pinza-talle-delantera", x0, waistLength, dartWidth, m.bustHeight + m.dartRelease, waistLength + dartDown));
  } else {
    outline.push(line(A2, D, { fold: true }));
    outline.push(line(D, Hc, { fold: true }));
    outline.push(line(Hc, H));
    outline.push(hipCurve(H, W));
    outline.push(line(W, U));
    outline.push(armholeCurve(U, boxBottomCorner, S));
    outline.push(line(S, A1));
    outline.push(neckCurve(A1, A2));

    // Centrada en la cintura del panel (entre CB y el costado W), desplazable
    // con `backDartOffset`; el desplazamiento se limita para que la pinza no
    // se salga del panel. Punta superior hacia la escápula.
    const center = W.x / 2;
    const maxOffset = Math.max(0, center - dartWidth / 2 - 0.5);
    const x0 = center + Math.min(maxOffset, Math.max(-maxOffset, m.backDartOffset ?? 0));
    darts.push(waistDart("pinza-talle-espalda", x0, waistLength, dartWidth, waistLength - m.backDartUpperLength, waistLength + dartDown));
  }

  return {
    id: side,
    label: isFront ? "Delantero (mitad, doblar en el centro)" : "Espalda (mitad, doblar en el centro)",
    outline,
    darts,
    guides,
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
 * Espeja la mitad trazada sobre el eje x=0. El doblez deja de ser perímetro de
 * corte y pasa a ser una línea guía interior (`centerLine`).
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
    piece.darts.map((d) => ({ ...d, id: `${d.id}-espejo`, points: d.points.map(mirrorXPoint) }))
  );
  // Cada guía parte del eje (x=0): la pieza completa la une con su espejo.
  const fullGuides = piece.guides.map((g) => ({ points: [mirrorXPoint(g.points[1]), g.points[1]] }));
  return {
    ...piece,
    label: piece.label.replace("(mitad, doblar en el centro)", "(pieza completa)"),
    outline: fullOutline,
    darts: fullDarts,
    guides: fullGuides,
    centerLine: foldSegs,
    mirrored: true,
    bounds: bounds(fullOutline),
  };
}

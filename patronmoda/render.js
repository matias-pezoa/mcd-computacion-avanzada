// Dibuja las piezas del patrón (delantero/espalda) como SVG.
// El espacio de la pieza (x derecha, y abajo) coincide 1:1 con el espacio SVG,
// así que solo se aplica escala (cm -> px) y una traducción para ubicar cada
// pieza dentro del lienzo.

function segPathData(segments) {
  if (!segments.length) return "";
  let d = `M ${segments[0].p0.x} ${segments[0].p0.y}`;
  for (const seg of segments) {
    if (seg.type === "line") d += ` L ${seg.p1.x} ${seg.p1.y}`;
    else if (seg.type === "quad") d += ` Q ${seg.c.x} ${seg.c.y} ${seg.p1.x} ${seg.p1.y}`;
    else if (seg.type === "cubic") d += ` C ${seg.c1.x} ${seg.c1.y} ${seg.c2.x} ${seg.c2.y} ${seg.p1.x} ${seg.p1.y}`;
  }
  return d;
}

function dartPathData(points) {
  return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y} L ${points[2].x} ${points[2].y}`;
}

function piecesToSvgGroup(piece, scale) {
  const cutSegs = piece.outline.filter((s) => !s.fold);
  const foldSegs = piece.centerLine ?? piece.outline.filter((s) => s.fold);
  const g = [];
  g.push(
    `<path class="pattern-cut" d="${segPathData(cutSegs)}" transform="scale(${scale})" />`
  );
  if (foldSegs.length) {
    g.push(
      `<path class="pattern-fold" d="${segPathData(foldSegs)}" transform="scale(${scale})" />`
    );
  }
  for (const dart of piece.darts) {
    g.push(
      `<path class="pattern-dart" d="${dartPathData(dart.points)}" transform="scale(${scale})" />`
    );
  }
  const apex = piece.points.apex;
  if (apex) {
    g.push(
      `<circle class="pattern-apex" cx="${apex.x * scale}" cy="${apex.y * scale}" r="2.5" />`
    );
  }
  return g.join("\n");
}

export function renderBodiceSvg({ front, back }, { scale = 6, margin = 24, gap = 48 } = {}) {
  const fb = front.bounds;
  const bb = back.bounds;
  const frontW = fb.width * scale;
  const frontH = fb.height * scale;
  const backW = bb.width * scale;
  const backH = bb.height * scale;
  const height = Math.max(frontH, backH) + margin * 2;
  const width = frontW + backW + gap + margin * 2;

  // Se resta minX/minY escalado porque una pieza espejada tiene x negativa
  // (mitad izquierda) y no debe recortarse contra el borde del lienzo.
  const frontX = margin - fb.minX * scale;
  const frontY = margin - fb.minY * scale;
  const backX = margin + frontW + gap - bb.minX * scale;
  const backY = margin - bb.minY * scale;

  return `
<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace, monospace">
  <g transform="translate(${frontX}, ${frontY})">
    <text class="pattern-label" x="${fb.minX * scale}" y="-8">${front.label}</text>
    ${piecesToSvgGroup(front, scale)}
  </g>
  <g transform="translate(${backX}, ${backY})">
    <text class="pattern-label" x="${bb.minX * scale}" y="-8">${back.label}</text>
    ${piecesToSvgGroup(back, scale)}
  </g>
</svg>`;
}

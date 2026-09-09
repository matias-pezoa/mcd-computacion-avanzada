/**
 * Motor de extrusion / loft parametrico.
 *
 * Dado (a) un perfil 2D cerrado, (b) una curva guia 3D (spine) y (c) una
 * funcion de escalado a lo largo de esa curva, barre el perfil generando una
 * malla tubular con el escalado aplicado seccion a seccion.
 *
 * Es una funcion pura: recibe datos, devuelve datos. No toca React ni la
 * escena. Depende de Three SOLO para la curva y sus marcos de Frenet.
 */
import * as THREE from 'three'
import type { ScaleFn, Vec2 } from './types'

/** Escala por debajo de la cual una seccion se considera colapsada al eje. */
const COLLAPSE_EPS = 1e-4
/** Area (en unidades de Three^2) por debajo de la cual un triangulo se descarta. */
const DEGENERATE_AREA_EPS = 1e-10

/**
 * Como se orienta el perfil a lo largo de la curva.
 * - `frenet`: marcos de Frenet (curvatura de la curva). Puede torcer en curvas
 *   casi planas o rectas.
 * - `reference`: se fija un eje "ancho" del perfil cercano al vector `up`
 *   (proyectado perpendicular a la tangente). Estable, sin giros; ideal para
 *   piezas planas que emergen de una superficie (plumas sobre tela).
 */
export type LoftFrame = { type: 'frenet' } | { type: 'reference'; up: THREE.Vector3 }

export interface LoftOptions {
  /** Numero de secciones a lo largo de la curva (>= 2). */
  sections: number
  /** Cerrar los extremos con tapas (si la seccion no esta colapsada). */
  caps: boolean
  /** Orientacion del perfil. Por defecto Frenet. */
  frame?: LoftFrame
}

export const DEFAULT_LOFT_OPTIONS: LoftOptions = { sections: 96, caps: true }

export interface LoftResult {
  geometry: THREE.BufferGeometry
  /** Anillos de vertices [seccion][puntoDelPerfil], en unidades de Three. */
  rings: THREE.Vector3[][]
  /** Indices de secciones que quedaron colapsadas (escala ~ 0). */
  collapsedSections: number[]
  /** Triangulos descartados por ser degenerados. */
  droppedTriangles: number
  sectionCount: number
  profilePointCount: number
}

/**
 * @param profile  polilinea CERRADA (sin repetir el primer punto al final),
 *                 en unidades de Three, centrada en el origen. Eje x -> normal
 *                 de la curva, eje y -> binormal.
 * @param curve    curva guia; se muestrea de forma uniforme en su parametro.
 * @param scaleFn  t en [0,1] -> factor de escala del perfil en esa seccion.
 */
export function loftProfile(
  profile: readonly Vec2[],
  curve: THREE.Curve<THREE.Vector3>,
  scaleFn: ScaleFn,
  options: LoftOptions = DEFAULT_LOFT_OPTIONS,
): LoftResult {
  const M = profile.length
  if (M < 3) throw new Error('El perfil necesita al menos 3 puntos.')
  const sections = Math.max(2, Math.round(options.sections))
  const segments = sections - 1

  const points: THREE.Vector3[] = []
  for (let i = 0; i <= segments; i++) points.push(curve.getPoint(i / segments))
  const axes = buildAxes(curve, segments, options.frame ?? { type: 'frenet' })

  const rings: THREE.Vector3[][] = []
  const collapsedSections: number[] = []
  const scales: number[] = []

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const s = Math.max(0, scaleFn(t))
    scales.push(s)
    const collapsed = s < COLLAPSE_EPS
    if (collapsed) collapsedSections.push(i)

    const origin = points[i]
    const axisX = axes[i].x // eje del ancho del perfil (profile.x)
    const axisY = axes[i].y // eje del espesor del perfil (profile.y)
    const ring: THREE.Vector3[] = []
    for (let j = 0; j < M; j++) {
      if (collapsed) {
        ring.push(origin.clone())
        continue
      }
      const [px, py] = profile[j]
      const v = origin.clone()
      v.addScaledVector(axisX, px * s)
      v.addScaledVector(axisY, py * s)
      ring.push(v)
    }
    rings.push(ring)
  }

  // --- Vertices planos ---
  const vertexCount = (segments + 1) * M
  const positions = new Float32Array(vertexCount * 3)
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j < M; j++) {
      const v = rings[i][j]
      const o = (i * M + j) * 3
      positions[o] = v.x
      positions[o + 1] = v.y
      positions[o + 2] = v.z
    }
  }

  // --- Triangulos del cuerpo ---
  const tris: number[] = []
  const droppedRef = { count: 0 }
  const pushTri = (a: number, b: number, c: number) => {
    if (triangleArea(positions, a, b, c) > DEGENERATE_AREA_EPS) tris.push(a, b, c)
    else droppedRef.count++
  }

  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < M; j++) {
      const jn = (j + 1) % M
      const a = i * M + j
      const b = i * M + jn
      const c = (i + 1) * M + jn
      const d = (i + 1) * M + j
      pushTri(a, b, c)
      pushTri(a, c, d)
    }
  }

  // --- Tapas ---
  const extra: number[] = []
  let nextVertex = vertexCount
  if (options.caps) {
    if (scales[0] >= COLLAPSE_EPS) {
      nextVertex = addCap(
        positions,
        extra,
        tris,
        rings[0],
        0,
        M,
        nextVertex,
        true,
        droppedRef,
      )
    }
    if (scales[segments] >= COLLAPSE_EPS) {
      nextVertex = addCap(
        positions,
        extra,
        tris,
        rings[segments],
        segments * M,
        M,
        nextVertex,
        false,
        droppedRef,
      )
    }
  }

  const finalPositions = extra.length > 0 ? concatFloat32(positions, extra) : positions

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(finalPositions, 3))
  geometry.setIndex(tris)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  return {
    geometry,
    rings,
    collapsedSections,
    droppedTriangles: droppedRef.count,
    sectionCount: segments + 1,
    profilePointCount: M,
  }
}

/** Pares de ejes (ancho, espesor) del perfil por seccion. */
function buildAxes(
  curve: THREE.Curve<THREE.Vector3>,
  segments: number,
  frame: LoftFrame,
): { x: THREE.Vector3; y: THREE.Vector3 }[] {
  const axes: { x: THREE.Vector3; y: THREE.Vector3 }[] = []
  if (frame.type === 'frenet') {
    const frames = curve.computeFrenetFrames(segments, false)
    for (let i = 0; i <= segments; i++) {
      axes.push({ x: frames.normals[i], y: frames.binormals[i] })
    }
    return axes
  }
  const up = frame.up.clone().normalize()
  for (let i = 0; i <= segments; i++) {
    const t = curve.getTangent(i / segments).normalize()
    const x = up.clone().addScaledVector(t, -up.dot(t))
    if (x.lengthSq() < 1e-8) {
      x.set(1, 0, 0).addScaledVector(t, -t.x)
      if (x.lengthSq() < 1e-8) x.set(0, 0, 1).addScaledVector(t, -t.z)
    }
    x.normalize()
    const y = new THREE.Vector3().crossVectors(t, x).normalize()
    axes.push({ x, y })
  }
  return axes
}

/** Area del triangulo (a,b,c) leyendo el array plano de posiciones. */
function triangleArea(pos: Float32Array, a: number, b: number, c: number): number {
  const ax = pos[a * 3]
  const ay = pos[a * 3 + 1]
  const az = pos[a * 3 + 2]
  const bx = pos[b * 3] - ax
  const by = pos[b * 3 + 1] - ay
  const bz = pos[b * 3 + 2] - az
  const cx = pos[c * 3] - ax
  const cy = pos[c * 3 + 1] - ay
  const cz = pos[c * 3 + 2] - az
  const nx = by * cz - bz * cy
  const ny = bz * cx - bx * cz
  const nz = bx * cy - by * cx
  return 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz)
}

/**
 * Agrega una tapa triangulada en abanico desde el centroide del anillo.
 * `front = true` para la tapa inicial (winding invertido respecto al cuerpo).
 */
function addCap(
  basePositions: Float32Array,
  extra: number[],
  tris: number[],
  ring: THREE.Vector3[],
  ringStartIndex: number,
  M: number,
  nextVertex: number,
  front: boolean,
  droppedRef: { count: number },
): number {
  const centroid = new THREE.Vector3()
  for (const v of ring) centroid.add(v)
  centroid.multiplyScalar(1 / ring.length)

  const centerIndex = nextVertex
  extra.push(centroid.x, centroid.y, centroid.z)

  const areaOf = (a: number, b: number, c: number) =>
    triangleAreaMixed(basePositions, extra, a, b, c)

  for (let j = 0; j < M; j++) {
    const jn = (j + 1) % M
    const a = centerIndex
    const b = ringStartIndex + j
    const c = ringStartIndex + jn
    const tri = front ? [a, c, b] : [a, b, c]
    if (areaOf(tri[0], tri[1], tri[2]) > DEGENERATE_AREA_EPS)
      tris.push(tri[0], tri[1], tri[2])
    else droppedRef.count++
  }
  return nextVertex + 1
}

/** Como triangleArea pero un indice puede caer en el array `extra`. */
function triangleAreaMixed(
  base: Float32Array,
  extra: number[],
  a: number,
  b: number,
  c: number,
): number {
  const get = (i: number, comp: number): number => {
    const flat = i * 3 + comp
    return flat < base.length ? base[flat] : extra[flat - base.length]
  }
  const ax = get(a, 0)
  const ay = get(a, 1)
  const az = get(a, 2)
  const bx = get(b, 0) - ax
  const by = get(b, 1) - ay
  const bz = get(b, 2) - az
  const cx = get(c, 0) - ax
  const cy = get(c, 1) - ay
  const cz = get(c, 2) - az
  const nx = by * cz - bz * cy
  const ny = bz * cx - bx * cz
  const nz = bx * cy - by * cx
  return 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz)
}

function concatFloat32(a: Float32Array, tail: number[]): Float32Array {
  const out = new Float32Array(a.length + tail.length)
  out.set(a, 0)
  out.set(tail, a.length)
  return out
}

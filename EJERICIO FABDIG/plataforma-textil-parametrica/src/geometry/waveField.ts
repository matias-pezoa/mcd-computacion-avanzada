/**
 * "Ondas": panel solido con relieve corrugado (costillas) generado por
 * funciones trigonometricas, dirigido por el mapa de atractores.
 *
 * Cada atractor emite una ondulacion RADIAL (como un circulo concentrico
 * que se aleja de una piedra tirada al agua): la altura de la costilla en un
 * punto del panel es `sin(2*pi*distancia/longitudDeOnda)`, con una envolvente
 * (el mismo `falloff` de attractionField.ts) que apaga la onda lejos del
 * atractor. Varios atractores se combinan igual que en el modo Volumen (max
 * o suma).
 *
 * El panel es un SOLIDO: una base plana de espesor minimo (siempre horizontal,
 * apoyada de punta a punta sobre la tela — misma logica que en spike.ts: la
 * base nunca se inclina ni se afina) con la superficie de arriba deformada
 * por las ondas. La malla se genera con resolucion BAJA respecto de la
 * longitud de onda (`facetsPerWave`) para que las crestas se vean como
 * facetas planas — costillas — en vez de una onda suavizada; el material se
 * renderiza con sombreado plano (`flatShading`) para acentuarlo.
 *
 * Factibilidad de impresion: la amplitud se recorta para que la pendiente
 * maxima de la onda (que para una senoidal es amplitud * 2*pi/longitudDeOnda)
 * nunca supere el angulo de vuelo autosoportado — mismo principio que en
 * spike.ts, misma constante `SAFE_OVERHANG_DEG`.
 *
 * Funcion pura.
 */
import * as THREE from 'three'
import { clamp, DEG2RAD } from '../utils/params'
import type { NumberParam } from '../utils/params'
import { mmToThree, threeToMm } from '../utils/units'
import { SAFE_OVERHANG_DEG } from './printability'
import { falloff } from './attractionField'
import type { Attractor, CombineMode } from './attractionField'
import { pointInBoundary, polygonBounds, type Boundary, type Vec2 } from './polygon'

/** Piso de espesor de la base, en mm (2 perimetros de una boquilla de 0.4mm). */
export const MIN_BASE_THICKNESS_MM = 0.8
/** Piso de longitud de onda, en mm (que una costilla no sea mas fina que un par de lineas). */
export const MIN_WAVELENGTH_MM = 4

export interface WaveFieldParams {
  /** Lado del panel cuadrado (u3d). Centrado en el origen, base en y = 0. */
  planeSize: number
  /** Espesor de la base plana, siempre constante (piso MIN_BASE_THICKNESS_MM). */
  thicknessBaseMm: number
  /** Amplitud pedida de las costillas (se recorta por seguridad, ver arriba). */
  amplitudeMm: number
  /** Distancia entre crestas consecutivas (piso MIN_WAVELENGTH_MM). */
  wavelengthMm: number
  /** Segmentos de malla por longitud de onda. Bajo = facetas grandes (costillas). */
  facetsPerWave: number
  /** Techo de pendiente autosoportada (grados, <= SAFE_OVERHANG_DEG). */
  maxOverhangDeg: number
  combine: CombineMode
}

export const DEFAULT_WAVE_FIELD: WaveFieldParams = {
  planeSize: 24,
  thicknessBaseMm: 1.5,
  amplitudeMm: 22,
  wavelengthMm: 70,
  facetsPerWave: 3,
  maxOverhangDeg: 45,
  combine: 'max',
}

export const WAVE_UI_PARAMS: readonly NumberParam[] = [
  {
    key: 'planeSize',
    label: 'Lado del panel',
    min: 6,
    max: 80,
    step: 1,
    default: 24,
    unit: 'u3d',
  },
  {
    key: 'thicknessBaseMm',
    label: 'Espesor de la base',
    min: MIN_BASE_THICKNESS_MM,
    max: 5,
    step: 0.1,
    default: 1.5,
    unit: 'mm',
  },
  {
    key: 'wavelengthMm',
    label: 'Longitud de onda',
    min: MIN_WAVELENGTH_MM,
    max: 120,
    step: 0.5,
    default: 70,
    unit: 'mm',
  },
  {
    key: 'amplitudeMm',
    label: 'Amplitud (pedida)',
    min: 0,
    max: 40,
    step: 0.1,
    default: 22,
    unit: 'mm',
  },
  {
    key: 'facetsPerWave',
    label: 'Facetas por onda',
    min: 1,
    max: 16,
    step: 1,
    default: 3,
    unit: '-',
  },
  {
    key: 'maxOverhangDeg',
    label: 'Vuelo maximo (por capa)',
    min: 0,
    max: SAFE_OVERHANG_DEG,
    step: 1,
    default: 45,
    unit: 'grados',
  },
]

const MAX_SEGMENTS_PER_AXIS = 200

export interface WaveFieldResult {
  geometry: THREE.BufferGeometry
  bounds: THREE.Box3
  triangleCount: number
  segmentsU: number
  segmentsV: number
  /** Amplitud efectivamente usada (mm), tras el recorte de seguridad. */
  appliedAmplitudeMm: number
  /** true si la amplitud pedida se recorto por vuelo autosoportado. */
  amplitudeLimited: boolean
}

export function buildWaveField(
  attractors: readonly Attractor[],
  params: WaveFieldParams,
  boundary?: Boundary | null,
): WaveFieldResult {
  const thickness = mmToThree(Math.max(MIN_BASE_THICKNESS_MM, params.thicknessBaseMm))
  const wavelength = mmToThree(Math.max(MIN_WAVELENGTH_MM, params.wavelengthMm))
  const maxOverhang = clamp(params.maxOverhangDeg, 0, SAFE_OVERHANG_DEG)

  // pendiente maxima de A*sin(2*pi*d/L) es A*(2*pi/L); se recorta A para que
  // esa pendiente no supere tan(maxOverhangDeg).
  const maxSafeAmplitude = (Math.tan(maxOverhang * DEG2RAD) * wavelength) / (2 * Math.PI)
  const requestedAmplitude = mmToThree(Math.max(0, params.amplitudeMm))
  const amplitude = Math.min(requestedAmplitude, maxSafeAmplitude)

  const domain = resolveDomain(params.planeSize, boundary)
  const width = domain.maxX - domain.minX
  const height = domain.maxZ - domain.minZ

  const facetsPerWave = Math.max(1, Math.round(params.facetsPerWave))
  const segmentLength = wavelength / facetsPerWave
  const nu = clamp(Math.round(width / segmentLength), 4, MAX_SEGMENTS_PER_AXIS)
  const nv = clamp(Math.round(height / segmentLength), 4, MAX_SEGMENTS_PER_AXIS)

  const heightAt = (x: number, z: number): number =>
    rippleHeight(x, z, attractors, params.combine, wavelength) * amplitude

  const { positions, indices } = buildSolidHeightfield(
    domain,
    nu,
    nv,
    thickness,
    heightAt,
  )

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  // Ojo: geometry.computeBoundingBox() recorre TODO el atributo position, sin
  // filtrar por el indice — con una base recortada (boundary) quedan vertices
  // "huerfanos" (celdas fuera del dominio, no referenciadas por ningun
  // triangulo) que igual tienen una altura calculada e inflarian el
  // "Dimensiones" que ve el usuario. Las dimensiones reportadas se calculan
  // SOLO sobre los vertices realmente indexados (los que forman parte del solido).
  const bounds = computeIndexedBounds(positions, indices)

  return {
    geometry,
    bounds,
    triangleCount: indices.length / 3,
    segmentsU: nu,
    segmentsV: nv,
    appliedAmplitudeMm: threeToMm(amplitude),
    amplitudeLimited: amplitude < requestedAmplitude - 1e-9,
  }
}

interface Domain {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** true si (x,z) cae dentro del area a llenar. */
  test: (x: number, z: number) => boolean
}

/**
 * Sin `boundary`: el cuadrado `planeSize` de siempre (test siempre true).
 * Con `boundary` (p. ej. una pieza de patron importada, en mm): su caja
 * envolvente en unidades Three, y el test es "dentro del contorno externo y
 * fuera de los agujeros".
 */
function resolveDomain(planeSize: number, boundary?: Boundary | null): Domain {
  if (!boundary) {
    const half = planeSize / 2
    return { minX: -half, maxX: half, minZ: -half, maxZ: half, test: () => true }
  }
  const toThree = (pts: readonly Vec2[]): Vec2[] =>
    pts.map(([x, z]) => [mmToThree(x), mmToThree(z)])
  const outer = toThree(boundary.outer)
  const holes = boundary.holes.map(toThree)
  const b = polygonBounds(outer)
  return {
    minX: b.minX,
    maxX: b.maxX,
    minZ: b.minZ,
    maxZ: b.maxZ,
    test: (x, z) => pointInBoundary(x, z, { outer, holes }),
  }
}

/**
 * Ondulacion radial combinada de todos los atractores en (x, z), normalizada
 * a [0, 1]. 0 = panel liso en ese punto, 1 = cresta maxima.
 */
function rippleHeight(
  x: number,
  z: number,
  attractors: readonly Attractor[],
  combine: CombineMode,
  wavelength: number,
): number {
  let acc = 0
  for (const a of attractors) {
    const strength = Math.max(0, a.strength) // solo relieve hacia arriba
    if (strength <= 0) continue
    const dx = x - a.position.x
    const dz = z - a.position.z
    const d = Math.hypot(dx, dz)
    const envelope = falloff(a.falloff, d, a.radius) * strength
    if (envelope <= 0) continue
    const wave = 0.5 + 0.5 * Math.sin((2 * Math.PI * d) / wavelength)
    const contribution = envelope * wave
    acc = combine === 'sum' ? acc + contribution : Math.max(acc, contribution)
  }
  return clamp(acc, 0, 1)
}

/**
 * Extruye un campo de alturas `heightAt(x,z)` (por encima de `thickness`) en
 * un solido cerrado sobre el area que pasa `domain.test`: base plana en y=0,
 * superficie superior ondulada, y paredes laterales que unen ambas siguiendo
 * el CONTORNO real del area rellena (no necesariamente un rectangulo).
 *
 * Enfoque: se generan los vertices de TODA la grilla (rectangulo envolvente),
 * pero solo se emiten triangulos de tapa para las celdas cuyo CENTRO cae
 * dentro del dominio (mascara); las paredes se agregan en cada arista de una
 * celda rellena cuyo vecino en esa direccion NO esta rellena (fuera de la
 * grilla o fuera del dominio) — asi el contorno sale "a escalones" del tamaño
 * de la grilla, valido para cualquier forma sin necesitar triangular el
 * poligono exacto. La orientacion de cada triangulo se decide comparando su
 * normal con una direccion de referencia "mas o menos hacia afuera" (para las
 * paredes, del centro de la celda hacia la arista), asi que no depende de
 * acertar un convenio de indices a mano.
 */
function buildSolidHeightfield(
  domain: Domain,
  nu: number,
  nv: number,
  thickness: number,
  heightAt: (x: number, z: number) => number,
): { positions: number[]; indices: number[] } {
  const width = domain.maxX - domain.minX
  const height = domain.maxZ - domain.minZ
  const rowU = nu + 1
  const idx = (iv: number, iu: number): number => iv * rowU + iu
  const gridX = (iu: number): number => domain.minX + (iu / nu) * width
  const gridZ = (iv: number): number => domain.minZ + (iv / nv) * height

  const positions: number[] = []
  const topStart = 0
  for (let iv = 0; iv <= nv; iv++) {
    for (let iu = 0; iu <= nu; iu++) {
      const x = gridX(iu)
      const z = gridZ(iv)
      positions.push(x, thickness + heightAt(x, z), z)
    }
  }
  const botStart = positions.length / 3
  for (let iv = 0; iv <= nv; iv++) {
    for (let iu = 0; iu <= nu; iu++) {
      positions.push(gridX(iu), 0, gridZ(iv))
    }
  }

  // mascara por celda (centro de la celda dentro del dominio)
  const filled = new Uint8Array(nu * nv)
  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      const cx = domain.minX + ((iu + 0.5) / nu) * width
      const cz = domain.minZ + ((iv + 0.5) / nv) * height
      filled[iv * nu + iu] = domain.test(cx, cz) ? 1 : 0
    }
  }
  const isFilled = (iv: number, iu: number): boolean =>
    iv >= 0 && iv < nv && iu >= 0 && iu < nu && filled[iv * nu + iu] === 1

  const indices: number[] = []
  const pushTri = (i0: number, i1: number, i2: number, ref: [number, number, number]) => {
    pushOutwardTri(positions, indices, i0, i1, i2, ref)
  }
  const vx = (i: number): number => positions[i * 3]
  const vz = (i: number): number => positions[i * 3 + 2]

  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      if (!isFilled(iv, iu)) continue
      const a = idx(iv, iu)
      const b = idx(iv, iu + 1)
      const c = idx(iv + 1, iu)
      const d = idx(iv + 1, iu + 1)

      // tapas (superior e inferior) de esta celda
      pushTri(topStart + a, topStart + b, topStart + c, [0, 1, 0])
      pushTri(topStart + b, topStart + d, topStart + c, [0, 1, 0])
      pushTri(botStart + a, botStart + b, botStart + c, [0, -1, 0])
      pushTri(botStart + b, botStart + d, botStart + c, [0, -1, 0])

      // pared en cada arista cuyo vecino no esta relleno
      const cx = domain.minX + ((iu + 0.5) / nu) * width
      const cz = domain.minZ + ((iv + 0.5) / nv) * height
      const edges: [neighborIv: number, neighborIu: number, v0: number, v1: number][] = [
        [iv - 1, iu, a, b], // arista "v-": comparte fila iv (a,b)
        [iv + 1, iu, c, d], // arista "v+": comparte fila iv+1 (c,d)
        [iv, iu - 1, a, c], // arista "u-": comparte columna iu (a,c)
        [iv, iu + 1, b, d], // arista "u+": comparte columna iu+1 (b,d)
      ]
      for (const [nIv, nIu, v0, v1] of edges) {
        if (isFilled(nIv, nIu)) continue
        const t0 = topStart + v0
        const t1 = topStart + v1
        const b0 = botStart + v0
        const b1 = botStart + v1
        const midx = (vx(t0) + vx(t1)) / 2
        const midz = (vz(t0) + vz(t1)) / 2
        let refx = midx - cx
        let refz = midz - cz
        const len = Math.hypot(refx, refz) || 1
        refx /= len
        refz /= len
        const ref: [number, number, number] = [refx, 0, refz]
        pushTri(t0, t1, b0, ref)
        pushTri(t1, b1, b0, ref)
      }
    }
  }

  return { positions, indices }
}

/** Caja envolvente SOLO de los vertices efectivamente indexados (usados). */
function computeIndexedBounds(positions: number[], indices: number[]): THREE.Box3 {
  const box = new THREE.Box3()
  for (let i = 0; i < indices.length; i++) {
    const o = indices[i] * 3
    box.min.x = Math.min(box.min.x, positions[o])
    box.min.y = Math.min(box.min.y, positions[o + 1])
    box.min.z = Math.min(box.min.z, positions[o + 2])
    box.max.x = Math.max(box.max.x, positions[o])
    box.max.y = Math.max(box.max.y, positions[o + 1])
    box.max.z = Math.max(box.max.z, positions[o + 2])
  }
  return box
}

const _p0 = new THREE.Vector3()
const _p1 = new THREE.Vector3()
const _p2 = new THREE.Vector3()
const _e1 = new THREE.Vector3()
const _e2 = new THREE.Vector3()
const _n = new THREE.Vector3()
const _ref = new THREE.Vector3()

/** Empuja el triangulo (i0,i1,i2) en el orden que hace que su normal apunte hacia `ref`. */
function pushOutwardTri(
  positions: number[],
  indices: number[],
  i0: number,
  i1: number,
  i2: number,
  ref: [number, number, number],
): void {
  _p0.fromArray(positions, i0 * 3)
  _p1.fromArray(positions, i1 * 3)
  _p2.fromArray(positions, i2 * 3)
  _e1.subVectors(_p1, _p0)
  _e2.subVectors(_p2, _p0)
  _n.crossVectors(_e1, _e2)
  _ref.set(ref[0], ref[1], ref[2])
  if (_n.dot(_ref) < 0) indices.push(i0, i2, i1)
  else indices.push(i0, i1, i2)
}

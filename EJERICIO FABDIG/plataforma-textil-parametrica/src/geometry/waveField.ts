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
  segmentsPerAxis: number
  /** Amplitud efectivamente usada (mm), tras el recorte de seguridad. */
  appliedAmplitudeMm: number
  /** true si la amplitud pedida se recorto por vuelo autosoportado. */
  amplitudeLimited: boolean
}

export function buildWaveField(
  attractors: readonly Attractor[],
  params: WaveFieldParams,
): WaveFieldResult {
  const thickness = mmToThree(Math.max(MIN_BASE_THICKNESS_MM, params.thicknessBaseMm))
  const wavelength = mmToThree(Math.max(MIN_WAVELENGTH_MM, params.wavelengthMm))
  const maxOverhang = clamp(params.maxOverhangDeg, 0, SAFE_OVERHANG_DEG)

  // pendiente maxima de A*sin(2*pi*d/L) es A*(2*pi/L); se recorta A para que
  // esa pendiente no supere tan(maxOverhangDeg).
  const maxSafeAmplitude = (Math.tan(maxOverhang * DEG2RAD) * wavelength) / (2 * Math.PI)
  const requestedAmplitude = mmToThree(Math.max(0, params.amplitudeMm))
  const amplitude = Math.min(requestedAmplitude, maxSafeAmplitude)

  const facetsPerWave = Math.max(1, Math.round(params.facetsPerWave))
  const segmentLength = wavelength / facetsPerWave
  const n = clamp(Math.round(params.planeSize / segmentLength), 4, MAX_SEGMENTS_PER_AXIS)

  const heightAt = (x: number, z: number): number =>
    rippleHeight(x, z, attractors, params.combine, wavelength) * amplitude

  const { positions, indices } = buildSolidHeightfield(
    params.planeSize,
    n,
    thickness,
    heightAt,
  )

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  const bounds = new THREE.Box3()
  if (geometry.boundingBox) bounds.copy(geometry.boundingBox)

  return {
    geometry,
    bounds,
    triangleCount: indices.length / 3,
    segmentsPerAxis: n,
    appliedAmplitudeMm: threeToMm(amplitude),
    amplitudeLimited: amplitude < requestedAmplitude - 1e-9,
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
 * un solido cerrado: base plana en y=0, superficie superior ondulada, y
 * paredes laterales que unen ambas. La orientacion de cada triangulo se
 * decide comparando su normal con una direccion de referencia "mas o menos
 * hacia afuera" para esa cara, asi que no depende de acertar un convenio de
 * indices a mano.
 */
function buildSolidHeightfield(
  planeSize: number,
  n: number,
  thickness: number,
  heightAt: (x: number, z: number) => number,
): { positions: number[]; indices: number[] } {
  const half = planeSize / 2
  const row = n + 1
  const idx = (iv: number, iu: number): number => iv * row + iu

  const positions: number[] = []
  const topStart = 0
  for (let iv = 0; iv < row; iv++) {
    for (let iu = 0; iu < row; iu++) {
      const x = (iu / n) * planeSize - half
      const z = (iv / n) * planeSize - half
      positions.push(x, thickness + heightAt(x, z), z)
    }
  }
  const botStart = positions.length / 3
  for (let iv = 0; iv < row; iv++) {
    for (let iu = 0; iu < row; iu++) {
      const x = (iu / n) * planeSize - half
      const z = (iv / n) * planeSize - half
      positions.push(x, 0, z)
    }
  }

  const indices: number[] = []
  const pushTri = (i0: number, i1: number, i2: number, ref: [number, number, number]) => {
    pushOutwardTri(positions, indices, i0, i1, i2, ref)
  }

  // superficie superior e inferior
  for (let iv = 0; iv < n; iv++) {
    for (let iu = 0; iu < n; iu++) {
      const a = idx(iv, iu)
      const b = idx(iv, iu + 1)
      const c = idx(iv + 1, iu)
      const d = idx(iv + 1, iu + 1)
      pushTri(topStart + a, topStart + b, topStart + c, [0, 1, 0])
      pushTri(topStart + b, topStart + d, topStart + c, [0, 1, 0])
      pushTri(botStart + a, botStart + b, botStart + c, [0, -1, 0])
      pushTri(botStart + b, botStart + d, botStart + c, [0, -1, 0])
    }
  }

  // paredes laterales: 4 bordes del grid, cada uno conecta arriba con abajo
  const addWall = (
    steps: number,
    at: (i: number) => { top: number; bot: number },
    ref: [number, number, number],
  ) => {
    for (let i = 0; i < steps; i++) {
      const p0 = at(i)
      const p1 = at(i + 1)
      pushTri(p0.top, p1.top, p0.bot, ref)
      pushTri(p1.top, p1.bot, p0.bot, ref)
    }
  }
  addWall(
    n,
    (i) => ({ top: topStart + idx(0, i), bot: botStart + idx(0, i) }),
    [0, 0, -1],
  )
  addWall(n, (i) => ({ top: topStart + idx(n, i), bot: botStart + idx(n, i) }), [0, 0, 1])
  addWall(
    n,
    (i) => ({ top: topStart + idx(i, 0), bot: botStart + idx(i, 0) }),
    [-1, 0, 0],
  )
  addWall(n, (i) => ({ top: topStart + idx(i, n), bot: botStart + idx(i, n) }), [1, 0, 0])

  return { positions, indices }
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

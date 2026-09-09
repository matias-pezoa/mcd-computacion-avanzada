/**
 * Campo de plumas que emergen de un plano, dirigido por el mapa de atractores.
 *
 * Sobre un panel plano (la base de tela) se siembran puntos con densidad
 * proporcional al campo; en cada punto crece una pluma (perfil 2D barrido por
 * una espina procedural, ver quill.ts) cuya altura, ancho, curvatura y
 * orientacion tambien salen del campo. Todas las plumas se fusionan en una
 * sola malla, lista para imprimir en 3D sobre la tela.
 *
 * Funcion pura y determinista (mismo seed -> mismo resultado).
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clamp, lerp } from '../utils/params'
import type { NumberParam } from '../utils/params'
import { mulberry32 } from '../utils/random'
import { buildProfile, type ProfileParams } from './profile'
import { buildQuillSpine } from './quill'
import { loftProfile } from './loft'
import { sampleField, type Attractor, type CombineMode } from './attractionField'

export interface FeatherFieldParams {
  /** Lado del panel cuadrado (u3d). Centrado en el origen, sobre y = 0. */
  planeSize: number

  // --- distribucion sobre el plano ---
  gridU: number
  gridV: number
  /** Probabilidad de sembrar una pluma cuando el campo vale 0 y cuando vale 1. */
  densityMin: number
  densityMax: number
  jitter: number
  maxCount: number
  seed: number
  combine: CombineMode

  // --- forma de la pluma (base + aporte del campo) ---
  heightBase: number
  heightField: number
  curvatureBase: number
  curvatureField: number
  leanDeg: number
  widthBase: number
  widthField: number
  /** Escala del perfil en la punta, relativa a la base (0 = termina en punta). */
  taper: number
  quillSegments: number
  /** La pluma se arquea siguiendo el gradiente del campo. */
  alignToField: boolean

  // --- nervadura opcional ---
  rib: boolean
  ribRadius: number

  profile: ProfileParams
}

export const DEFAULT_FEATHER_PROFILE: ProfileParams = {
  widthMm: 26,
  heightMm: 3,
  teeth: 0,
  toothDepth: 0.3,
  resolution: 20,
}

export const DEFAULT_FEATHER_FIELD: FeatherFieldParams = {
  planeSize: 36,
  gridU: 34,
  gridV: 34,
  densityMin: 0.03,
  densityMax: 0.62,
  jitter: 0.8,
  maxCount: 200,
  seed: 4242,
  combine: 'max',
  heightBase: 3.5,
  heightField: 9,
  curvatureBase: 0.12,
  curvatureField: 0.28,
  leanDeg: 10,
  widthBase: 0.5,
  widthField: 0.55,
  taper: 0.04,
  quillSegments: 24,
  alignToField: true,
  rib: true,
  ribRadius: 0.045,
  profile: DEFAULT_FEATHER_PROFILE,
}

export const FIELD_UI_PARAMS: readonly NumberParam[] = [
  { key: 'planeSize', label: 'Lado del panel', min: 6, max: 80, step: 1, default: 34, unit: 'u3d' },
  { key: 'gridU', label: 'Grilla U', min: 6, max: 160, step: 1, default: 46, unit: 'celdas' },
  { key: 'gridV', label: 'Grilla V', min: 6, max: 160, step: 1, default: 46, unit: 'celdas' },
  { key: 'densityMin', label: 'Densidad (campo=0)', min: 0, max: 1, step: 0.005, default: 0.015, unit: 'prob' },
  { key: 'densityMax', label: 'Densidad (campo=1)', min: 0, max: 1, step: 0.01, default: 0.9, unit: 'prob' },
  { key: 'jitter', label: 'Desorden posicional', min: 0, max: 1, step: 0.01, default: 0.75, unit: 'frac' },
  { key: 'maxCount', label: 'Maximo de plumas', min: 10, max: 1200, step: 10, default: 260, unit: '-' },
  { key: 'widthBase', label: 'Ancho base', min: 0.05, max: 3, step: 0.01, default: 0.5, unit: 'x' },
  { key: 'widthField', label: 'Ancho x campo', min: 0, max: 3, step: 0.01, default: 0.9, unit: 'x' },
  { key: 'taper', label: 'Punta (ancho relativo)', min: 0, max: 1, step: 0.01, default: 0.05, unit: 'frac' },
  { key: 'ribRadius', label: 'Grosor de nervadura', min: 0.01, max: 0.3, step: 0.005, default: 0.05, unit: 'u3d' },
]

export interface FeatherPlacement {
  x: number
  z: number
  height: number
  width: number
  curvature: number
  field: number
}

export interface FeatherFieldResult {
  /** Malla de todas las palas (translucida). Vacia si no hay plumas. */
  blades: THREE.BufferGeometry
  /** Malla de todas las nervaduras, o null si `rib` esta desactivado. */
  ribs: THREE.BufferGeometry | null
  /** Caja envolvente del conjunto (palas + nervaduras), en unidades de Three. */
  bounds: THREE.Box3
  count: number
  triangleCount: number
  placements: FeatherPlacement[]
}

/**
 * Fusiona palas + nervaduras en una unica malla para exportar un solo STL.
 * Se llama bajo demanda (al exportar), no en cada recalculo.
 */
export function mergeForExport(result: FeatherFieldResult): THREE.BufferGeometry {
  const parts = [result.blades, result.ribs].filter(
    (g): g is THREE.BufferGeometry => !!g && hasVerts(g),
  )
  return parts.length ? mergeNormalized(parts) : EMPTY()
}

const EMPTY = () => new THREE.BufferGeometry()

export function buildFeatherField(
  attractors: readonly Attractor[],
  params: FeatherFieldParams,
): FeatherFieldResult {
  const rng = mulberry32(params.seed)
  const profile2D = buildProfile(params.profile)
  const gu = Math.max(1, Math.round(params.gridU))
  const gv = Math.max(1, Math.round(params.gridV))

  const bladeGeoms: THREE.BufferGeometry[] = []
  const ribGeoms: THREE.BufferGeometry[] = []
  const placements: FeatherPlacement[] = []

  const p = new THREE.Vector3()
  const leanDir = new THREE.Vector2()

  outer: for (let iv = 0; iv < gv; iv++) {
    for (let iu = 0; iu < gu; iu++) {
      const u = clamp((iu + 0.5 + (rng() - 0.5) * params.jitter) / gu, 0, 1)
      const v = clamp((iv + 0.5 + (rng() - 0.5) * params.jitter) / gv, 0, 1)
      const x = (u - 0.5) * params.planeSize
      const z = (v - 0.5) * params.planeSize
      p.set(x, 0, z)

      const field = sampleField(p, attractors, params.combine)
      const accept = lerp(params.densityMin, params.densityMax, field.value)
      if (rng() >= accept) continue

      const height = Math.max(0.05, params.heightBase + field.value * params.heightField)
      const width = Math.max(0.01, params.widthBase + field.value * params.widthField)
      const curvature = clamp(
        params.curvatureBase + field.value * params.curvatureField,
        0,
        1,
      )

      if (params.alignToField && field.direction) {
        // se arquean ALEJANDOSE de los atractores (abren hacia afuera de la
        // zona densa, como el borde de las piezas de referencia).
        leanDir.set(-field.direction.x, -field.direction.z)
      } else if (x === 0 && z === 0) {
        const a = rng() * Math.PI * 2
        leanDir.set(Math.cos(a), Math.sin(a))
      } else {
        leanDir.set(x, z) // radial desde el centro del panel
      }

      const { curve, crossAxis } = buildQuillSpine(p, leanDir, {
        height,
        curvature,
        leanDeg: params.leanDeg,
        segments: params.quillSegments,
      })

      const taperFn = (t: number) => width * (1 - (1 - params.taper) * t)
      const loft = loftProfile(profile2D, curve, taperFn, {
        sections: params.quillSegments + 1,
        caps: true,
        frame: { type: 'reference', up: crossAxis },
      })
      bladeGeoms.push(loft.geometry)

      if (params.rib) {
        ribGeoms.push(
          new THREE.TubeGeometry(
            curve,
            params.quillSegments,
            Math.max(0.002, params.ribRadius),
            6,
            false,
          ),
        )
      }

      placements.push({ x, z, height, width, curvature, field: field.value })
      if (bladeGeoms.length >= params.maxCount) break outer
    }
  }

  const blades = bladeGeoms.length ? mergeNormalized(bladeGeoms) : EMPTY()
  const ribs = ribGeoms.length ? mergeNormalized(ribGeoms) : null
  bladeGeoms.forEach((g) => g.dispose())
  ribGeoms.forEach((g) => g.dispose())

  const bounds = new THREE.Box3()
  if (hasVerts(blades)) {
    blades.computeBoundingBox()
    if (blades.boundingBox) bounds.union(blades.boundingBox)
  }
  if (ribs && hasVerts(ribs)) {
    ribs.computeBoundingBox()
    if (ribs.boundingBox) bounds.union(ribs.boundingBox)
  }

  const triangleCount = indexCount(blades) / 3 + (ribs ? indexCount(ribs) / 3 : 0)

  return { blades, ribs, bounds, count: placements.length, triangleCount, placements }
}

/**
 * Fusiona dejando solo `position` + `index` (clona los inputs, no los altera),
 * recalculando normales.
 */
function mergeNormalized(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = geoms.map((g) => {
    const c = new THREE.BufferGeometry()
    c.setAttribute('position', g.getAttribute('position').clone())
    const idx = g.getIndex()
    if (idx) c.setIndex(idx.clone())
    return c
  })
  const merged = mergeGeometries(clean, false) ?? new THREE.BufferGeometry()
  clean.forEach((c) => c.dispose())
  merged.computeVertexNormals()
  merged.computeBoundingBox()
  merged.computeBoundingSphere()
  return merged
}

function hasVerts(g: THREE.BufferGeometry): boolean {
  const pos = g.getAttribute('position')
  return !!pos && pos.count > 0
}

function indexCount(g: THREE.BufferGeometry): number {
  const idx = g.getIndex()
  if (idx) return idx.count
  const pos = g.getAttribute('position')
  return pos ? pos.count : 0
}

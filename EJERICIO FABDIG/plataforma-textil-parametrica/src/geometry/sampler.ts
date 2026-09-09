/**
 * Sampler de instancias sobre una superficie, dirigido por un campo.
 *
 * Estrategia (la mas simple del roadmap): grilla regular en UV filtrada
 * probabilisticamente por el valor del campo. Densidad alta del campo => mas
 * probabilidad de colocar una instancia y mayor escala. La rotacion alinea la
 * instancia a la normal de la superficie y, si el campo tiene direccion, su
 * eje frontal al gradiente proyectado en el plano tangente.
 *
 * Funcion pura y determinista (mismo seed => mismo resultado).
 */
import * as THREE from 'three'
import { clamp, lerp } from '../utils/params'
import type { NumberParam } from '../utils/params'
import { mulberry32 } from '../utils/random'
import type { ParametricSurface } from './surfaces'
import { sampleField } from './attractionField'
import type { Attractor, CombineMode } from './attractionField'

export interface SamplerParams {
  /** Resolucion de la grilla base en U y V. */
  gridU: number
  gridV: number
  /** Probabilidad de colocado cuando el campo vale 0 y cuando vale 1. */
  densityMin: number
  densityMax: number
  /** Escala de la instancia cuando el campo vale 0 y cuando vale 1. */
  scaleMin: number
  scaleMax: number
  /** Desorden posicional dentro de la celda (0..1). */
  jitter: number
  /** Alinear el eje frontal al gradiente del campo. */
  alignToField: boolean
  /** Tope duro de instancias (protege performance). */
  maxCount: number
  seed: number
  /** Modo de combinacion del campo. Por defecto 'max'. */
  combine?: CombineMode
}

export const DEFAULT_SAMPLER_PARAMS: SamplerParams = {
  gridU: 90,
  gridV: 60,
  densityMin: 0.02,
  densityMax: 1,
  scaleMin: 0.25,
  scaleMax: 1.4,
  jitter: 0.7,
  alignToField: true,
  maxCount: 4000,
  seed: 12345,
}

export const SAMPLER_UI_PARAMS: readonly NumberParam[] = [
  {
    key: 'gridU',
    label: 'Grilla U',
    min: 8,
    max: 240,
    step: 1,
    default: 90,
    unit: 'celdas',
  },
  {
    key: 'gridV',
    label: 'Grilla V',
    min: 8,
    max: 240,
    step: 1,
    default: 60,
    unit: 'celdas',
  },
  {
    key: 'densityMin',
    label: 'Densidad (campo=0)',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.02,
    unit: 'prob',
  },
  {
    key: 'densityMax',
    label: 'Densidad (campo=1)',
    min: 0,
    max: 1,
    step: 0.01,
    default: 1,
    unit: 'prob',
  },
  {
    key: 'scaleMin',
    label: 'Escala (campo=0)',
    min: 0.01,
    max: 3,
    step: 0.01,
    default: 0.25,
    unit: 'x',
  },
  {
    key: 'scaleMax',
    label: 'Escala (campo=1)',
    min: 0.01,
    max: 4,
    step: 0.01,
    default: 1.4,
    unit: 'x',
  },
  {
    key: 'jitter',
    label: 'Desorden posicional',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.7,
    unit: 'frac',
  },
  {
    key: 'maxCount',
    label: 'Maximo de instancias',
    min: 50,
    max: 20000,
    step: 50,
    default: 4000,
    unit: '-',
  },
]

export interface SurfaceInstance {
  position: THREE.Vector3
  normal: THREE.Vector3
  /** Eje frontal (tangente a la superficie). */
  tangent: THREE.Vector3
  scale: number
  fieldValue: number
}

const _p = new THREE.Vector3()
const _n = new THREE.Vector3()
const _fieldDir = new THREE.Vector3()
const _t = new THREE.Vector3()

export function sampleSurface(
  surface: ParametricSurface,
  attractors: readonly Attractor[],
  params: SamplerParams = DEFAULT_SAMPLER_PARAMS,
): SurfaceInstance[] {
  const rng = mulberry32(params.seed)
  const out: SurfaceInstance[] = []
  const gu = Math.max(1, Math.round(params.gridU))
  const gv = Math.max(1, Math.round(params.gridV))
  const combine = params.combine ?? 'max'

  for (let iv = 0; iv < gv; iv++) {
    for (let iu = 0; iu < gu; iu++) {
      const ju = (iu + 0.5 + (rng() - 0.5) * params.jitter) / gu
      const jv = (iv + 0.5 + (rng() - 0.5) * params.jitter) / gv
      const u = clamp(ju, 0, 1)
      const v = clamp(jv, 0, 1)

      surface.point(u, v, _p)
      const field = sampleField(_p, attractors, combine)
      const accept = lerp(params.densityMin, params.densityMax, field.value)
      if (rng() >= accept) continue

      surface.normal(u, v, _n)

      // tangente: gradiente del campo proyectado al plano tangente, o
      // una tangente arbitraria estable si el campo es plano aca.
      if (params.alignToField && field.direction) {
        _fieldDir.copy(field.direction)
        _t.copy(_fieldDir).addScaledVector(_n, -_fieldDir.dot(_n))
        if (_t.lengthSq() < 1e-8) arbitraryTangent(_n, _t)
        else _t.normalize()
      } else {
        arbitraryTangent(_n, _t)
      }

      out.push({
        position: _p.clone(),
        normal: _n.clone(),
        tangent: _t.clone(),
        scale: lerp(params.scaleMin, params.scaleMax, field.value),
        fieldValue: field.value,
      })

      if (out.length >= params.maxCount) return out
    }
  }
  return out
}

function arbitraryTangent(normal: THREE.Vector3, target: THREE.Vector3): void {
  const ref = Math.abs(normal.y) < 0.99 ? UP : FORWARD
  target.crossVectors(ref, normal)
  if (target.lengthSq() < 1e-8) target.set(1, 0, 0)
  else target.normalize()
}
const UP = new THREE.Vector3(0, 1, 0)
const FORWARD = new THREE.Vector3(0, 0, 1)

/**
 * Matriz de transformacion de una instancia.
 * Convencion del modelo base: eje +Y = "hacia afuera" (normal), eje +Z = frente.
 */
export function instanceMatrix(
  inst: SurfaceInstance,
  target = new THREE.Matrix4(),
): THREE.Matrix4 {
  const y = inst.normal
  const z = new THREE.Vector3()
    .copy(inst.tangent)
    .addScaledVector(y, -inst.tangent.dot(y))
    .normalize()
  const x = new THREE.Vector3().crossVectors(y, z).normalize()
  const zz = new THREE.Vector3().crossVectors(x, y).normalize()
  target.makeBasis(x, y, zz)
  target.setPosition(inst.position)
  const s = inst.scale
  target.scale(new THREE.Vector3(s, s, s))
  return target
}

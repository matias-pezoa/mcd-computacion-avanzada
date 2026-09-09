/**
 * Mapas de atraccion.
 *
 * Un atractor es un punto 3D con un radio de influencia y una funcion de
 * caida. Dado un punto en el espacio y una lista de atractores, `sampleField`
 * devuelve un valor de campo combinado en [0,1] y una direccion (gradiente
 * aproximado) para orientar instancias siguiendo el campo.
 *
 * Funciones puras. Unidades: las del viewport (Three.js).
 */
import * as THREE from 'three'
import { clamp } from '../utils/params'
import type { NumberParam } from '../utils/params'

export type FalloffType = 'linear' | 'inverseSquare' | 'gaussian'

export const FALLOFF_LABELS: Record<FalloffType, string> = {
  linear: 'Lineal',
  inverseSquare: 'Cuadratica inversa',
  gaussian: 'Gaussiana',
}

export interface Attractor {
  id: string
  /** Posicion en unidades de Three.js. */
  position: THREE.Vector3
  /** Radio de influencia. Fuera de ~este radio la contribucion es ~0. */
  radius: number
  /** Peso del atractor (puede ser negativo para "repeler" densidad). */
  strength: number
  falloff: FalloffType
}

export type CombineMode = 'max' | 'sum'

export const ATTRACTOR_UI_PARAMS: readonly NumberParam[] = [
  {
    key: 'radius',
    label: 'Radio de influencia',
    min: 0.2,
    max: 40,
    step: 0.1,
    default: 6,
    unit: 'u3d',
  },
  {
    key: 'strength',
    label: 'Intensidad',
    min: -2,
    max: 2,
    step: 0.05,
    default: 1,
    unit: 'x',
  },
]

/** Contribucion normalizada [0,1] de un atractor a distancia `d`. */
export function falloff(type: FalloffType, d: number, radius: number): number {
  const r = Math.max(radius, 1e-6)
  const t = d / r
  switch (type) {
    case 'linear':
      return clamp(1 - t, 0, 1)
    case 'inverseSquare': {
      // cae rapido como 1/(1+(3t)^2) y se fuerza a 0 en t>=1 con una ventana lineal.
      const base = 1 / (1 + 9 * t * t)
      return clamp(base * clamp(1 - t, 0, 1), 0, 1)
    }
    case 'gaussian': {
      const sigma = 0.5
      return clamp(Math.exp(-(t * t) / (2 * sigma * sigma)), 0, 1)
    }
  }
}

export interface FieldSample {
  /** Valor de campo combinado, recortado a [0,1]. */
  value: number
  /**
   * Direccion unitaria hacia donde CRECE el campo (hacia los atractores
   * dominantes), o null si el campo es plano en ese punto.
   */
  direction: THREE.Vector3 | null
}

const _tmp = new THREE.Vector3()

/**
 * Evalua el campo en `point`.
 * @param combine 'max' = domina el atractor mas fuerte (transiciones nitidas
 *                entre zonas); 'sum' = se acumulan (zonas de solape mas densas).
 */
export function sampleField(
  point: THREE.Vector3,
  attractors: readonly Attractor[],
  combine: CombineMode = 'max',
): FieldSample {
  let value = 0
  const dir = new THREE.Vector3()
  let any = false

  for (const a of attractors) {
    const d = _tmp.subVectors(a.position, point).length()
    const contribRaw = falloff(a.falloff, d, a.radius) * a.strength
    if (contribRaw === 0) continue
    any = true

    if (combine === 'max') {
      if (Math.abs(contribRaw) > Math.abs(value)) value = contribRaw
    } else {
      value += contribRaw
    }

    // el gradiente apunta desde el punto hacia el atractor, pesado por |contrib|.
    if (d > 1e-6) {
      dir.addScaledVector(_tmp.subVectors(a.position, point).normalize(), contribRaw)
    }
  }

  return {
    value: clamp(value, 0, 1),
    direction: any && dir.lengthSq() > 1e-10 ? dir.normalize() : null,
  }
}

let _autoId = 0
export function createAttractor(
  position: THREE.Vector3,
  overrides: Partial<Omit<Attractor, 'id' | 'position'>> = {},
): Attractor {
  return {
    id: `attr-${Date.now().toString(36)}-${(_autoId++).toString(36)}`,
    position: position.clone(),
    radius: overrides.radius ?? 6,
    strength: overrides.strength ?? 1,
    falloff: overrides.falloff ?? 'gaussian',
  }
}

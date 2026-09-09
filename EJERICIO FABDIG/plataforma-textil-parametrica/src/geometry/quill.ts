/**
 * Espina procedural de una "pluma" que emerge de un plano.
 *
 * En vez de una curva 3D editada a mano, la espina se genera desde:
 *   - un punto base sobre el plano (y = 0),
 *   - una direccion de inclinacion en el plano (hacia donde se arquea),
 *   - altura, curvatura e inclinacion inicial.
 *
 * La curva sale casi vertical y se va arqueando hacia `leanDir` a medida que
 * sube, como las piezas rigidas que se despliegan sobre una base de tela.
 *
 * Funcion pura.
 */
import * as THREE from 'three'
import { clamp, DEG2RAD } from '../utils/params'
import type { NumberParam } from '../utils/params'

/** Angulo maximo (desde la vertical) que alcanza la punta con curvatura = 1. */
const MAX_BEND = 2.6 // rad (~149 grados)

export interface QuillParams {
  /** Alcance vertical aproximado de la pluma (u3d). */
  height: number
  /** Cuanto se arquea, 0 (recta vertical) .. 1 (se dobla ~150 grados). */
  curvature: number
  /** Inclinacion de la base respecto de la vertical (grados). */
  leanDeg: number
  /** Secciones a lo largo de la espina. */
  segments: number
}

export const QUILL_UI_PARAMS: readonly NumberParam[] = [
  { key: 'heightBase', label: 'Altura base', min: 0.2, max: 20, step: 0.1, default: 3, unit: 'u3d' },
  { key: 'heightField', label: 'Altura x campo', min: 0, max: 20, step: 0.1, default: 6, unit: 'u3d' },
  { key: 'curvatureBase', label: 'Curvatura base', min: 0, max: 1, step: 0.01, default: 0.15, unit: 'frac' },
  { key: 'curvatureField', label: 'Curvatura x campo', min: -1, max: 1, step: 0.01, default: 0.35, unit: 'frac' },
  { key: 'leanDeg', label: 'Inclinacion de la base', min: 0, max: 60, step: 1, default: 8, unit: 'grados' },
  { key: 'quillSegments', label: 'Secciones por pluma', min: 4, max: 60, step: 1, default: 22, unit: '-' },
]

export interface QuillSpine {
  curve: THREE.CatmullRomCurve3
  /** Eje horizontal perpendicular a la inclinacion: el "ancho" de la pluma. */
  crossAxis: THREE.Vector3
}

/**
 * @param base      punto sobre el plano (se respeta su `y`, normalmente 0).
 * @param leanDir   direccion en el plano XZ hacia la que se arquea la pluma.
 *                  Si es ~0 se usa +X.
 */
export function buildQuillSpine(
  base: THREE.Vector3,
  leanDir: THREE.Vector2,
  params: QuillParams,
): QuillSpine {
  const dir =
    leanDir.lengthSq() > 1e-8 ? leanDir.clone().normalize() : new THREE.Vector2(1, 0)
  const horiz = new THREE.Vector3(dir.x, 0, dir.y)
  const up = new THREE.Vector3(0, 1, 0)
  const crossAxis = new THREE.Vector3(dir.y, 0, -dir.x) // horizontal, perpendicular a dir

  const lean = params.leanDeg * DEG2RAD
  const bend = clamp(params.curvature, 0, 1) * MAX_BEND
  const avgCos = Math.max(0.3, Math.cos(lean + bend / 2))
  const arcLength = Math.max(1e-3, params.height) / avgCos
  const n = Math.max(2, Math.round(params.segments))
  const step = arcLength / n

  const pts: THREE.Vector3[] = [base.clone()]
  const pos = base.clone()
  const tdir = new THREE.Vector3()
  for (let i = 1; i <= n; i++) {
    const theta = lean + ((i - 0.5) / n) * bend
    tdir.set(0, 0, 0).addScaledVector(up, Math.cos(theta)).addScaledVector(horiz, Math.sin(theta))
    pos.addScaledVector(tdir, step)
    pts.push(pos.clone())
  }

  return { curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), crossAxis }
}

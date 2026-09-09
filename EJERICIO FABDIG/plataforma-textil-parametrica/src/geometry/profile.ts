/**
 * Generador de perfiles 2D (seccion transversal) parametrico.
 *
 * El perfil representa la seccion de una "pluma" / nervadura que luego se
 * barre a lo largo de la curva guia (ver loft.ts). Es una funcion pura.
 *
 * Convencion de unidades: los parametros `widthMm` y `heightMm` estan en
 * milimetros (es geometria fabricable); la salida esta en UNIDADES DE
 * THREE.JS, ya convertida con utils/units, para que el loft y el viewport
 * trabajen en el mismo espacio.
 */
import { mmToThree } from '../utils/units'
import { clamp } from '../utils/params'
import type { NumberParam } from '../utils/params'
import type { Vec2 } from './types'

export interface ProfileParams {
  /** Ancho total del perfil (eje x), en mm. */
  widthMm: number
  /** Alto total del perfil (eje y, espesor), en mm. */
  heightMm: number
  /** Numero de dientes en el borde. 0 = borde liso (elipse). */
  teeth: number
  /** Profundidad de cada diente como fraccion del alto (0..1). */
  toothDepth: number
  /** Puntos por lado (mitad superior). Mas = perfil mas suave, malla mas pesada. */
  resolution: number
}

export const DEFAULT_PROFILE_PARAMS: ProfileParams = {
  widthMm: 60,
  heightMm: 14,
  teeth: 0,
  toothDepth: 0.35,
  resolution: 48,
}

/** Descriptores para la UI (rango, default, unidad). */
export const PROFILE_UI_PARAMS: readonly NumberParam[] = [
  {
    key: 'widthMm',
    label: 'Ancho del perfil',
    min: 5,
    max: 300,
    step: 1,
    default: 60,
    unit: 'mm',
  },
  {
    key: 'heightMm',
    label: 'Alto del perfil',
    min: 1,
    max: 120,
    step: 0.5,
    default: 14,
    unit: 'mm',
  },
  {
    key: 'teeth',
    label: 'Dientes en el borde',
    min: 0,
    max: 40,
    step: 1,
    default: 0,
    unit: '-',
  },
  {
    key: 'toothDepth',
    label: 'Profundidad del diente',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.35,
    unit: 'frac',
  },
  {
    key: 'resolution',
    label: 'Resolucion del perfil',
    min: 6,
    max: 160,
    step: 1,
    default: 48,
    unit: 'pts',
  },
]

/**
 * Devuelve el perfil como polilinea CERRADA en sentido antihorario (CCW),
 * centrada en el origen. Unidades: Three.js.
 *
 * Forma base: elipse (lente) de ancho `widthMm` y alto `heightMm`. Con
 * `teeth > 0` se modula el borde con un patron sinusoidal rectificado que
 * genera un contorno dentado simetrico arriba/abajo.
 */
export function buildProfile(params: ProfileParams): Vec2[] {
  const width = mmToThree(Math.max(params.widthMm, 1e-4))
  const height = mmToThree(Math.max(params.heightMm, 1e-4))
  const a = width / 2
  const b = height / 2
  const res = Math.max(3, Math.round(params.resolution))
  const teeth = Math.max(0, Math.round(params.teeth))
  const toothDepth = clamp(params.toothDepth, 0, 1)

  // Muestreo por angulo para que las puntas (x = +-a) queden bien definidas.
  const upper: Vec2[] = []
  const lower: Vec2[] = []
  for (let i = 0; i <= res; i++) {
    const phi = (i / res) * Math.PI // 0 -> PI recorre x de +a a -a
    const x = a * Math.cos(phi)
    let yMag = b * Math.sin(phi)
    if (teeth > 0) {
      // diente: onda rectificada; se anula en las puntas (sin(phi) -> 0).
      const ripple = Math.abs(Math.sin(phi * teeth))
      yMag *= 1 - toothDepth + toothDepth * ripple
    }
    upper.push([x, yMag])
    lower.push([x, -yMag])
  }

  // Contorno CCW: borde superior de +a a -a, luego borde inferior de -a a +a.
  // Se evita duplicar las puntas exactas.
  const pts: Vec2[] = []
  for (let i = 0; i < upper.length; i++) pts.push(upper[i])
  for (let i = lower.length - 2; i >= 1; i--) pts.push(lower[i])
  return pts
}

/** Area con signo del poligono (formula del cordon). Positiva si es CCW. */
export function signedArea(points: readonly Vec2[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

/** Caja envolvente del perfil: { minX, minY, maxX, maxY } en unidades de Three. */
export function profileBounds(points: readonly Vec2[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

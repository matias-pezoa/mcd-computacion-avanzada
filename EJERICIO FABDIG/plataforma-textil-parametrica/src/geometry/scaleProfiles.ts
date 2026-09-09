/**
 * Presets de perfil de escalado a lo largo de la curva guia.
 *
 * Cada preset construye una `ScaleFn` (t en [0,1] -> factor >= 0) a partir de
 * unos pocos parametros. Funciones puras.
 */
import { clamp, lerp } from '../utils/params'
import type { NumberParam } from '../utils/params'
import type { ScaleFn } from './types'

export type ScalePresetId = 'constant' | 'linear' | 'bell'

export interface ScaleParams {
  /** Escala en t=0 (usada por linear; y como piso por bell). */
  start: number
  /** Escala en t=1 (usada por linear). */
  end: number
  /** Escala del pico (usada por bell) / valor unico (constant). */
  peak: number
  /** Posicion del pico en [0,1] (bell). */
  peakPos: number
  /** Ancho de la campana (bell), 0..1. Mas chico = pico mas angosto. */
  bellWidth: number
}

export const DEFAULT_SCALE_PARAMS: ScaleParams = {
  start: 0.15,
  end: 0.15,
  peak: 1,
  peakPos: 0.5,
  bellWidth: 0.32,
}

export const SCALE_UI_PARAMS: readonly NumberParam[] = [
  {
    key: 'start',
    label: 'Escala inicial (t=0)',
    min: 0,
    max: 3,
    step: 0.01,
    default: 0.15,
    unit: 'x',
  },
  {
    key: 'end',
    label: 'Escala final (t=1)',
    min: 0,
    max: 3,
    step: 0.01,
    default: 0.15,
    unit: 'x',
  },
  {
    key: 'peak',
    label: 'Escala del pico',
    min: 0,
    max: 3,
    step: 0.01,
    default: 1,
    unit: 'x',
  },
  {
    key: 'peakPos',
    label: 'Posicion del pico',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
    unit: 'frac',
  },
  {
    key: 'bellWidth',
    label: 'Ancho de la campana',
    min: 0.02,
    max: 1,
    step: 0.01,
    default: 0.32,
    unit: 'frac',
  },
]

export interface ScalePreset {
  id: ScalePresetId
  label: string
  make: (p: ScaleParams) => ScaleFn
}

export const SCALE_PRESETS: readonly ScalePreset[] = [
  {
    id: 'constant',
    label: 'Constante',
    make: (p) => () => Math.max(0, p.peak),
  },
  {
    id: 'linear',
    label: 'Lineal',
    make: (p) => (t) => Math.max(0, lerp(p.start, p.end, clamp(t, 0, 1))),
  },
  {
    id: 'bell',
    label: 'Curva de campana',
    make: (p) => {
      const sigma = Math.max(1e-3, p.bellWidth) / 2.355 // FWHM -> sigma
      return (t) => {
        const d = clamp(t, 0, 1) - p.peakPos
        const g = Math.exp(-(d * d) / (2 * sigma * sigma))
        return Math.max(0, lerp(p.start, p.peak, g))
      }
    },
  },
]

export function getScalePreset(id: ScalePresetId): ScalePreset {
  const found = SCALE_PRESETS.find((s) => s.id === id)
  if (!found) throw new Error(`Preset de escalado desconocido: ${id}`)
  return found
}

/** Atajo: construye la ScaleFn directamente desde id + params. */
export function makeScaleFn(id: ScalePresetId, params: ScaleParams): ScaleFn {
  return getScalePreset(id).make(params)
}

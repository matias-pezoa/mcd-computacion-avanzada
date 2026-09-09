/**
 * Estado global de la app (Zustand).
 *
 * Guarda SOLO parametros que generan geometria, nunca las mallas resultantes.
 * Cada modulo de geometria las deriva de aca con funciones puras.
 */
import { create } from 'zustand'
import * as THREE from 'three'
import type { Vec3 } from '../geometry/types'
import { DEFAULT_PROFILE_PARAMS } from '../geometry/profile'
import type { ProfileParams } from '../geometry/profile'
import {
  DEFAULT_SCALE_PARAMS,
  type ScaleParams,
  type ScalePresetId,
} from '../geometry/scaleProfiles'
import { DEFAULT_LOFT_OPTIONS } from '../geometry/loft'
import type { LoftOptions } from '../geometry/loft'
import {
  DEFAULT_SURFACE_PARAMS,
  type SurfaceId,
  type SurfaceParams,
} from '../geometry/surfaces'
import { DEFAULT_SAMPLER_PARAMS } from '../geometry/sampler'
import type { SamplerParams } from '../geometry/sampler'
import {
  createAttractor,
  type Attractor,
  type CombineMode,
  type FalloffType,
} from '../geometry/attractionField'

export type AppMode = 'loft' | 'field'

const DEFAULT_SPINE: Vec3[] = [
  [-6, 0, 0],
  [-2, 3, 1.5],
  [2, 3, -1.5],
  [6, 0, 0],
]

export interface AppState {
  mode: AppMode

  // --- Fase 1: volumen parametrico ---
  profile: ProfileParams
  scalePreset: ScalePresetId
  scale: ScaleParams
  spine: Vec3[]
  loft: LoftOptions

  // --- Fase 2: mapas de atraccion ---
  surfaceId: SurfaceId
  surface: SurfaceParams
  attractors: Attractor[]
  selectedAttractorId: string | null
  sampler: SamplerParams
  combine: CombineMode

  // acciones
  setMode: (m: AppMode) => void
  setProfileParam: (key: keyof ProfileParams, value: number) => void
  setScalePreset: (id: ScalePresetId) => void
  setScaleParam: (key: keyof ScaleParams, value: number) => void
  setLoftOption: <K extends keyof LoftOptions>(key: K, value: LoftOptions[K]) => void
  setSpinePoint: (index: number, value: Vec3) => void
  addSpinePoint: () => void
  removeSpinePoint: (index: number) => void

  setSurfaceId: (id: SurfaceId) => void
  setSurfaceParam: (key: keyof SurfaceParams, value: number) => void
  setSamplerParam: (key: keyof SamplerParams, value: number) => void
  setCombine: (mode: CombineMode) => void
  addAttractor: (position: Vec3) => void
  updateAttractor: (id: string, patch: Partial<Omit<Attractor, 'id'>>) => void
  removeAttractor: (id: string) => void
  selectAttractor: (id: string | null) => void

  reset: () => void
}

function initialAttractors(): Attractor[] {
  return [
    createAttractor(new THREE.Vector3(0, 5, 6), {
      radius: 7,
      strength: 1,
      falloff: 'gaussian',
    }),
    createAttractor(new THREE.Vector3(0, -4, -5), {
      radius: 5,
      strength: 0.7,
      falloff: 'linear',
    }),
  ]
}

const INITIAL = {
  mode: 'loft' as AppMode,
  profile: { ...DEFAULT_PROFILE_PARAMS },
  scalePreset: 'bell' as ScalePresetId,
  scale: { ...DEFAULT_SCALE_PARAMS },
  spine: DEFAULT_SPINE.map((p) => [...p] as Vec3),
  loft: { ...DEFAULT_LOFT_OPTIONS },
  surfaceId: 'deformedCylinder' as SurfaceId,
  surface: { ...DEFAULT_SURFACE_PARAMS },
  sampler: { ...DEFAULT_SAMPLER_PARAMS },
  combine: 'max' as CombineMode,
}

export const useAppStore = create<AppState>((set) => ({
  ...INITIAL,
  attractors: initialAttractors(),
  selectedAttractorId: null,

  setMode: (mode) => set({ mode }),

  setProfileParam: (key, value) =>
    set((s) => ({ profile: { ...s.profile, [key]: value } })),

  setScalePreset: (scalePreset) => set({ scalePreset }),

  setScaleParam: (key, value) => set((s) => ({ scale: { ...s.scale, [key]: value } })),

  setLoftOption: (key, value) => set((s) => ({ loft: { ...s.loft, [key]: value } })),

  setSpinePoint: (index, value) =>
    set((s) => {
      const spine = s.spine.slice()
      spine[index] = value
      return { spine }
    }),

  addSpinePoint: () =>
    set((s) => {
      const spine = s.spine.slice()
      const last = spine[spine.length - 1]
      const prev = spine[spine.length - 2] ?? [last[0] - 4, last[1], last[2]]
      spine.push([
        last[0] + (last[0] - prev[0]),
        last[1] + (last[1] - prev[1]),
        last[2] + (last[2] - prev[2]),
      ])
      return { spine }
    }),

  removeSpinePoint: (index) =>
    set((s) => {
      if (s.spine.length <= 2) return s
      return { spine: s.spine.filter((_, i) => i !== index) }
    }),

  setSurfaceId: (surfaceId) => set({ surfaceId }),
  setSurfaceParam: (key, value) =>
    set((s) => ({ surface: { ...s.surface, [key]: value } })),
  setSamplerParam: (key, value) =>
    set((s) => ({ sampler: { ...s.sampler, [key]: value } })),
  setCombine: (combine) => set({ combine }),

  addAttractor: (position) =>
    set((s) => {
      const a = createAttractor(new THREE.Vector3(position[0], position[1], position[2]))
      return { attractors: [...s.attractors, a], selectedAttractorId: a.id }
    }),

  updateAttractor: (id, patch) =>
    set((s) => ({
      attractors: s.attractors.map((a) => (a.id === id ? applyPatch(a, patch) : a)),
    })),

  removeAttractor: (id) =>
    set((s) => ({
      attractors: s.attractors.filter((a) => a.id !== id),
      selectedAttractorId: s.selectedAttractorId === id ? null : s.selectedAttractorId,
    })),

  selectAttractor: (selectedAttractorId) => set({ selectedAttractorId }),

  reset: () =>
    set({
      ...INITIAL,
      spine: DEFAULT_SPINE.map((p) => [...p] as Vec3),
      attractors: initialAttractors(),
      selectedAttractorId: null,
    }),
}))

function applyPatch(a: Attractor, patch: Partial<Omit<Attractor, 'id'>>): Attractor {
  return {
    ...a,
    ...patch,
    position: patch.position ? patch.position.clone() : a.position,
    falloff: (patch.falloff as FalloffType | undefined) ?? a.falloff,
  }
}

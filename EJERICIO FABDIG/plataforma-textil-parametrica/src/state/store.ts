/**
 * Estado global de la app (Zustand).
 *
 * Guarda SOLO parametros que generan geometria, nunca las mallas resultantes.
 * Cada modulo de geometria las deriva de aca con funciones puras.
 */
import { create } from 'zustand'
import * as THREE from 'three'
import type { ProfileParams } from '../geometry/profile'
import {
  DEFAULT_FEATHER_FIELD,
  type FeatherFieldParams,
} from '../geometry/featherField'
import {
  createAttractor,
  type Attractor,
  type CombineMode,
  type FalloffType,
} from '../geometry/attractionField'

export type AppMode = 'volume' | 'laser'

/** Campos numericos de FeatherFieldParams editables desde la UI. */
export type FieldNumericKey = Exclude<
  keyof FeatherFieldParams,
  'combine' | 'alignToField' | 'rib' | 'profile'
>

export interface AppState {
  mode: AppMode

  // --- Modo Volumen: campo de plumas desde un plano ---
  field: FeatherFieldParams
  attractors: Attractor[]
  selectedAttractorId: string | null

  // acciones
  setMode: (m: AppMode) => void
  setFieldParam: (key: FieldNumericKey, value: number) => void
  setProfileParam: (key: keyof ProfileParams, value: number) => void
  setCombine: (mode: CombineMode) => void
  toggleAlignToField: () => void
  toggleRib: () => void

  addAttractor: (position: [number, number, number]) => void
  updateAttractor: (id: string, patch: Partial<Omit<Attractor, 'id'>>) => void
  removeAttractor: (id: string) => void
  selectAttractor: (id: string | null) => void

  reset: () => void
}

function initialAttractors(): Attractor[] {
  return [
    createAttractor(new THREE.Vector3(0, 5, 2), { radius: 12, strength: 1, falloff: 'gaussian' }),
    createAttractor(new THREE.Vector3(-9, 3, -7), { radius: 8, strength: 0.65, falloff: 'linear' }),
  ]
}

function initialField(): FeatherFieldParams {
  return {
    ...DEFAULT_FEATHER_FIELD,
    profile: { ...DEFAULT_FEATHER_FIELD.profile },
  }
}

export const useAppStore = create<AppState>((set) => ({
  mode: 'volume',
  field: initialField(),
  attractors: initialAttractors(),
  selectedAttractorId: null,

  setMode: (mode) => set({ mode }),

  setFieldParam: (key, value) => set((s) => ({ field: { ...s.field, [key]: value } })),

  setProfileParam: (key, value) =>
    set((s) => ({ field: { ...s.field, profile: { ...s.field.profile, [key]: value } } })),

  setCombine: (combine) => set((s) => ({ field: { ...s.field, combine } })),

  toggleAlignToField: () =>
    set((s) => ({ field: { ...s.field, alignToField: !s.field.alignToField } })),

  toggleRib: () => set((s) => ({ field: { ...s.field, rib: !s.field.rib } })),

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
      mode: 'volume',
      field: initialField(),
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

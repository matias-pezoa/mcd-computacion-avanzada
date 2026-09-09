import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  buildFeatherField,
  mergeForExport,
  DEFAULT_FEATHER_FIELD,
} from '../featherField'
import { createAttractor } from '../attractionField'

const centerAttractor = () =>
  createAttractor(new THREE.Vector3(0, 4, 0), { radius: 16, strength: 1, falloff: 'gaussian' })

// campo pequeno y rapido para los tests
const base = {
  ...DEFAULT_FEATHER_FIELD,
  gridU: 20,
  gridV: 20,
  quillSegments: 8,
  maxCount: 200,
  profile: { ...DEFAULT_FEATHER_FIELD.profile, resolution: 8 },
}

describe('buildFeatherField', () => {
  it('es determinista: mismo seed -> mismo resultado', () => {
    const a = buildFeatherField([centerAttractor()], base)
    const b = buildFeatherField([centerAttractor()], base)
    expect(a.count).toBe(b.count)
    expect(a.placements[0]).toEqual(b.placements[0])
    a.blades.dispose()
    b.blades.dispose()
  })

  it('mas plumas con un atractor que sin atractores', () => {
    const withA = buildFeatherField([centerAttractor()], { ...base, densityMin: 0 })
    const without = buildFeatherField([], { ...base, densityMin: 0 })
    expect(withA.count).toBeGreaterThan(without.count)
    expect(without.count).toBe(0)
    expect(without.blades.getAttribute('position')?.count ?? 0).toBe(0)
    expect(without.ribs).toBeNull()
  })

  it('respeta el tope maxCount', () => {
    const res = buildFeatherField([createAttractor(new THREE.Vector3(0, 2, 0), { radius: 80, strength: 1 })], {
      ...base,
      densityMin: 1,
      densityMax: 1,
      maxCount: 30,
    })
    expect(res.count).toBe(30)
  })

  it('genera malla de palas valida (indexada, sin NaN) y caja envolvente no vacia', () => {
    const res = buildFeatherField([centerAttractor()], base)
    expect(res.count).toBeGreaterThan(0)
    expect(res.blades.getIndex()).not.toBeNull()
    const pos = res.blades.getAttribute('position')
    for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true)
    expect(res.bounds.isEmpty()).toBe(false)
    // las plumas nacen del plano (y~0) y suben
    expect(res.bounds.min.y).toBeGreaterThan(-0.5)
    expect(res.bounds.max.y).toBeGreaterThan(0.5)
  })

  it('nervadura: null si rib=false, malla si rib=true', () => {
    const withRib = buildFeatherField([centerAttractor()], { ...base, rib: true })
    const noRib = buildFeatherField([centerAttractor()], { ...base, rib: false })
    expect(noRib.ribs).toBeNull()
    expect(withRib.ribs).not.toBeNull()
    expect(withRib.ribs!.getAttribute('position').count).toBeGreaterThan(0)
  })

  it('mergeForExport fusiona palas + nervaduras en una malla', () => {
    const res = buildFeatherField([centerAttractor()], { ...base, rib: true })
    const merged = mergeForExport(res)
    const bladeTris = (res.blades.getIndex()?.count ?? 0) / 3
    const ribTris = (res.ribs?.getIndex()?.count ?? 0) / 3
    const mergedTris = (merged.getIndex()?.count ?? 0) / 3
    expect(mergedTris).toBeCloseTo(bladeTris + ribTris, 0)
    merged.dispose()
  })
})

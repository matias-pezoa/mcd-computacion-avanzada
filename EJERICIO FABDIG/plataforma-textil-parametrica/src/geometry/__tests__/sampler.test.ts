import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { sampleSurface, DEFAULT_SAMPLER_PARAMS } from '../sampler'
import { createSurface, DEFAULT_SURFACE_PARAMS } from '../surfaces'
import { createAttractor } from '../attractionField'

const surface = createSurface('sphere', DEFAULT_SURFACE_PARAMS)

describe('sampleSurface', () => {
  it('es determinista: mismo seed -> mismo resultado', () => {
    const attractors = [
      createAttractor(new THREE.Vector3(0, 6, 0), { radius: 10, strength: 1 }),
    ]
    const a = sampleSurface(surface, attractors, DEFAULT_SAMPLER_PARAMS)
    const b = sampleSurface(surface, attractors, DEFAULT_SAMPLER_PARAMS)
    expect(a.length).toBe(b.length)
    expect(a[0].position.toArray()).toEqual(b[0].position.toArray())
  })

  it('mas instancias con un atractor fuerte que sin atractores', () => {
    const withA = sampleSurface(
      surface,
      [createAttractor(new THREE.Vector3(0, 6, 0), { radius: 12, strength: 1 })],
      { ...DEFAULT_SAMPLER_PARAMS, densityMin: 0 },
    )
    const without = sampleSurface(surface, [], {
      ...DEFAULT_SAMPLER_PARAMS,
      densityMin: 0,
    })
    expect(withA.length).toBeGreaterThan(without.length)
    expect(without.length).toBe(0)
  })

  it('respeta el tope maxCount', () => {
    const res = sampleSurface(
      surface,
      [createAttractor(new THREE.Vector3(0, 0, 0), { radius: 50, strength: 1 })],
      { ...DEFAULT_SAMPLER_PARAMS, densityMin: 1, densityMax: 1, maxCount: 100 },
    )
    expect(res.length).toBeLessThanOrEqual(100)
    expect(res.length).toBe(100)
  })

  it('cada instancia tiene escala dentro del rango y ejes ortonormales', () => {
    const res = sampleSurface(
      surface,
      [createAttractor(new THREE.Vector3(0, 6, 0), { radius: 12, strength: 1 })],
      DEFAULT_SAMPLER_PARAMS,
    )
    for (const inst of res) {
      expect(inst.scale).toBeGreaterThanOrEqual(DEFAULT_SAMPLER_PARAMS.scaleMin - 1e-6)
      expect(inst.scale).toBeLessThanOrEqual(DEFAULT_SAMPLER_PARAMS.scaleMax + 1e-6)
      expect(inst.normal.length()).toBeCloseTo(1, 5)
      expect(inst.tangent.length()).toBeCloseTo(1, 5)
      expect(Math.abs(inst.normal.dot(inst.tangent))).toBeLessThan(0.05)
    }
  })
})

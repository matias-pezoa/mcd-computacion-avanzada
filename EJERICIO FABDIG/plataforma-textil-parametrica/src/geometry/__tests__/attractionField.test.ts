import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  createAttractor,
  falloff,
  sampleField,
  type FalloffType,
} from '../attractionField'

describe('falloff', () => {
  const types: FalloffType[] = ['linear', 'inverseSquare', 'gaussian']

  it('vale ~1 en el centro y decrece con la distancia', () => {
    for (const t of types) {
      expect(falloff(t, 0, 5)).toBeCloseTo(1, 1)
      let prev = Infinity
      for (let d = 0; d <= 5; d += 0.5) {
        const v = falloff(t, d, 5)
        expect(v).toBeLessThanOrEqual(prev + 1e-9)
        prev = v
      }
    }
  })

  it('linear llega a 0 en el radio', () => {
    expect(falloff('linear', 5, 5)).toBeCloseTo(0, 6)
    expect(falloff('linear', 10, 5)).toBe(0)
  })
})

describe('sampleField', () => {
  it('el valor es mayor cerca de un atractor que lejos', () => {
    const a = createAttractor(new THREE.Vector3(0, 0, 0), { radius: 10, strength: 1 })
    const near = sampleField(new THREE.Vector3(1, 0, 0), [a])
    const far = sampleField(new THREE.Vector3(8, 0, 0), [a])
    expect(near.value).toBeGreaterThan(far.value)
  })

  it('la direccion apunta hacia el atractor', () => {
    const a = createAttractor(new THREE.Vector3(10, 0, 0), { radius: 20, strength: 1 })
    const s = sampleField(new THREE.Vector3(0, 0, 0), [a])
    expect(s.direction).not.toBeNull()
    expect(s.direction!.dot(new THREE.Vector3(1, 0, 0))).toBeGreaterThan(0.9)
  })

  it('combine "sum" acumula solapes; "max" no', () => {
    const p = new THREE.Vector3(0, 0, 0)
    const a1 = createAttractor(p.clone(), {
      radius: 10,
      strength: 0.5,
      falloff: 'linear',
    })
    const a2 = createAttractor(p.clone(), {
      radius: 10,
      strength: 0.5,
      falloff: 'linear',
    })
    const sum = sampleField(p, [a1, a2], 'sum')
    const max = sampleField(p, [a1, a2], 'max')
    expect(sum.value).toBeGreaterThan(max.value)
    expect(max.value).toBeCloseTo(0.5, 5)
  })

  it('campo vacio -> valor 0 y sin direccion', () => {
    const s = sampleField(new THREE.Vector3(0, 0, 0), [])
    expect(s.value).toBe(0)
    expect(s.direction).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildQuillSpine } from '../quill'

const params = { height: 5, curvature: 0, leanDeg: 0, segments: 16 }

describe('buildQuillSpine', () => {
  it('sin curvatura ni inclinacion sube recto desde la base', () => {
    const base = new THREE.Vector3(2, 0, -1)
    const { curve } = buildQuillSpine(base, new THREE.Vector2(1, 0), params)
    const pts = curve.points
    expect(pts[0].distanceTo(base)).toBeLessThan(1e-9)
    for (const p of pts) {
      expect(Math.abs(p.x - base.x)).toBeLessThan(1e-6)
      expect(Math.abs(p.z - base.z)).toBeLessThan(1e-6)
    }
    const tip = pts[pts.length - 1]
    expect(tip.y).toBeGreaterThan(pts[0].y)
    expect(tip.y - base.y).toBeCloseTo(params.height, 1)
  })

  it('con curvatura la punta se desplaza en la direccion de inclinacion', () => {
    const base = new THREE.Vector3(0, 0, 0)
    const dir = new THREE.Vector2(0, 1) // hacia +Z
    const { curve } = buildQuillSpine(base, dir, { ...params, curvature: 0.8 })
    const tip = curve.points[curve.points.length - 1]
    expect(tip.z).toBeGreaterThan(1) // se arqueo hacia +Z
    expect(Math.abs(tip.x)).toBeLessThan(0.2) // sin componente lateral
    expect(tip.y).toBeGreaterThan(0.5)
  })

  it('crossAxis es horizontal y perpendicular a la inclinacion', () => {
    const dir = new THREE.Vector2(1, 2).normalize()
    const { crossAxis } = buildQuillSpine(new THREE.Vector3(), dir, params)
    expect(crossAxis.y).toBeCloseTo(0, 6)
    expect(crossAxis.length()).toBeCloseTo(1, 6)
    expect(crossAxis.x * dir.x + crossAxis.z * dir.y).toBeCloseTo(0, 6)
  })

  it('es una funcion pura: mismos parametros -> misma curva', () => {
    const a = buildQuillSpine(new THREE.Vector3(1, 0, 1), new THREE.Vector2(1, 1), params)
    const b = buildQuillSpine(new THREE.Vector3(1, 0, 1), new THREE.Vector2(1, 1), params)
    expect(a.curve.points.map((p) => p.toArray())).toEqual(b.curve.points.map((p) => p.toArray()))
  })

  it('leanDir ~0 no rompe (usa +X)', () => {
    const { curve } = buildQuillSpine(new THREE.Vector3(), new THREE.Vector2(0, 0), params)
    for (const p of curve.points) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(Number.isFinite(p.z)).toBe(true)
    }
  })
})

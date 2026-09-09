import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { loftProfile } from '../loft'
import { buildProfile, DEFAULT_PROFILE_PARAMS } from '../profile'
import type { ScaleFn, Vec2 } from '../types'

const square: Vec2[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]

const constant =
  (k: number): ScaleFn =>
  () =>
    k

function straightCurve() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(-5, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(3, 0, 0),
    new THREE.Vector3(6, 0, 0),
  ])
}

/** Curva que sube arqueandose (como una pluma desde un plano). */
function risingArc() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.5, 2, 0),
    new THREE.Vector3(1.8, 3.6, 0),
    new THREE.Vector3(3.6, 4.4, 0),
  ])
}

function ringRadius(ring: THREE.Vector3[]): number {
  const c = new THREE.Vector3()
  for (const v of ring) c.add(v)
  c.multiplyScalar(1 / ring.length)
  return ring.reduce((s, v) => s + v.distanceTo(c), 0) / ring.length
}

function triAreas(geometry: THREE.BufferGeometry): number[] {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const idx = geometry.getIndex()!
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const areas: number[] = []
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(pos, idx.getX(i))
    b.fromBufferAttribute(pos, idx.getX(i + 1))
    c.fromBufferAttribute(pos, idx.getX(i + 2))
    areas.push(b.clone().sub(a).cross(c.clone().sub(a)).length() * 0.5)
  }
  return areas
}

describe('loftProfile', () => {
  it('con escala constante da secciones de radio uniforme', () => {
    const res = loftProfile(square, straightCurve(), constant(1), { sections: 40, caps: true })
    const radii = res.rings.map(ringRadius)
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-6)
  })

  it('con escala variable la seccion central es mayor que los extremos', () => {
    const bell: ScaleFn = (t) => 0.1 + 0.9 * Math.exp(-((t - 0.5) ** 2) / (2 * 0.12 ** 2))
    const res = loftProfile(square, straightCurve(), bell, { sections: 41, caps: false })
    const radii = res.rings.map(ringRadius)
    const mid = radii[Math.floor(radii.length / 2)]
    expect(mid).toBeGreaterThan(radii[0] * 2)
    expect(mid).toBeGreaterThan(radii[radii.length - 1] * 2)
  })

  it('escala 0 en un extremo colapsa la seccion sin dejar triangulos degenerados', () => {
    const res = loftProfile(square, straightCurve(), (t) => t, { sections: 30, caps: true })
    expect(res.collapsedSections).toContain(0)
    const r0 = res.rings[0]
    for (const v of r0) expect(v.distanceTo(r0[0])).toBeLessThan(1e-9)
    const areas = triAreas(res.geometry)
    expect(areas.length).toBeGreaterThan(0)
    expect(Math.min(...areas)).toBeGreaterThan(1e-9)
  })

  it('marco "reference": el eje ancho del perfil se mantiene ~perpendicular a up', () => {
    const up = new THREE.Vector3(0, 0, 1) // el arco esta en el plano XY -> up en Z
    const res = loftProfile(square, risingArc(), constant(1), {
      sections: 24,
      caps: false,
      frame: { type: 'reference', up },
    })
    // en marco reference, el "ancho" (perfil x, +-1) va sobre un eje ~= up.
    // el ancho de cada anillo proyectado en Z debe ser ~2 (no cae a 0 como
    // pasaria si el marco girara).
    for (const ring of res.rings) {
      let minZ = Infinity
      let maxZ = -Infinity
      for (const v of ring) {
        minZ = Math.min(minZ, v.z)
        maxZ = Math.max(maxZ, v.z)
      }
      expect(maxZ - minZ).toBeGreaterThan(1.9)
    }
  })

  it('produce una malla indexada con normales y sin NaN', () => {
    const profile = buildProfile(DEFAULT_PROFILE_PARAMS)
    const res = loftProfile(profile, straightCurve(), (t) => 0.2 + 0.8 * t, {
      sections: 24,
      caps: true,
    })
    const pos = res.geometry.getAttribute('position')
    expect(res.geometry.getIndex()).not.toBeNull()
    expect(res.geometry.getAttribute('normal')).toBeTruthy()
    for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true)
  })

  it('rechaza perfiles con menos de 3 puntos', () => {
    expect(() =>
      loftProfile(
        [
          [0, 0],
          [1, 1],
        ],
        straightCurve(),
        () => 1,
      ),
    ).toThrow()
  })
})

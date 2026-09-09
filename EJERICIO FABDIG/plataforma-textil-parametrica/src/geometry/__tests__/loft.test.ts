import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { loftProfile } from '../loft'
import { buildProfile, DEFAULT_PROFILE_PARAMS } from '../profile'
import { makeScaleFn } from '../scaleProfiles'
import type { Vec2 } from '../types'

const square: Vec2[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]

function straightCurve() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(-5, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(3, 0, 0),
    new THREE.Vector3(6, 0, 0),
  ])
}

/** Radio medio del anillo respecto de su centroide. */
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
    const res = loftProfile(
      square,
      straightCurve(),
      makeScaleFn('constant', {
        start: 1,
        end: 1,
        peak: 1,
        peakPos: 0.5,
        bellWidth: 0.3,
      }),
      { sections: 40, caps: true },
    )

    const radii = res.rings.map(ringRadius)
    const min = Math.min(...radii)
    const max = Math.max(...radii)
    expect(max - min).toBeLessThan(1e-6)
  })

  it('con escala de campana la seccion central es mayor que los extremos', () => {
    const res = loftProfile(
      square,
      straightCurve(),
      makeScaleFn('bell', {
        start: 0.1,
        end: 0.1,
        peak: 1,
        peakPos: 0.5,
        bellWidth: 0.3,
      }),
      { sections: 41, caps: false },
    )

    const radii = res.rings.map(ringRadius)
    const mid = radii[Math.floor(radii.length / 2)]
    expect(mid).toBeGreaterThan(radii[0] * 2)
    expect(mid).toBeGreaterThan(radii[radii.length - 1] * 2)
  })

  it('escala 0 en un extremo colapsa la seccion sin dejar triangulos degenerados', () => {
    const res = loftProfile(
      square,
      straightCurve(),
      (t) => t, // escala 0 en t=0
      { sections: 30, caps: true },
    )

    expect(res.collapsedSections).toContain(0)
    // el anillo colapsado es un unico punto repetido
    const r0 = res.rings[0]
    for (const v of r0) expect(v.distanceTo(r0[0])).toBeLessThan(1e-9)
    // ningun triangulo final tiene area ~0
    const areas = triAreas(res.geometry)
    expect(areas.length).toBeGreaterThan(0)
    expect(Math.min(...areas)).toBeGreaterThan(1e-9)
  })

  it('produce una malla indexada con normales y sin NaN', () => {
    const profile = buildProfile(DEFAULT_PROFILE_PARAMS)
    const res = loftProfile(
      profile,
      straightCurve(),
      makeScaleFn('linear', {
        start: 0.2,
        end: 1,
        peak: 1,
        peakPos: 0.5,
        bellWidth: 0.3,
      }),
      { sections: 24, caps: true },
    )
    const pos = res.geometry.getAttribute('position')
    const nrm = res.geometry.getAttribute('normal')
    expect(res.geometry.getIndex()).not.toBeNull()
    expect(nrm).toBeTruthy()
    for (let i = 0; i < pos.array.length; i++) {
      expect(Number.isFinite(pos.array[i])).toBe(true)
    }
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

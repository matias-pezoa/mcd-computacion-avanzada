import { describe, expect, it } from 'vitest'
import {
  buildProfile,
  DEFAULT_PROFILE_PARAMS,
  profileBounds,
  signedArea,
} from '../profile'
import { mmToThree } from '../../utils/units'

describe('buildProfile', () => {
  it('devuelve una polilinea cerrada en sentido antihorario', () => {
    const pts = buildProfile(DEFAULT_PROFILE_PARAMS)
    expect(pts.length).toBeGreaterThanOrEqual(3)
    expect(signedArea(pts)).toBeGreaterThan(0)
  })

  it('respeta ancho y alto pedidos (en unidades de Three)', () => {
    const pts = buildProfile({
      ...DEFAULT_PROFILE_PARAMS,
      widthMm: 80,
      heightMm: 20,
      teeth: 0,
    })
    const b = profileBounds(pts)
    expect(b.maxX - b.minX).toBeCloseTo(mmToThree(80), 3)
    expect(b.maxY - b.minY).toBeCloseTo(mmToThree(20), 3)
  })

  it('sin dientes el perfil es simetrico arriba/abajo', () => {
    const pts = buildProfile({ ...DEFAULT_PROFILE_PARAMS, teeth: 0 })
    const b = profileBounds(pts)
    expect(b.maxY).toBeCloseTo(-b.minY, 6)
  })

  it('con dientes cambia el contorno pero mantiene el ancho', () => {
    const smooth = buildProfile({ ...DEFAULT_PROFILE_PARAMS, teeth: 0 })
    const toothed = buildProfile({ ...DEFAULT_PROFILE_PARAMS, teeth: 8, toothDepth: 0.6 })
    expect(profileBounds(toothed).maxX).toBeCloseTo(profileBounds(smooth).maxX, 6)
    // el area encerrada disminuye al "morder" el borde
    expect(signedArea(toothed)).toBeLessThan(signedArea(smooth))
  })

  it('no genera coordenadas NaN ante parametros extremos', () => {
    const pts = buildProfile({
      widthMm: 0,
      heightMm: 0,
      teeth: 40,
      toothDepth: 1,
      resolution: 3,
    })
    for (const [x, y] of pts) {
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
    }
  })
})

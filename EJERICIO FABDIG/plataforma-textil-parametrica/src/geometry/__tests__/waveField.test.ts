import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildWaveField, DEFAULT_WAVE_FIELD } from '../waveField'
import { SAFE_OVERHANG_DEG } from '../printability'
import { createAttractor } from '../attractionField'
import { mmToThree, threeToMm } from '../../utils/units'
import type { Boundary } from '../polygon'

const base = { ...DEFAULT_WAVE_FIELD, planeSize: 20 }

function centerAttractor(strength = 1) {
  return createAttractor(new THREE.Vector3(0, 3, 0), {
    radius: 15,
    strength,
    falloff: 'gaussian',
  })
}

describe('buildWaveField', () => {
  it('la mitad "de abajo" de la malla es siempre plana en y = 0', () => {
    const res = buildWaveField([centerAttractor()], base)
    const pos = res.geometry.getAttribute('position')
    const topCount = (res.segmentsU + 1) * (res.segmentsV + 1)
    for (let i = topCount; i < pos.count; i++) {
      expect(pos.getY(i)).toBeCloseTo(0, 6)
    }
  })

  it('sin atractores el panel queda liso, a la altura del espesor de base', () => {
    const res = buildWaveField([], base)
    expect(res.bounds.min.y).toBeCloseTo(0, 6)
    expect(res.bounds.max.y).toBeCloseTo(mmToThree(base.thicknessBaseMm), 6)
  })

  it('con un atractor aparecen crestas por encima del espesor de base', () => {
    const res = buildWaveField([centerAttractor()], base)
    expect(res.bounds.max.y).toBeGreaterThan(mmToThree(base.thicknessBaseMm) + 1e-4)
  })

  it('la amplitud se recorta si excede la pendiente autosoportada, nunca al reves', () => {
    const risky = { ...base, wavelengthMm: 6, amplitudeMm: 50, maxOverhangDeg: 20 }
    const res = buildWaveField([centerAttractor()], risky)
    const wavelengthThree = mmToThree(risky.wavelengthMm)
    const maxSafeMm =
      ((Math.tan((risky.maxOverhangDeg * Math.PI) / 180) * wavelengthThree) /
        (2 * Math.PI)) *
      10
    expect(res.amplitudeLimited).toBe(true)
    expect(res.appliedAmplitudeMm).toBeLessThanOrEqual(maxSafeMm + 1e-6)
    expect(res.appliedAmplitudeMm).toBeLessThan(risky.amplitudeMm)
  })

  it('una amplitud modesta para su longitud de onda no se recorta', () => {
    const gentle = { ...base, wavelengthMm: 40, amplitudeMm: 1, maxOverhangDeg: 35 }
    const res = buildWaveField([centerAttractor()], gentle)
    expect(res.amplitudeLimited).toBe(false)
    expect(res.appliedAmplitudeMm).toBeCloseTo(1, 6)
  })

  it('el vuelo nunca supera el techo absoluto SAFE_OVERHANG_DEG aunque se pida mas', () => {
    const res = buildWaveField([centerAttractor()], { ...base, maxOverhangDeg: 999 })
    // pendiente maxima real = amplitud*2*pi/longitud; comprobamos que el angulo
    // resultante no supera el techo absoluto.
    const amplitudeThree = mmToThree(res.appliedAmplitudeMm)
    const wavelengthThree = mmToThree(base.wavelengthMm)
    const slopeDeg =
      (Math.atan((amplitudeThree * 2 * Math.PI) / wavelengthThree) * 180) / Math.PI
    expect(slopeDeg).toBeLessThanOrEqual(SAFE_OVERHANG_DEG + 1e-6)
  })

  it('combine "sum" da crestas iguales o mayores que "max" donde se solapan dos atractores', () => {
    const a1 = createAttractor(new THREE.Vector3(-2, 3, 0), {
      radius: 15,
      strength: 1,
      falloff: 'linear',
    })
    const a2 = createAttractor(new THREE.Vector3(2, 3, 0), {
      radius: 15,
      strength: 1,
      falloff: 'linear',
    })
    const sum = buildWaveField([a1, a2], { ...base, combine: 'sum' })
    const max = buildWaveField([a1, a2], { ...base, combine: 'max' })
    expect(sum.bounds.max.y).toBeGreaterThanOrEqual(max.bounds.max.y - 1e-6)
  })

  it('respeta el minimo y maximo de segmentos por eje', () => {
    const coarse = buildWaveField([], { ...base, wavelengthMm: 1000, facetsPerWave: 1 })
    expect(coarse.segmentsU).toBeGreaterThanOrEqual(4)
    expect(coarse.segmentsV).toBeGreaterThanOrEqual(4)
    const fine = buildWaveField([], { ...base, wavelengthMm: 1, facetsPerWave: 16 })
    expect(fine.segmentsU).toBeLessThanOrEqual(200)
    expect(fine.segmentsV).toBeLessThanOrEqual(200)
  })

  it('genera una malla solida valida (indexada, sin NaN)', () => {
    const res = buildWaveField([centerAttractor()], base)
    expect(res.geometry.getIndex()).not.toBeNull()
    const pos = res.geometry.getAttribute('position')
    for (let i = 0; i < pos.array.length; i++)
      expect(Number.isFinite(pos.array[i])).toBe(true)
    expect(res.triangleCount).toBeGreaterThan(0)
  })

  it('es determinista: mismos parametros -> mismo resultado', () => {
    const a = buildWaveField([centerAttractor()], base)
    const b = buildWaveField([centerAttractor()], base)
    expect(a.triangleCount).toBe(b.triangleCount)
    expect(a.bounds.max.y).toBeCloseTo(b.bounds.max.y, 9)
  })

  describe('con un contorno personalizado (base importada)', () => {
    // rectangulo 80x60mm, mucho mas chico que el panel cuadrado por defecto
    const rect: Boundary = {
      outer: [
        [-40, -30],
        [40, -30],
        [40, 30],
        [-40, 30],
      ],
      holes: [],
    }

    it('recorta la malla al contorno: menos triangulos que el panel cuadrado completo', () => {
      const square = buildWaveField([], base) // sin boundary, planeSize=20 (u3d=200mm)
      const clipped = buildWaveField([], base, rect)
      expect(clipped.triangleCount).toBeLessThan(square.triangleCount)
    })

    it('las dimensiones reportadas coinciden con el contorno, no con vertices huerfanos', () => {
      const res = buildWaveField([], base, rect)
      const sizeX = threeToMm(res.bounds.max.x - res.bounds.min.x)
      const sizeZ = threeToMm(res.bounds.max.z - res.bounds.min.z)
      // tolerancia de un par de celdas de grilla (el contorno "escalona" al
      // resolverse en celdas, ver buildSolidHeightfield).
      expect(sizeX).toBeGreaterThan(70)
      expect(sizeX).toBeLessThanOrEqual(80 + 1e-6)
      expect(sizeZ).toBeGreaterThan(50)
      expect(sizeZ).toBeLessThanOrEqual(60 + 1e-6)
    })

    it('un agujero (p. ej. una pinza) reduce aun mas los triangulos', () => {
      // resolucion mas fina que en los demas tests de este bloque, para que
      // el agujero (20x20mm) quede resuelto por varias celdas de la grilla
      // en vez de perderse entre los centros de celda muestreados.
      const fine = { ...base, wavelengthMm: 20, facetsPerWave: 4 }
      const withHole: Boundary = {
        outer: rect.outer,
        holes: [
          [
            [-10, -10],
            [10, -10],
            [10, 10],
            [-10, 10],
          ],
        ],
      }
      const solid = buildWaveField([], fine, rect)
      const holed = buildWaveField([], fine, withHole)
      expect(holed.triangleCount).toBeLessThan(solid.triangleCount)
    })

    it('un contorno rectangular no cuadrado da segmentsU y segmentsV distintos', () => {
      const tall: Boundary = {
        outer: [
          [-20, -60],
          [20, -60],
          [20, 60],
          [-20, 60],
        ],
        holes: [],
      }
      const res = buildWaveField([], base, tall)
      expect(res.segmentsV).toBeGreaterThan(res.segmentsU)
    })

    it('base plana en y=0 se mantiene aunque se use un contorno personalizado', () => {
      const res = buildWaveField([centerAttractor()], base, rect)
      expect(res.bounds.min.y).toBeCloseTo(0, 6)
    })

    it('malla valida (indexada, sin NaN) con contorno personalizado', () => {
      const res = buildWaveField([centerAttractor()], base, rect)
      expect(res.geometry.getIndex()).not.toBeNull()
      const pos = res.geometry.getAttribute('position')
      for (let i = 0; i < pos.array.length; i++)
        expect(Number.isFinite(pos.array[i])).toBe(true)
      expect(res.triangleCount).toBeGreaterThan(0)
    })
  })
})

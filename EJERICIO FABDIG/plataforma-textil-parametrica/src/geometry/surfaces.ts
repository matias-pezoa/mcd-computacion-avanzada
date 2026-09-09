/**
 * Superficies parametricas de prueba para el instanciado dirigido por campo
 * (Fase 2). Cada superficie mapea (u,v) en [0,1]^2 a un punto y su normal.
 *
 * En una fase posterior esto se reemplaza por una malla importada (maniqui)
 * consultada con three-mesh-bvh; la interfaz `ParametricSurface` se mantiene.
 */
import * as THREE from 'three'

export interface ParametricSurface {
  point(u: number, v: number, target?: THREE.Vector3): THREE.Vector3
  normal(u: number, v: number, target?: THREE.Vector3): THREE.Vector3
}

export type SurfaceId = 'sphere' | 'deformedCylinder'

export interface SurfaceParams {
  radius: number
  height: number
  /** Amplitud de la deformacion del cilindro (0 = cilindro recto). */
  bulge: number
}

export const DEFAULT_SURFACE_PARAMS: SurfaceParams = {
  radius: 6,
  height: 16,
  bulge: 0.35,
}

function finiteDifferenceNormal(
  s: Pick<ParametricSurface, 'point'>,
  u: number,
  v: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const h = 1e-4
  const p0 = s.point(u, v, new THREE.Vector3())
  const pu = s.point(Math.min(1, u + h), v, new THREE.Vector3()).sub(p0)
  const pv = s.point(u, Math.min(1, v + h), new THREE.Vector3()).sub(p0)
  return target.crossVectors(pu, pv).normalize()
}

export function createSurface(id: SurfaceId, params: SurfaceParams): ParametricSurface {
  if (id === 'sphere') {
    const R = params.radius
    return {
      point(u, v, target = new THREE.Vector3()) {
        const theta = u * Math.PI * 2
        const phi = v * Math.PI
        return target.set(
          R * Math.sin(phi) * Math.cos(theta),
          R * Math.cos(phi),
          R * Math.sin(phi) * Math.sin(theta),
        )
      },
      normal(u, v, target = new THREE.Vector3()) {
        return this.point(u, v, target).normalize()
      },
    }
  }

  // Cilindro deformado: radio modulado a lo largo de la altura (forma de torso).
  const R = params.radius
  const H = params.height
  const bulge = params.bulge
  const surf: ParametricSurface = {
    point(u, v, target = new THREE.Vector3()) {
      const theta = u * Math.PI * 2
      const y = (v - 0.5) * H
      // perfil: mas ancho al centro, mas angosto arriba/abajo.
      const profile =
        1 + bulge * Math.sin(v * Math.PI) - bulge * 0.4 * Math.cos(v * Math.PI * 2)
      const r = R * profile
      return target.set(r * Math.cos(theta), y, r * Math.sin(theta))
    },
    normal(u, v, target = new THREE.Vector3()) {
      return finiteDifferenceNormal(this, u, v, target)
    },
  }
  return surf
}

/** Malla renderizable de la superficie para mostrarla en el viewport. */
export function surfaceToGeometry(
  surface: ParametricSurface,
  segU = 96,
  segV = 64,
): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()

  for (let iv = 0; iv <= segV; iv++) {
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU
      const v = iv / segV
      surface.point(u, v, p)
      surface.normal(u, v, n)
      positions.push(p.x, p.y, p.z)
      normals.push(n.x, n.y, n.z)
      uvs.push(u, v)
    }
  }
  const row = segU + 1
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * row + iu
      const b = a + 1
      const c = a + row
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(indices)
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

/** Tipos compartidos por los modulos de geometria (funciones puras). */

/** Punto 2D. Se usa para perfiles de seccion y paths de corte. */
export type Vec2 = readonly [x: number, y: number]

/** Punto 3D plano (para interop con Three sin acoplar el modulo puro a Three). */
export type Vec3 = readonly [x: number, y: number, z: number]

/**
 * Funcion de escalado a lo largo de la curva guia.
 * Recibe t en [0,1] (0 = inicio de la espina, 1 = fin) y devuelve un factor
 * de escala >= 0 aplicado al perfil en ese punto.
 */
export type ScaleFn = (t: number) => number

/** Malla en formato crudo, independiente de Three (comoda para tests). */
export interface RawMesh {
  /** [x,y,z, x,y,z, ...] en unidades de Three.js. */
  positions: Float32Array
  /** Indices de triangulos. */
  indices: Uint32Array
}

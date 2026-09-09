/**
 * Layout raiz: barra lateral de parametros + viewport 3D.
 * La geometria se deriva del estado con funciones puras y se memoiza aca (una
 * sola vez), para compartirla entre el panel (stats, export) y la escena.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import './App.css'
import { Viewport } from './scene/Viewport'
import { LoftScene } from './components/LoftScene'
import { FieldScene } from './components/FieldScene'
import { LoftPanel } from './components/LoftPanel'
import { FieldPanel } from './components/FieldPanel'
import { useAppStore } from './state/store'
import { buildProfile } from './geometry/profile'
import { loftProfile } from './geometry/loft'
import { makeScaleFn } from './geometry/scaleProfiles'
import { createSurface, surfaceToGeometry } from './geometry/surfaces'
import { sampleSurface } from './geometry/sampler'

export default function App() {
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)
  const reset = useAppStore((s) => s.reset)

  const loft = useLoft()
  const field = useField()

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="brand">
          <p className="eyebrow">fabricacion digital · moda</p>
          <h1>Plataforma parametrica textil</h1>
          <div className="seg mode">
            <button
              type="button"
              className={mode === 'loft' ? 'active' : ''}
              onClick={() => setMode('loft')}
            >
              1 · Volumen
            </button>
            <button
              type="button"
              className={mode === 'field' ? 'active' : ''}
              onClick={() => setMode('field')}
            >
              2 · Atractores
            </button>
          </div>
          <button type="button" className="ghost" onClick={reset}>
            Restablecer todo
          </button>
        </header>

        {mode === 'loft' ? (
          <LoftPanel loft={loft.result} />
        ) : (
          <FieldPanel instanceCount={field.instances.length} />
        )}
      </aside>

      <main className="viewport">
        <Viewport>
          {mode === 'loft' ? (
            <LoftScene geometry={loft.result.geometry} curve={loft.curve} />
          ) : (
            <FieldScene
              surfaceGeometry={field.surfaceGeometry}
              instances={field.instances}
            />
          )}
        </Viewport>
        <p className="note">
          {mode === 'loft'
            ? 'Perfil 2D barrido a lo largo de la curva guia con escalado variable. 1 u = 1 cm.'
            : 'Instancias sobre la superficie con densidad, escala y orientacion segun el campo.'}
        </p>
      </main>
    </div>
  )
}

function useLoft() {
  const profile = useAppStore((s) => s.profile)
  const spine = useAppStore((s) => s.spine)
  const scalePreset = useAppStore((s) => s.scalePreset)
  const scale = useAppStore((s) => s.scale)
  const loftOpts = useAppStore((s) => s.loft)

  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        spine.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
        false,
        'catmullrom',
        0.5,
      ),
    [spine],
  )

  const result = useMemo(() => {
    const prof = buildProfile(profile)
    const scaleFn = makeScaleFn(scalePreset, scale)
    return loftProfile(prof, curve, scaleFn, loftOpts)
  }, [profile, curve, scalePreset, scale, loftOpts])

  useDisposePrevious(result.geometry)
  return { curve, result }
}

/** Libera la BufferGeometry anterior cuando el memo produce una nueva. */
function useDisposePrevious(geometry: THREE.BufferGeometry) {
  const prev = useRef<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    if (prev.current && prev.current !== geometry) prev.current.dispose()
    prev.current = geometry
  }, [geometry])
  useEffect(() => () => prev.current?.dispose(), [])
}

function useField() {
  const surfaceId = useAppStore((s) => s.surfaceId)
  const surfaceParams = useAppStore((s) => s.surface)
  const attractors = useAppStore((s) => s.attractors)
  const sampler = useAppStore((s) => s.sampler)
  const combine = useAppStore((s) => s.combine)

  const surface = useMemo(
    () => createSurface(surfaceId, surfaceParams),
    [surfaceId, surfaceParams],
  )
  const surfaceGeometry = useMemo(() => surfaceToGeometry(surface), [surface])
  useDisposePrevious(surfaceGeometry)
  const instances = useMemo(
    () => sampleSurface(surface, attractors, { ...sampler, combine }),
    [surface, attractors, sampler, combine],
  )
  return { surfaceGeometry, instances }
}

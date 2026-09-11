/**
 * Layout raiz: barra lateral de parametros + viewport 3D.
 * La geometria se deriva del estado con funciones puras y se memoiza aca (una
 * sola vez), compartida entre el panel (stats, export) y la escena.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import './App.css'
import { Viewport } from './scene/Viewport'
import { SpikeFieldScene } from './components/SpikeFieldScene'
import { SpikeFieldPanel } from './components/SpikeFieldPanel'
import { useAppStore } from './state/store'
import { buildSpikeField } from './geometry/spikeField'

export default function App() {
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)
  const reset = useAppStore((s) => s.reset)
  const planeSize = useAppStore((s) => s.field.planeSize)

  const spikes = useSpikeField()

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="brand">
          <p className="eyebrow">fabricacion digital · moda</p>
          <h1>Plataforma parametrica textil</h1>
          <div className="seg mode">
            <button
              type="button"
              className={mode === 'volume' ? 'active' : ''}
              onClick={() => setMode('volume')}
            >
              Volumen (3D)
            </button>
            <button
              type="button"
              className={mode === 'laser' ? 'active' : ''}
              onClick={() => setMode('laser')}
            >
              Corte laser
            </button>
          </div>
          <button type="button" className="ghost" onClick={reset}>
            Restablecer todo
          </button>
        </header>

        {mode === 'volume' ? (
          <SpikeFieldPanel result={spikes} />
        ) : (
          <div className="panel">
            <section>
              <h3>Corte laser — proxima entrega</h3>
              <p className="hint">
                Este modo trabajara solo desde el vector: cortes parametricos con
                distintas familias de geometria (huella de las puas, retícula auxetica,
                escamas) y export SVG/DXF.
              </p>
            </section>
          </div>
        )}
      </aside>

      <main className="viewport">
        <Viewport>
          {mode === 'volume' && (
            <SpikeFieldScene geometry={spikes.geometry} planeSize={planeSize} />
          )}
        </Viewport>
        <p className="note">
          {mode === 'volume'
            ? 'Puas solidas y autosoportadas que emergen del plano (base de tela), sin solape entre si. Altura, radios, inclinacion y densidad segun el mapa de atractores. 1 u = 1 cm.'
            : 'Modo de corte laser en preparacion.'}
        </p>
      </main>
    </div>
  )
}

function useSpikeField() {
  const field = useAppStore((s) => s.field)
  const attractors = useAppStore((s) => s.attractors)

  const result = useMemo(() => buildSpikeField(attractors, field), [attractors, field])
  useDisposePrevious(result.geometry)
  return result
}

/** Libera la BufferGeometry anterior cuando el memo produce una nueva. */
function useDisposePrevious(geometry: THREE.BufferGeometry | null) {
  const prev = useRef<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    if (prev.current && prev.current !== geometry) prev.current.dispose()
    prev.current = geometry
  }, [geometry])
  useEffect(() => () => prev.current?.dispose(), [])
}

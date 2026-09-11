/**
 * Seccion de panel para gestionar un set de atractores: boton para agregar,
 * lista, y sliders del seleccionado. Sin acoplar a un store en particular
 * (recibe todo por props) para reusarse en cualquier modo (Volumen, Ondas, ...).
 */
import { ParamSlider } from './ParamSlider'
import { ATTRACTOR_UI_PARAMS, FALLOFF_LABELS } from '../geometry/attractionField'
import type { Attractor, FalloffType } from '../geometry/attractionField'

interface AttractorEditorProps {
  attractors: readonly Attractor[]
  selectedId: string | null
  /** Lado del panel: se usa para dispersar la posicion inicial de uno nuevo. */
  planeSize: number
  onAdd: (position: [number, number, number]) => void
  onSelect: (id: string) => void
  onUpdate: (id: string, patch: Partial<Omit<Attractor, 'id'>>) => void
  onRemove: (id: string) => void
}

export function AttractorEditor({
  attractors,
  selectedId,
  planeSize,
  onAdd,
  onSelect,
  onUpdate,
  onRemove,
}: AttractorEditorProps) {
  const selected = attractors.find((a) => a.id === selectedId)

  // posicion aleatoria dentro del panel: si se agregan varios de una, no
  // quedan apilados exactamente uno sobre el otro. Se ajustan despues
  // arrastrando el gizmo.
  const addRandom = () => {
    const half = planeSize * 0.3
    onAdd([
      (Math.random() * 2 - 1) * half,
      3 + Math.random() * 2,
      (Math.random() * 2 - 1) * half,
    ])
  }

  return (
    <section>
      <h3>Atractores ({attractors.length})</h3>
      <p className="hint">
        Clic en una esfera roja para seleccionarla y arrastrarla con el gizmo (su altura
        tambien influye en el campo).
      </p>
      <button type="button" onClick={addRandom}>
        + Agregar atractor
      </button>
      <ul className="attractor-list">
        {attractors.map((a) => (
          <li key={a.id} className={a.id === selectedId ? 'active' : ''}>
            <button type="button" className="link" onClick={() => onSelect(a.id)}>
              {a.id.slice(-5)} · r{a.radius.toFixed(1)} · {FALLOFF_LABELS[a.falloff]}
            </button>
            <button type="button" className="del" onClick={() => onRemove(a.id)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="sub">
          <h4>Atractor {selected.id.slice(-5)}</h4>
          {ATTRACTOR_UI_PARAMS.map((p) => (
            <ParamSlider
              key={p.key}
              param={p}
              value={p.key === 'radius' ? selected.radius : selected.strength}
              onChange={(v) =>
                onUpdate(
                  selected.id,
                  p.key === 'radius' ? { radius: v } : { strength: v },
                )
              }
            />
          ))}
          <label className="param-label">Caida</label>
          <div className="seg">
            {(Object.keys(FALLOFF_LABELS) as FalloffType[]).map((f) => (
              <button
                key={f}
                type="button"
                className={selected.falloff === f ? 'active' : ''}
                onClick={() => onUpdate(selected.id, { falloff: f })}
              >
                {FALLOFF_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

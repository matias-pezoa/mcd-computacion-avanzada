/** Panel de parametros de la Fase 2 (mapas de atraccion + instanciado). */
import { useAppStore } from '../state/store'
import { ParamSlider } from './ParamSlider'
import { SAMPLER_UI_PARAMS } from '../geometry/sampler'
import type { SamplerParams } from '../geometry/sampler'
import { ATTRACTOR_UI_PARAMS, FALLOFF_LABELS } from '../geometry/attractionField'
import type { FalloffType } from '../geometry/attractionField'
import type { SurfaceParams } from '../geometry/surfaces'

interface FieldPanelProps {
  instanceCount: number
}

const SURFACE_UI_PARAMS = [
  { key: 'radius', label: 'Radio', min: 2, max: 14, step: 0.1, default: 6, unit: 'u3d' },
  {
    key: 'height',
    label: 'Altura',
    min: 4,
    max: 40,
    step: 0.5,
    default: 16,
    unit: 'u3d',
  },
  {
    key: 'bulge',
    label: 'Deformacion (torso)',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.35,
    unit: 'frac',
  },
] as const

export function FieldPanel({ instanceCount }: FieldPanelProps) {
  const surfaceId = useAppStore((s) => s.surfaceId)
  const setSurfaceId = useAppStore((s) => s.setSurfaceId)
  const surface = useAppStore((s) => s.surface)
  const setSurfaceParam = useAppStore((s) => s.setSurfaceParam)
  const sampler = useAppStore((s) => s.sampler)
  const setSamplerParam = useAppStore((s) => s.setSamplerParam)
  const combine = useAppStore((s) => s.combine)
  const setCombine = useAppStore((s) => s.setCombine)
  const attractors = useAppStore((s) => s.attractors)
  const selectedId = useAppStore((s) => s.selectedAttractorId)
  const selectAttractor = useAppStore((s) => s.selectAttractor)
  const updateAttractor = useAppStore((s) => s.updateAttractor)
  const removeAttractor = useAppStore((s) => s.removeAttractor)

  const selected = attractors.find((a) => a.id === selectedId)

  return (
    <div className="panel">
      <section>
        <h3>Superficie de prueba</h3>
        <div className="seg">
          <button
            type="button"
            className={surfaceId === 'deformedCylinder' ? 'active' : ''}
            onClick={() => setSurfaceId('deformedCylinder')}
          >
            Cilindro (torso)
          </button>
          <button
            type="button"
            className={surfaceId === 'sphere' ? 'active' : ''}
            onClick={() => setSurfaceId('sphere')}
          >
            Esfera
          </button>
        </div>
        {SURFACE_UI_PARAMS.map((p) => (
          <ParamSlider
            key={p.key}
            param={p}
            value={surface[p.key as keyof SurfaceParams]}
            onChange={(v) => setSurfaceParam(p.key as keyof SurfaceParams, v)}
          />
        ))}
      </section>

      <section>
        <h3>Atractores ({attractors.length})</h3>
        <p className="hint">
          Clic en la superficie para agregar un atractor. Clic en una esfera roja para
          seleccionarla y arrastrarla.
        </p>
        <ul className="attractor-list">
          {attractors.map((a) => (
            <li key={a.id} className={a.id === selectedId ? 'active' : ''}>
              <button
                type="button"
                className="link"
                onClick={() => selectAttractor(a.id)}
              >
                {a.id.slice(-5)} · r{a.radius.toFixed(1)} · {FALLOFF_LABELS[a.falloff]}
              </button>
              <button type="button" className="del" onClick={() => removeAttractor(a.id)}>
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
                  updateAttractor(
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
                  onClick={() => updateAttractor(selected.id, { falloff: f })}
                >
                  {FALLOFF_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <h3>Combinacion del campo</h3>
        <div className="seg">
          <button
            type="button"
            className={combine === 'max' ? 'active' : ''}
            onClick={() => setCombine('max')}
          >
            Maximo
          </button>
          <button
            type="button"
            className={combine === 'sum' ? 'active' : ''}
            onClick={() => setCombine('sum')}
          >
            Suma
          </button>
        </div>
      </section>

      <section>
        <h3>Instanciado</h3>
        {SAMPLER_UI_PARAMS.map((p) => (
          <ParamSlider
            key={p.key}
            param={p}
            value={sampler[p.key as keyof SamplerParams] as number}
            onChange={(v) => setSamplerParam(p.key as keyof SamplerParams, v)}
          />
        ))}
        <dl className="stats">
          <div>
            <dt>Instancias colocadas</dt>
            <dd>{instanceCount}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

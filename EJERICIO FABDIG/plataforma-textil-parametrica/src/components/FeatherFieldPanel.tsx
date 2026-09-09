/** Panel del modo Volumen: campo de plumas desde un plano. */
import * as THREE from 'three'
import { useAppStore } from '../state/store'
import type { FieldNumericKey } from '../state/store'
import { ParamSlider } from './ParamSlider'
import { PROFILE_UI_PARAMS } from '../geometry/profile'
import type { ProfileParams } from '../geometry/profile'
import { FIELD_UI_PARAMS, mergeForExport } from '../geometry/featherField'
import type { FeatherFieldResult } from '../geometry/featherField'
import { QUILL_UI_PARAMS } from '../geometry/quill'
import { ATTRACTOR_UI_PARAMS, FALLOFF_LABELS } from '../geometry/attractionField'
import type { FalloffType } from '../geometry/attractionField'
import { downloadStl } from '../io/exportSTL'
import { threeToMm } from '../utils/units'

interface FeatherFieldPanelProps {
  result: FeatherFieldResult
}

const pick = (keys: string[]) => (p: { key: string }) => keys.includes(p.key)

export function FeatherFieldPanel({ result }: FeatherFieldPanelProps) {
  const field = useAppStore((s) => s.field)
  const setFieldParam = useAppStore((s) => s.setFieldParam)
  const setProfileParam = useAppStore((s) => s.setProfileParam)
  const toggleAlignToField = useAppStore((s) => s.toggleAlignToField)
  const toggleRib = useAppStore((s) => s.toggleRib)
  const combine = useAppStore((s) => s.field.combine)
  const setCombine = useAppStore((s) => s.setCombine)

  const attractors = useAppStore((s) => s.attractors)
  const selectedId = useAppStore((s) => s.selectedAttractorId)
  const selectAttractor = useAppStore((s) => s.selectAttractor)
  const updateAttractor = useAppStore((s) => s.updateAttractor)
  const removeAttractor = useAppStore((s) => s.removeAttractor)
  const selected = attractors.find((a) => a.id === selectedId)

  const set = (key: FieldNumericKey) => (v: number) => setFieldParam(key, v)

  const sizeMm = result.bounds.isEmpty()
    ? [0, 0, 0]
    : new THREE.Vector3().subVectors(result.bounds.max, result.bounds.min).toArray().map(threeToMm)

  return (
    <div className="panel">
      <section>
        <h3>Base y distribucion</h3>
        {FIELD_UI_PARAMS.filter(
          pick(['planeSize', 'gridU', 'gridV', 'densityMin', 'densityMax', 'jitter', 'maxCount']),
        ).map((p) => (
          <ParamSlider
            key={p.key}
            param={p}
            value={field[p.key as FieldNumericKey] as number}
            onChange={set(p.key as FieldNumericKey)}
          />
        ))}
        <div className="seg">
          <button
            type="button"
            className={combine === 'max' ? 'active' : ''}
            onClick={() => setCombine('max')}
          >
            Campo: maximo
          </button>
          <button
            type="button"
            className={combine === 'sum' ? 'active' : ''}
            onClick={() => setCombine('sum')}
          >
            Campo: suma
          </button>
        </div>
      </section>

      <section>
        <h3>Forma de la pluma</h3>
        {QUILL_UI_PARAMS.map((p) => (
          <ParamSlider
            key={p.key}
            param={p}
            value={field[p.key as FieldNumericKey] as number}
            onChange={set(p.key as FieldNumericKey)}
          />
        ))}
        {FIELD_UI_PARAMS.filter(pick(['widthBase', 'widthField', 'taper'])).map((p) => (
          <ParamSlider
            key={p.key}
            param={p}
            value={field[p.key as FieldNumericKey] as number}
            onChange={set(p.key as FieldNumericKey)}
          />
        ))}
        <label className="check">
          <input type="checkbox" checked={field.alignToField} onChange={toggleAlignToField} />
          La pluma se arquea siguiendo el gradiente del campo
        </label>
      </section>

      <section>
        <h3>Perfil 2D (seccion de la pala)</h3>
        {PROFILE_UI_PARAMS.map((p) => (
          <ParamSlider
            key={p.key}
            param={p}
            value={field.profile[p.key as keyof ProfileParams]}
            onChange={(v) => setProfileParam(p.key as keyof ProfileParams, v)}
          />
        ))}
        <label className="check">
          <input type="checkbox" checked={field.rib} onChange={toggleRib} />
          Nervadura central
        </label>
        {field.rib &&
          FIELD_UI_PARAMS.filter(pick(['ribRadius'])).map((p) => (
            <ParamSlider
              key={p.key}
              param={p}
              value={field[p.key as FieldNumericKey] as number}
              onChange={set(p.key as FieldNumericKey)}
            />
          ))}
      </section>

      <section>
        <h3>Atractores ({attractors.length})</h3>
        <p className="hint">
          Clic en la base (el plano) para agregar un atractor. Clic en una esfera roja
          para seleccionarla y arrastrarla; su altura tambien influye.
        </p>
        <ul className="attractor-list">
          {attractors.map((a) => (
            <li key={a.id} className={a.id === selectedId ? 'active' : ''}>
              <button type="button" className="link" onClick={() => selectAttractor(a.id)}>
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
                  updateAttractor(selected.id, p.key === 'radius' ? { radius: v } : { strength: v })
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
        <h3>Exportar</h3>
        <dl className="stats">
          <div>
            <dt>Plumas</dt>
            <dd>{result.count}</dd>
          </div>
          <div>
            <dt>Triangulos</dt>
            <dd>{result.triangleCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Dimensiones</dt>
            <dd>{sizeMm.map((n) => n.toFixed(0)).join(' x ')} mm</dd>
          </div>
        </dl>
        <button
          type="button"
          className="primary"
          disabled={result.count === 0}
          onClick={() => {
            const geo = mergeForExport(result)
            downloadStl(geo, { filename: 'campo-plumas' })
            geo.dispose()
          }}
        >
          Descargar STL (mm)
        </button>
      </section>
    </div>
  )
}

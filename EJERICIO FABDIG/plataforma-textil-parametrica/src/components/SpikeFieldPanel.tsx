/** Panel del modo Volumen: campo de puas solidas desde un plano. */
import * as THREE from 'three'
import { useAppStore } from '../state/store'
import type { FieldNumericKey } from '../state/store'
import { ParamSlider } from './ParamSlider'
import { FIELD_UI_PARAMS } from '../geometry/spikeField'
import type { SpikeFieldResult } from '../geometry/spikeField'
import {
  SPIKE_UI_PARAMS,
  MIN_ROOT_RADIUS_MM,
  MIN_TIP_RADIUS_MM,
  SAFE_OVERHANG_DEG,
} from '../geometry/spike'
import { ATTRACTOR_UI_PARAMS, FALLOFF_LABELS } from '../geometry/attractionField'
import type { FalloffType } from '../geometry/attractionField'
import { downloadStl } from '../io/exportSTL'
import { threeToMm } from '../utils/units'

interface SpikeFieldPanelProps {
  result: SpikeFieldResult
}

const pick = (keys: string[]) => (p: { key: string }) => keys.includes(p.key)

export function SpikeFieldPanel({ result }: SpikeFieldPanelProps) {
  const field = useAppStore((s) => s.field)
  const setFieldParam = useAppStore((s) => s.setFieldParam)
  const combine = useAppStore((s) => s.field.combine)
  const setCombine = useAppStore((s) => s.setCombine)
  const toggleAlignToField = useAppStore((s) => s.toggleAlignToField)

  const attractors = useAppStore((s) => s.attractors)
  const selectedId = useAppStore((s) => s.selectedAttractorId)
  const addAttractor = useAppStore((s) => s.addAttractor)
  const selectAttractor = useAppStore((s) => s.selectAttractor)
  const updateAttractor = useAppStore((s) => s.updateAttractor)
  const removeAttractor = useAppStore((s) => s.removeAttractor)
  const selected = attractors.find((a) => a.id === selectedId)

  // posicion aleatoria dentro del panel: si se agregan varios de una, no
  // quedan apilados exactamente uno sobre el otro. Se ajustan despues
  // arrastrando el gizmo.
  const addRandomAttractor = (planeSize: number) => {
    const half = planeSize * 0.3
    addAttractor([
      (Math.random() * 2 - 1) * half,
      3 + Math.random() * 2,
      (Math.random() * 2 - 1) * half,
    ])
  }

  const set = (key: FieldNumericKey) => (v: number) => setFieldParam(key, v)

  const sizeMm = result.bounds.isEmpty()
    ? [0, 0, 0]
    : new THREE.Vector3()
        .subVectors(result.bounds.max, result.bounds.min)
        .toArray()
        .map(threeToMm)

  return (
    <div className="panel">
      <section>
        <h3>Factibilidad de impresion (FDM)</h3>
        <p className="hint">
          Los limites de abajo son pisos/techos de fabricacion: ningun slider puede
          generar una pua no imprimible. Vuelo por capa ≤ {SAFE_OVERHANG_DEG}°, radio de
          base ≥ {MIN_ROOT_RADIUS_MM}mm (adherencia a la tela), radio de punta ≥{' '}
          {MIN_TIP_RADIUS_MM}mm (ancho de una linea de extrusion). Las puas nunca se
          solapan entre si.
        </p>
        <p className="hint">
          Ademas, la inclinacion se recorta SEGUNDA VEZ segun la altura y el ancho de la
          propia base: una pua alta y angosta hace palanca sobre su punto de apoyo y puede
          despegarlo de la cama/tela aunque el vuelo por capa sea valido, asi que se
          inclina menos (o nada) automaticamente. Abajo se cuenta cuantas puas quedaron
          asi limitadas.
        </p>
      </section>

      <section>
        <h3>Base y distribucion</h3>
        {FIELD_UI_PARAMS.filter(
          pick([
            'planeSize',
            'gridU',
            'gridV',
            'densityMin',
            'densityMax',
            'jitter',
            'maxCount',
          ]),
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
        <h3>Forma de la pua</h3>
        {SPIKE_UI_PARAMS.map((p) => (
          <ParamSlider
            key={p.key}
            param={p}
            value={field[p.key as FieldNumericKey] as number}
            onChange={set(p.key as FieldNumericKey)}
          />
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={field.alignToField}
            onChange={toggleAlignToField}
          />
          La pua se inclina alejandose del atractor
        </label>
      </section>

      <section>
        <h3>Atractores ({attractors.length})</h3>
        <p className="hint">
          Clic en una esfera roja para seleccionarla y arrastrarla con el gizmo (su altura
          tambien influye en el campo).
        </p>
        <button type="button" onClick={() => addRandomAttractor(field.planeSize)}>
          + Agregar atractor
        </button>
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
        <h3>Exportar</h3>
        <dl className="stats">
          <div>
            <dt>Puas colocadas</dt>
            <dd>{result.count}</dd>
          </div>
          <div>
            <dt>Descartadas por solape</dt>
            <dd>{result.rejectedByOverlap}</dd>
          </div>
          <div>
            <dt>Limitadas por estabilidad de base</dt>
            <dd>{result.limitedByStabilityCount}</dd>
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
          onClick={() => downloadStl(result.geometry, { filename: 'campo-de-puas' })}
        >
          Descargar STL (mm)
        </button>
      </section>
    </div>
  )
}

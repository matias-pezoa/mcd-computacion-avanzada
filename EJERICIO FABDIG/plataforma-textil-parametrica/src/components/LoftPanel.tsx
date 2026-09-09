/** Panel de parametros de la Fase 1 (volumen parametrico). */
import * as THREE from 'three'
import { useAppStore } from '../state/store'
import { ParamSlider } from './ParamSlider'
import { PROFILE_UI_PARAMS } from '../geometry/profile'
import type { ProfileParams } from '../geometry/profile'
import { SCALE_PRESETS, SCALE_UI_PARAMS } from '../geometry/scaleProfiles'
import type { ScaleParams, ScalePresetId } from '../geometry/scaleProfiles'
import type { LoftResult } from '../geometry/loft'
import { downloadStl } from '../io/exportSTL'
import { threeToMm } from '../utils/units'

interface LoftPanelProps {
  loft: LoftResult
}

/** Sliders relevantes por preset de escalado (evita mostrar params inertes). */
const SCALE_KEYS_BY_PRESET: Record<ScalePresetId, readonly string[]> = {
  constant: ['peak'],
  linear: ['start', 'end'],
  bell: ['start', 'peak', 'peakPos', 'bellWidth'],
}

export function LoftPanel({ loft }: LoftPanelProps) {
  const profile = useAppStore((s) => s.profile)
  const setProfileParam = useAppStore((s) => s.setProfileParam)
  const scalePreset = useAppStore((s) => s.scalePreset)
  const setScalePreset = useAppStore((s) => s.setScalePreset)
  const scale = useAppStore((s) => s.scale)
  const setScaleParam = useAppStore((s) => s.setScaleParam)
  const loftOpts = useAppStore((s) => s.loft)
  const setLoftOption = useAppStore((s) => s.setLoftOption)
  const spine = useAppStore((s) => s.spine)
  const addSpinePoint = useAppStore((s) => s.addSpinePoint)
  const removeSpinePoint = useAppStore((s) => s.removeSpinePoint)

  const bbox = loft.geometry.boundingBox
  const sizeMm = bbox
    ? new THREE.Vector3().subVectors(bbox.max, bbox.min).toArray().map(threeToMm)
    : [0, 0, 0]

  const visibleScaleKeys = SCALE_KEYS_BY_PRESET[scalePreset]

  return (
    <div className="panel">
      <section>
        <h3>Perfil 2D (seccion)</h3>
        {PROFILE_UI_PARAMS.map((p) => (
          <ParamSlider
            key={p.key}
            param={p}
            value={profile[p.key as keyof ProfileParams]}
            onChange={(v) => setProfileParam(p.key as keyof ProfileParams, v)}
          />
        ))}
      </section>

      <section>
        <h3>Curva guia (espina)</h3>
        <p className="hint">
          Clic en un punto del viewport para seleccionarlo, luego arrastra los ejes para
          moverlo. {spine.length} puntos de control.
        </p>
        <div className="row">
          <button type="button" onClick={addSpinePoint}>
            + Agregar punto
          </button>
          <button
            type="button"
            onClick={() => removeSpinePoint(spine.length - 1)}
            disabled={spine.length <= 2}
          >
            - Quitar ultimo
          </button>
        </div>
      </section>

      <section>
        <h3>Escalado a lo largo de la curva</h3>
        <div className="seg">
          {SCALE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={preset.id === scalePreset ? 'active' : ''}
              onClick={() => setScalePreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {SCALE_UI_PARAMS.filter((p) => visibleScaleKeys.includes(p.key)).map((p) => (
          <ParamSlider
            key={p.key}
            param={p}
            value={scale[p.key as keyof ScaleParams]}
            onChange={(v) => setScaleParam(p.key as keyof ScaleParams, v)}
          />
        ))}
      </section>

      <section>
        <h3>Malla</h3>
        <ParamSlider
          param={{
            key: 'sections',
            label: 'Secciones a lo largo',
            min: 4,
            max: 400,
            step: 1,
            default: 96,
            unit: '-',
          }}
          value={loftOpts.sections}
          onChange={(v) => setLoftOption('sections', v)}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={loftOpts.caps}
            onChange={(e) => setLoftOption('caps', e.target.checked)}
          />
          Cerrar extremos con tapas
        </label>
      </section>

      <section>
        <h3>Exportar</h3>
        <dl className="stats">
          <div>
            <dt>Dimensiones</dt>
            <dd>{sizeMm.map((n) => n.toFixed(1)).join(' x ')} mm</dd>
          </div>
          <div>
            <dt>Secciones / pts perfil</dt>
            <dd>
              {loft.sectionCount} / {loft.profilePointCount}
            </dd>
          </div>
          <div>
            <dt>Secciones colapsadas</dt>
            <dd>{loft.collapsedSections.length}</dd>
          </div>
          <div>
            <dt>Triangulos degenerados descartados</dt>
            <dd>{loft.droppedTriangles}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="primary"
          onClick={() => downloadStl(loft.geometry, { filename: 'pluma-parametrica' })}
        >
          Descargar STL (mm)
        </button>
      </section>
    </div>
  )
}

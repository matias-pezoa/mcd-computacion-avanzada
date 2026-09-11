/** Panel del modo Ondas: panel corrugado (costillas trigonometricas) desde un plano. */
import * as THREE from 'three'
import { useAppStore } from '../state/store'
import type { WaveNumericKey } from '../state/store'
import { ParamSlider } from './ParamSlider'
import { AttractorEditor } from './AttractorEditor'
import {
  WAVE_UI_PARAMS,
  MIN_BASE_THICKNESS_MM,
  MIN_WAVELENGTH_MM,
} from '../geometry/waveField'
import type { WaveFieldResult } from '../geometry/waveField'
import { SAFE_OVERHANG_DEG } from '../geometry/printability'
import { downloadStl } from '../io/exportSTL'
import { threeToMm } from '../utils/units'

interface WaveFieldPanelProps {
  result: WaveFieldResult
}

export function WaveFieldPanel({ result }: WaveFieldPanelProps) {
  const wave = useAppStore((s) => s.wave)
  const setWaveParam = useAppStore((s) => s.setWaveParam)
  const setWaveCombine = useAppStore((s) => s.setWaveCombine)

  const attractors = useAppStore((s) => s.waveAttractors)
  const selectedId = useAppStore((s) => s.selectedWaveAttractorId)
  const addAttractor = useAppStore((s) => s.addWaveAttractor)
  const selectAttractor = useAppStore((s) => s.selectWaveAttractor)
  const updateAttractor = useAppStore((s) => s.updateWaveAttractor)
  const removeAttractor = useAppStore((s) => s.removeWaveAttractor)

  const set = (key: WaveNumericKey) => (v: number) => setWaveParam(key, v)

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
          El panel es un solido: base plana de espesor minimo (≥ {MIN_BASE_THICKNESS_MM}
          mm, siempre horizontal y apoyada de punta a punta) con costillas talladas
          encima. La amplitud de las costillas se recorta automaticamente para que su
          pendiente nunca supere el vuelo autosoportado (≤ {SAFE_OVERHANG_DEG}° por
          defecto) — si el slider pide mas de lo seguro para esa longitud de onda, se
          aplica menos (se avisa abajo). Longitud de onda minima {MIN_WAVELENGTH_MM}mm.
        </p>
      </section>

      <section>
        <h3>Panel y ondas</h3>
        {WAVE_UI_PARAMS.map((p) => (
          <ParamSlider
            key={p.key}
            param={p}
            value={wave[p.key as WaveNumericKey] as number}
            onChange={set(p.key as WaveNumericKey)}
          />
        ))}
        <p className="hint">
          "Facetas por onda" baja (1-3) da costillas angulosas bien marcadas; alta (8+) da
          una onda suave.
        </p>
        <div className="seg">
          <button
            type="button"
            className={wave.combine === 'max' ? 'active' : ''}
            onClick={() => setWaveCombine('max')}
          >
            Campo: maximo
          </button>
          <button
            type="button"
            className={wave.combine === 'sum' ? 'active' : ''}
            onClick={() => setWaveCombine('sum')}
          >
            Campo: suma
          </button>
        </div>
      </section>

      <AttractorEditor
        attractors={attractors}
        selectedId={selectedId}
        planeSize={wave.planeSize}
        onAdd={addAttractor}
        onSelect={selectAttractor}
        onUpdate={updateAttractor}
        onRemove={removeAttractor}
      />

      <section>
        <h3>Exportar</h3>
        <dl className="stats">
          <div>
            <dt>Amplitud aplicada</dt>
            <dd>
              {result.appliedAmplitudeMm.toFixed(1)} mm
              {result.amplitudeLimited ? ' (recortada)' : ''}
            </dd>
          </div>
          <div>
            <dt>Segmentos por eje</dt>
            <dd>{result.segmentsPerAxis}</dd>
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
          onClick={() => downloadStl(result.geometry, { filename: 'panel-de-ondas' })}
        >
          Descargar STL (mm)
        </button>
      </section>
    </div>
  )
}

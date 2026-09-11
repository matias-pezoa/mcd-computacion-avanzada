/**
 * Escena del modo Ondas: base de tela (plano) + panel corrugado (costillas
 * trigonometricas) + gizmos de atractores editables en el viewport.
 *
 * El material usa `flatShading` para que la malla (que ya viene con
 * resolucion baja respecto de la longitud de onda, ver waveField.ts) se lea
 * como facetas/costillas en vez de una onda suavizada; ademas se dibujan las
 * aristas de las facetas (`<Edges>`) para que las costillas se vean nitidas
 * sin depender del angulo de luz. El panel NO proyecta sombra sobre si mismo
 * (`castShadow` desactivado aca): una superficie corrugada continua auto-
 * sombreandose genera "shadow acne" (ruido periodico falso, no es la
 * geometria) con el mapa de sombras compartido del Viewport.
 */
import * as THREE from 'three'
import { Edges } from '@react-three/drei'
import { useAppStore } from '../state/store'
import { AttractorGizmos } from './AttractorGizmos'

interface WaveFieldSceneProps {
  geometry: THREE.BufferGeometry
  planeSize: number
}

export function WaveFieldScene({ geometry, planeSize }: WaveFieldSceneProps) {
  const attractors = useAppStore((s) => s.waveAttractors)
  const selectedId = useAppStore((s) => s.selectedWaveAttractorId)
  const selectAttractor = useAppStore((s) => s.selectWaveAttractor)
  const updateAttractor = useAppStore((s) => s.updateWaveAttractor)

  return (
    <group>
      {/* base de tela, apenas debajo del panel para que no compitan en el z-fight */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[planeSize, planeSize, 1, 1]} />
        <meshStandardMaterial color="#d8cdbf" roughness={0.95} metalness={0} />
      </mesh>
      <gridHelper
        args={[planeSize, Math.max(2, Math.round(planeSize / 2)), '#b9ab97', '#c7bca6']}
        position={[0, -0.008, 0]}
      />

      {hasVerts(geometry) && (
        <mesh geometry={geometry} receiveShadow>
          <meshStandardMaterial
            color="#dcd4c2"
            roughness={0.9}
            metalness={0}
            flatShading
            side={THREE.DoubleSide}
          />
          <Edges threshold={6} color="#8a7a5c" />
        </mesh>
      )}

      <AttractorGizmos
        attractors={attractors}
        selectedId={selectedId}
        onSelect={selectAttractor}
        onUpdate={(id, position) => updateAttractor(id, { position })}
      />
    </group>
  )
}

function hasVerts(g: THREE.BufferGeometry): boolean {
  const pos = g.getAttribute('position')
  return !!pos && pos.count > 0
}

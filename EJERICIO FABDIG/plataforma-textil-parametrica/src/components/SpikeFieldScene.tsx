/**
 * Escena del modo Volumen: base de tela (plano) + campo de puas solidas que
 * emergen de ella + gizmos de atractores editables en el viewport.
 */
import * as THREE from 'three'
import { useAppStore } from '../state/store'
import { AttractorGizmos } from './AttractorGizmos'

interface SpikeFieldSceneProps {
  geometry: THREE.BufferGeometry
  planeSize: number
}

export function SpikeFieldScene({ geometry, planeSize }: SpikeFieldSceneProps) {
  const attractors = useAppStore((s) => s.attractors)
  const selectedId = useAppStore((s) => s.selectedAttractorId)
  const selectAttractor = useAppStore((s) => s.selectAttractor)
  const updateAttractor = useAppStore((s) => s.updateAttractor)

  return (
    <group>
      {/* base de tela. Los atractores se agregan con el boton del panel, no
          con clic aca: el gizmo de TransformControls no es un objeto de R3F
          (no tiene onPointerDown propio), asi que un clic para arrastrarlo
          "atravesaba" hasta este plano y sumaba un atractor de mas cada vez
          que se intentaba mover uno existente. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[planeSize, planeSize, 1, 1]} />
        <meshStandardMaterial color="#d8cdbf" roughness={0.95} metalness={0} />
      </mesh>
      <gridHelper
        args={[planeSize, Math.max(2, Math.round(planeSize / 2)), '#b9ab97', '#c7bca6']}
        position={[0, 0.002, 0]}
      />

      {hasVerts(geometry) && (
        <mesh geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial color="#e7e2d6" roughness={0.45} metalness={0.05} />
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

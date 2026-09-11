/**
 * Escena del modo Volumen: base de tela (plano) + campo de puas solidas que
 * emergen de ella + gizmos de atractores editables en el viewport.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { TransformControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useAppStore } from '../state/store'
import type { Attractor } from '../geometry/attractionField'

interface SpikeFieldSceneProps {
  geometry: THREE.BufferGeometry
  planeSize: number
}

export function SpikeFieldScene({ geometry, planeSize }: SpikeFieldSceneProps) {
  const attractors = useAppStore((s) => s.attractors)
  const selectedId = useAppStore((s) => s.selectedAttractorId)
  const addAttractor = useAppStore((s) => s.addAttractor)
  const selectAttractor = useAppStore((s) => s.selectAttractor)
  const updateAttractor = useAppStore((s) => s.updateAttractor)

  const handleRefs = useRef<Record<string, THREE.Mesh | null>>({})
  const selected = attractors.find((a) => a.id === selectedId)
  const selectedObject = selected
    ? (handleRefs.current[selected.id] ?? undefined)
    : undefined

  return (
    <group>
      {/* base de tela */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (e.button !== 0) return
          e.stopPropagation()
          // click sobre el plano -> atractor un poco por encima
          addAttractor([e.point.x, 3, e.point.z])
        }}
      >
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

      {attractors.map((a) => (
        <AttractorGizmo
          key={a.id}
          attractor={a}
          selected={a.id === selectedId}
          meshRef={(el) => {
            handleRefs.current[a.id] = el
          }}
          onSelect={() => selectAttractor(a.id)}
        />
      ))}

      {selected && selectedObject && (
        <TransformControls
          object={selectedObject}
          mode="translate"
          size={0.7}
          onObjectChange={() => {
            const o = handleRefs.current[selected.id]
            if (o) {
              updateAttractor(selected.id, {
                position: new THREE.Vector3(o.position.x, o.position.y, o.position.z),
              })
            }
          }}
        />
      )}
    </group>
  )
}

function hasVerts(g: THREE.BufferGeometry): boolean {
  const pos = g.getAttribute('position')
  return !!pos && pos.count > 0
}

interface AttractorGizmoProps {
  attractor: Attractor
  selected: boolean
  meshRef: (el: THREE.Mesh | null) => void
  onSelect: () => void
}

function AttractorGizmo({ attractor, selected, meshRef, onSelect }: AttractorGizmoProps) {
  const pos: [number, number, number] = [
    attractor.position.x,
    attractor.position.y,
    attractor.position.z,
  ]
  // circulo de influencia proyectado sobre el plano (y = 0)
  const ring = useMemo(() => {
    const g = new THREE.RingGeometry(attractor.radius - 0.08, attractor.radius, 72)
    g.rotateX(-Math.PI / 2)
    return g
  }, [attractor.radius])
  useEffect(() => () => ring.dispose(), [ring])

  return (
    <group>
      <mesh
        ref={meshRef}
        position={pos}
        onPointerDown={(e) => {
          e.stopPropagation()
          onSelect()
        }}
      >
        <sphereGeometry args={[0.4, 20, 20]} />
        <meshStandardMaterial
          color={attractor.strength >= 0 ? '#ff5d73' : '#4f7cff'}
          emissive={selected ? '#5b1220' : '#180608'}
        />
      </mesh>
      <mesh geometry={ring} position={[pos[0], 0.004, pos[2]]}>
        <meshBasicMaterial
          color={selected ? '#ffd166' : '#ff5d73'}
          transparent
          opacity={selected ? 0.5 : 0.2}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

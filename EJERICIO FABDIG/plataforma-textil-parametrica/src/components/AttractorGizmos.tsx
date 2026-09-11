/**
 * Gizmos de atractores para el viewport: esferas arrastrables + circulo de
 * influencia + TransformControls del seleccionado. Sin acoplar a un store en
 * particular (recibe todo por props) para poder usarse en cualquier modo que
 * tenga su propio set de atractores (Volumen, Ondas, ...).
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { TransformControls } from '@react-three/drei'
import type { Attractor } from '../geometry/attractionField'

interface AttractorGizmosProps {
  attractors: readonly Attractor[]
  selectedId: string | null
  onSelect: (id: string) => void
  onUpdate: (id: string, position: THREE.Vector3) => void
}

export function AttractorGizmos({
  attractors,
  selectedId,
  onSelect,
  onUpdate,
}: AttractorGizmosProps) {
  const handleRefs = useRef<Record<string, THREE.Mesh | null>>({})
  const selected = attractors.find((a) => a.id === selectedId)
  const selectedObject = selected
    ? (handleRefs.current[selected.id] ?? undefined)
    : undefined

  return (
    <group>
      {attractors.map((a) => (
        <AttractorGizmo
          key={a.id}
          attractor={a}
          selected={a.id === selectedId}
          meshRef={(el) => {
            handleRefs.current[a.id] = el
          }}
          onSelect={() => onSelect(a.id)}
        />
      ))}

      {selected && selectedObject && (
        <TransformControls
          object={selectedObject}
          mode="translate"
          size={0.7}
          onObjectChange={() => {
            const o = handleRefs.current[selected.id]
            if (o)
              onUpdate(
                selected.id,
                new THREE.Vector3(o.position.x, o.position.y, o.position.z),
              )
          }}
        />
      )}
    </group>
  )
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

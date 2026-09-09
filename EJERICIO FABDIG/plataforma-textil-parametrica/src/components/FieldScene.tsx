/**
 * Escena de la Fase 2: superficie de prueba + instancias dirigidas por el
 * campo de atraccion + gizmos de atractores editables en el viewport.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { TransformControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useAppStore } from '../state/store'
import { instanceMatrix, type SurfaceInstance } from '../geometry/sampler'
import type { Attractor } from '../geometry/attractionField'

interface FieldSceneProps {
  surfaceGeometry: THREE.BufferGeometry
  instances: SurfaceInstance[]
}

export function FieldScene({ surfaceGeometry, instances }: FieldSceneProps) {
  const attractors = useAppStore((s) => s.attractors)
  const selectedId = useAppStore((s) => s.selectedAttractorId)
  const addAttractor = useAppStore((s) => s.addAttractor)
  const selectAttractor = useAppStore((s) => s.selectAttractor)
  const updateAttractor = useAppStore((s) => s.updateAttractor)

  // la surfaceGeometry la libera App (useDisposePrevious).
  const handleRefs = useRef<Record<string, THREE.Mesh | null>>({})
  const selected = attractors.find((a) => a.id === selectedId)
  const selectedObject = selected
    ? (handleRefs.current[selected.id] ?? undefined)
    : undefined

  return (
    <group>
      <mesh
        geometry={surfaceGeometry}
        receiveShadow
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (e.button !== 0) return
          e.stopPropagation()
          addAttractor([e.point.x, e.point.y, e.point.z])
        }}
      >
        <meshStandardMaterial
          color="#c9a98f"
          roughness={0.9}
          metalness={0}
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>

      <InstancedField instances={instances} />

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

function InstancedField({ instances }: { instances: SurfaceInstance[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => {
    const g = new THREE.ConeGeometry(0.16, 0.95, 6)
    g.translate(0, 0.47, 0) // base apoyada sobre la superficie
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const color = new THREE.Color()
    for (let i = 0; i < instances.length; i++) {
      instanceMatrix(instances[i], m)
      mesh.setMatrixAt(i, m)
      const f = instances[i].fieldValue
      color.setHSL(0.09 + 0.02 * f, 0.35 + 0.4 * f, 0.32 + 0.4 * f)
      mesh.setColorAt(i, color)
    }
    mesh.count = instances.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [instances])

  return (
    <instancedMesh
      key={instances.length}
      ref={ref}
      args={[geometry, undefined, Math.max(instances.length, 1)]}
      castShadow
      frustumCulled={false}
    >
      <meshStandardMaterial vertexColors roughness={0.5} metalness={0.05} />
    </instancedMesh>
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
      <mesh position={pos} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[attractor.radius - 0.06, attractor.radius, 64]} />
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

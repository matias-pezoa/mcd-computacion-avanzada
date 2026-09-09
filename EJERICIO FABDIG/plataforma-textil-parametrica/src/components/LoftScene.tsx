/**
 * Escena de la Fase 1: malla loft + edicion de la curva guia en el viewport.
 * La geometria se calcula fuera del Canvas (funcion pura) y llega por props.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
// nota: la BufferGeometry la libera App (useDisposePrevious); aca solo se renderiza.
import * as THREE from 'three'
import { Line, TransformControls } from '@react-three/drei'
import { useAppStore } from '../state/store'

interface LoftSceneProps {
  geometry: THREE.BufferGeometry
  curve: THREE.CatmullRomCurve3
}

export function LoftScene({ geometry, curve }: LoftSceneProps) {
  const spine = useAppStore((s) => s.spine)
  const setSpinePoint = useAppStore((s) => s.setSpinePoint)
  const [selected, setSelected] = useState<number | null>(null)

  const handleRefs = useRef<(THREE.Mesh | null)[]>([])
  const linePoints = useMemo(
    () => curve.getPoints(160).map((p) => p.toArray() as [number, number, number]),
    [curve],
  )

  // si se elimina un punto, limpiar la seleccion fuera de rango
  useEffect(() => {
    if (selected != null && selected >= spine.length) setSelected(null)
  }, [spine.length, selected])

  const selectedObject =
    selected != null ? (handleRefs.current[selected] ?? undefined) : undefined

  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color="#e8e2d5"
          roughness={0.55}
          metalness={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Line
        points={linePoints}
        color="#4f7cff"
        lineWidth={1.5}
        dashed
        dashSize={0.3}
        gapSize={0.15}
      />

      {spine.map((p, i) => (
        <mesh
          key={i}
          ref={(el) => {
            handleRefs.current[i] = el
          }}
          position={[p[0], p[1], p[2]]}
          onClick={(e) => {
            e.stopPropagation()
            setSelected(i)
          }}
        >
          <sphereGeometry args={[0.28, 20, 20]} />
          <meshStandardMaterial
            color={selected === i ? '#ffd166' : '#4f7cff'}
            emissive={selected === i ? '#7a5b12' : '#101a33'}
          />
        </mesh>
      ))}

      {selectedObject && selected != null && (
        <TransformControls
          object={selectedObject}
          mode="translate"
          size={0.7}
          onObjectChange={() => {
            const o = handleRefs.current[selected]
            if (o) setSpinePoint(selected, [o.position.x, o.position.y, o.position.z])
          }}
        />
      )}
    </group>
  )
}

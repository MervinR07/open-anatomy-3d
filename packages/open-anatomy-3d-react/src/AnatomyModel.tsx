import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { ANATOMY_BY_KEY, ANATOMY_STRUCTURES, modelUrl, type AnatomySex, type AnatomySystem } from 'open-anatomy-3d'

export type LayerVisibility = Record<AnatomySystem, boolean>

export interface ProjectedAnchor {
  key: string
  /** Screen position in CSS pixels, relative to the canvas. */
  x: number
  y: number
  /** False when the structure is behind the camera or its layer is hidden. */
  visible: boolean
}

export const DEFAULT_LAYERS: LayerVisibility = {
  skin: true, muscles: false, skeleton: true, joints: true, organs: true, vessels: true, nerves: true,
}

export interface AnatomyModelProps {
  sex: AnatomySex
  /** Which body systems are shown. Defaults to everything except muscles. */
  layers?: LayerVisibility
  /** Model URL. Defaults to the jsDelivr copy of the open-anatomy-3d package. */
  url?: string
  /** Structures to mark — tinted and gently pulsing. */
  highlightedKeys?: ReadonlySet<string>
  /** The structure under the pointer (controlled). */
  hoveredKey?: string | null
  onHover?: (key: string | null) => void
  onSelect?: (key: string) => void
  /** Structures whose screen position `onProject` should report every frame. */
  anchorKeys?: readonly string[]
  onProject?: (anchors: ProjectedAnchor[], width: number, height: number) => void
  /** Hover colour. */
  hoverColor?: THREE.ColorRepresentation
  /** Colour of highlighted structures. */
  highlightColor?: THREE.ColorRepresentation
}

// Translucent "medical illustration" skin: nearly clear where the surface
// faces the camera, denser at grazing angles, so the silhouette reads as a
// soft glass-like body with the organs clearly visible through it.
function makeSkinMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      uColor: { value: new THREE.Color('#e9b596') },
      uRim: { value: new THREE.Color('#d98c6a') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uRim;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float f = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
        float rim = pow(f, 2.2);
        vec3 col = mix(uColor, uRim, rim);
        float light = 0.75 + 0.25 * max(dot(normalize(vNormal), normalize(vec3(0.3, 0.6, 0.8))), 0.0);
        gl_FragColor = vec4(col * light, 0.07 + 0.5 * rim);
      }
    `,
  })
}

const SYSTEM_MATERIAL: Record<Exclude<AnatomySystem, 'skin'>, { color: string; opacity: number; roughness: number }> = {
  // Joint hotspots are invisible until hovered/highlighted.
  joints: { color: '#ff9a3c', opacity: 0, roughness: 0.4 },
  skeleton: { color: '#efe6d2', opacity: 0.55, roughness: 0.7 },
  muscles: { color: '#b5463d', opacity: 0.85, roughness: 0.6 },
  organs: { color: '#c96f5d', opacity: 1, roughness: 0.45 },
  vessels: { color: '#c0392b', opacity: 1, roughness: 0.35 },
  nerves: { color: '#f2c14e', opacity: 1, roughness: 0.5 },
}

// Organs beat bone when both are under the cursor — ribs sit in front of the
// heart and lungs, and nobody hovering the chest means "rib".
const PICK_PRIORITY: Record<AnatomySystem, number> = {
  joints: 4, organs: 3, muscles: 2, vessels: 1, nerves: 1, skeleton: 0, skin: -1,
}
const JOINT_RADIUS = 0.038
const MESH_GROUPS = ['skin', 'skeleton', 'muscles', 'organs', 'vessels', 'nerves']
const NO_KEYS: ReadonlySet<string> = new Set()
const NO_ANCHORS: readonly string[] = []

interface Part {
  key: string
  system: AnatomySystem
  meshes: THREE.Mesh[]
  materials: THREE.MeshStandardMaterial[]
  center: THREE.Vector3
}

const noRaycast: THREE.Mesh['raycast'] = () => {}

/**
 * One anatomy body for use inside your own react-three-fiber `<Canvas>`.
 * Needs a `<Suspense>` boundary above it (the model loads asynchronously).
 * Pointer events need `<Bvh firstHitOnly={false}>` for good performance.
 */
export function AnatomyModel({
  sex,
  layers = DEFAULT_LAYERS,
  url,
  highlightedKeys = NO_KEYS,
  hoveredKey = null,
  onHover,
  onSelect,
  anchorKeys = NO_ANCHORS,
  onProject,
  hoverColor = '#ff7a2f',
  highlightColor = '#e5391b',
}: AnatomyModelProps) {
  const { scene } = useGLTF(url ?? modelUrl(sex), false, true)
  const { camera, size } = useThree()
  const hover = useMemo(() => new THREE.Color(hoverColor), [hoverColor])
  const flag = useMemo(() => new THREE.Color(highlightColor), [highlightColor])

  const { root, parts, systemGroups } = useMemo(() => {
    const root = scene.clone(true)
    const parts = new Map<string, Part>()
    const systemGroups = new Map<AnatomySystem, THREE.Object3D>()
    const skinMaterial = makeSkinMaterial()

    root.traverse(obj => {
      // The root's direct children are the per-system groups. Don't skip a
      // name that is also a catalog key: the "skin" group holds the "skin" mesh.
      if (obj.parent === root && MESH_GROUPS.includes(obj.name)) {
        systemGroups.set(obj.name as AnatomySystem, obj)
      }
      if (!(obj instanceof THREE.Mesh)) return
      // A structure may be split across several primitives — walk up to the
      // nearest ancestor whose name is a catalog key.
      let owner: THREE.Object3D | null = obj
      while (owner && !ANATOMY_BY_KEY[owner.name]) owner = owner.parent
      if (!owner) return
      const info = ANATOMY_BY_KEY[owner.name]
      obj.userData.anatomyKey = info.key
      obj.userData.system = info.system
      if (info.system === 'skin') {
        obj.material = skinMaterial
        obj.raycast = noRaycast
        obj.renderOrder = 10
        return
      }
      const base = SYSTEM_MATERIAL[info.system]
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(info.color ?? base.color),
        roughness: base.roughness,
        metalness: 0,
        transparent: base.opacity < 1,
        opacity: base.opacity,
        depthWrite: base.opacity >= 1,
      })
      obj.material = mat
      obj.userData.originalRaycast = obj.raycast
      let part = parts.get(info.key)
      if (!part) {
        part = { key: info.key, system: info.system, meshes: [], materials: [], center: new THREE.Vector3() }
        parts.set(info.key, part)
      }
      part.meshes.push(obj)
      part.materials.push(mat)
    })

    // Joint hotspots: BodyParts3D has no joint capsules, so each joint is a
    // sphere at its real centre (computed from the bone ends at build time).
    const joints = new THREE.Group()
    joints.name = 'joints'
    root.add(joints)
    systemGroups.set('joints', joints)
    const jointGeometry = new THREE.SphereGeometry(JOINT_RADIUS, 24, 16)
    for (const s of ANATOMY_STRUCTURES) {
      const anchor = sex === 'female' ? s.anchorFemale : s.anchor
      if (s.system !== 'joints' || !anchor) continue
      const mat = new THREE.MeshStandardMaterial({ color: s.color, transparent: true, opacity: 0, depthWrite: false, roughness: 0.4 })
      const mesh = new THREE.Mesh(jointGeometry, mat)
      mesh.position.set(...anchor)
      mesh.renderOrder = 5
      mesh.userData.anatomyKey = s.key
      mesh.userData.system = 'joints'
      mesh.userData.originalRaycast = mesh.raycast
      joints.add(mesh)
      parts.set(s.key, { key: s.key, system: 'joints', meshes: [mesh], materials: [mat], center: mesh.position.clone() })
    }

    const box = new THREE.Box3()
    root.updateMatrixWorld(true)
    for (const part of parts.values()) {
      if (part.system === 'joints') continue
      box.makeEmpty()
      for (const m of part.meshes) box.expandByObject(m)
      box.getCenter(part.center)
      root.worldToLocal(part.center)
    }
    return { root, parts, systemGroups }
  }, [scene, sex])

  useEffect(() => {
    for (const [system, group] of systemGroups) group.visible = layers[system]
    for (const part of parts.values()) {
      const on = layers[part.system]
      for (const m of part.meshes) m.raycast = on ? m.userData.originalRaycast : noRaycast
    }
  }, [layers, parts, systemGroups])

  const tmp = useMemo(() => new THREE.Vector3(), [])
  const camDir = useMemo(() => new THREE.Vector3(), [])
  const toPoint = useMemo(() => new THREE.Vector3(), [])
  const anchorKeysRef = useRef(anchorKeys)
  anchorKeysRef.current = anchorKeys

  useFrame(({ clock }) => {
    const pulse = 0.35 + 0.25 * Math.sin(clock.elapsedTime * 3)
    for (const part of parts.values()) {
      const hovered = part.key === hoveredKey
      const flagged = highlightedKeys.has(part.key)
      for (const mat of part.materials) {
        if (hovered) {
          mat.emissive.copy(hover)
          mat.emissiveIntensity = 0.75
        } else if (flagged) {
          mat.emissive.copy(flag)
          mat.emissiveIntensity = pulse
        } else {
          mat.emissiveIntensity = 0
        }
        const baseOpacity = SYSTEM_MATERIAL[part.system as Exclude<AnatomySystem, 'skin'>].opacity
        const lit = part.system === 'joints' ? 0.55 : 1
        const wantOpacity = hovered || flagged ? lit : baseOpacity
        if (mat.opacity !== wantOpacity) {
          mat.opacity = wantOpacity
          mat.transparent = wantOpacity < 1
          mat.depthWrite = wantOpacity >= 1 && part.system !== 'joints'
          mat.needsUpdate = true
        }
      }
    }

    if (!onProject) return
    camera.getWorldDirection(camDir)
    const anchors: ProjectedAnchor[] = []
    for (const key of anchorKeysRef.current) {
      const part = parts.get(key)
      if (!part) continue
      tmp.copy(part.center)
      root.localToWorld(tmp)
      toPoint.copy(tmp).sub(camera.position)
      const inFront = toPoint.dot(camDir) > 0
      tmp.project(camera)
      anchors.push({
        key,
        x: (tmp.x * 0.5 + 0.5) * size.width,
        y: (-tmp.y * 0.5 + 0.5) * size.height,
        visible: inFront && layers[part.system],
      })
    }
    onProject(anchors, size.width, size.height)
  })

  function pick(e: ThreeEvent<PointerEvent | MouseEvent>): string | null {
    let best: THREE.Intersection | null = null
    for (const hit of e.intersections) {
      const system = hit.object.userData.system as AnatomySystem | undefined
      if (!system || system === 'skin' || !hit.object.visible) continue
      if (!best) { best = hit; continue }
      const pb = PICK_PRIORITY[best.object.userData.system as AnatomySystem]
      const ph = PICK_PRIORITY[system]
      // Joints and organs win even when something sits in front of them
      // (a joint hotspot is inside the muscle; ribs sit in front of the heart).
      if (ph > pb && (system === 'organs' || system === 'joints')) best = hit
    }
    return (best?.object.userData.anatomyKey as string | undefined) ?? null
  }

  return (
    <primitive
      object={root}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!onHover) return
        e.stopPropagation()
        // Mid-orbit-drag: don't light up whatever the cursor sweeps across.
        if (e.buttons) {
          if (hoveredKey) onHover(null)
          return
        }
        const key = pick(e)
        if (key !== hoveredKey) onHover(key)
      }}
      onPointerOut={() => onHover?.(null)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!onSelect) return
        e.stopPropagation()
        // Ignore the click that ends an orbit drag.
        if (e.delta > 4) return
        const key = pick(e)
        if (key) onSelect(key)
      }}
    />
  )
}

/** Start downloading a body before it is shown (e.g. on app start). */
export function preloadAnatomy(sex: AnatomySex, url?: string) {
  useGLTF.preload(url ?? modelUrl(sex), false, true)
}

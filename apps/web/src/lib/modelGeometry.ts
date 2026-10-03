import * as THREE from 'three'
import { modelTransformMatrix } from './modelTransforms'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { sampleClosedProfile, type ModelNode, type ProfileGeometrySettings, type ProfilePoint } from '@formforge/model'

const DEFAULT_PROFILE_SETTINGS: ProfileGeometrySettings = {
  curveMode: 'polyline',
  cornerRadius: 0,
  offset: 0,
  tension: 0.5,
  resolution: 8,
}

function sampledNodeProfile(node: ModelNode, fallback: readonly ProfilePoint[]) {
  const source = node.profile?.length ? node.profile : fallback
  const settings = { ...DEFAULT_PROFILE_SETTINGS, ...node.profileSettings }
  try {
    return sampleClosedProfile(source, settings)
  } catch {
    try {
      return sampleClosedProfile(source, DEFAULT_PROFILE_SETTINGS)
    } catch {
      return sampleClosedProfile(fallback, DEFAULT_PROFILE_SETTINGS)
    }
  }
}

function wedgeGeometry(width: number, depth: number, height: number) {
  const w = width / 2; const d = depth / 2; const h = height / 2
  const positions = [
    -w, -d, -h, w, -d, -h, w, d, -h, -w, d, -h,
    -w, -d, h, -w, d, h,
  ]
  const indices = [0, 2, 1, 0, 3, 2, 0, 1, 4, 1, 2, 4, 2, 5, 4, 2, 3, 5, 3, 0, 4, 3, 4, 5]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function starGeometry(outerRadius: number, innerRadius: number, height: number, points: number) {
  const shape = new THREE.Shape()
  const count = Math.max(3, Math.min(16, Math.round(points / 6)))
  for (let index = 0; index < count * 2; index += 1) {
    const angle = index * Math.PI / count - Math.PI / 2
    const radius = index % 2 ? innerRadius : outerRadius
    const x = Math.cos(angle) * radius; const y = Math.sin(angle) * radius
    if (!index) shape.moveTo(x, y); else shape.lineTo(x, y)
  }
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  geometry.translate(0, 0, -height / 2)
  return geometry
}

function tubeGeometry(outerRadius: number, innerRadius: number, height: number, segments: number) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, Math.min(innerRadius, outerRadius * 0.9), 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: segments })
  geometry.translate(0, 0, -height / 2)
  return geometry
}

function gearGeometry(outerRadius: number, rootRadius: number, height: number, teeth: number) {
  const shape = new THREE.Shape()
  const safeTeeth = Math.max(6, Math.min(96, Math.round(teeth)))
  for (let index = 0; index < safeTeeth * 4; index += 1) {
    const angle = index * Math.PI * 2 / (safeTeeth * 4)
    const phase = index % 4
    const radius = phase === 1 || phase === 2 ? outerRadius : Math.min(outerRadius * 0.96, rootRadius)
    const x = Math.cos(angle) * radius; const y = Math.sin(angle) * radius
    if (!index) shape.moveTo(x, y); else shape.lineTo(x, y)
  }
  shape.closePath()
  const bore = new THREE.Path()
  bore.absarc(0, 0, Math.max(0.8, Math.min(rootRadius * 0.38, outerRadius * 0.3)), 0, Math.PI * 2, true)
  shape.holes.push(bore)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 24 })
  geometry.translate(0, 0, -height / 2)
  return geometry
}

function loftGeometry(width: number, depth: number, topWidth: number, topDepth: number, height: number, twist: number, segments: number, sections: number) {
  const radial = Math.max(8, Math.min(96, Math.round(segments)))
  const levels = Math.max(1, Math.min(24, Math.round(sections)))
  const positions: number[] = []
  const indices: number[] = []
  for (let level = 0; level <= levels; level += 1) {
    const t = level / levels
    const rx = THREE.MathUtils.lerp(width, topWidth, t) / 2
    const ry = THREE.MathUtils.lerp(depth, topDepth, t) / 2
    const rotation = THREE.MathUtils.degToRad(twist * t)
    for (let segment = 0; segment < radial; segment += 1) {
      const angle = segment * Math.PI * 2 / radial + rotation
      positions.push(Math.cos(angle) * rx, Math.sin(angle) * ry, height * (t - 0.5))
    }
  }
  for (let level = 0; level < levels; level += 1) {
    for (let segment = 0; segment < radial; segment += 1) {
      const next = (segment + 1) % radial
      const a = level * radial + segment; const b = level * radial + next
      const c = (level + 1) * radial + next; const d = (level + 1) * radial + segment
      indices.push(a, b, d, b, c, d)
    }
  }
  const bottom = positions.length / 3; positions.push(0, 0, -height / 2)
  const top = positions.length / 3; positions.push(0, 0, height / 2)
  for (let segment = 0; segment < radial; segment += 1) {
    const next = (segment + 1) % radial
    indices.push(bottom, next, segment)
    const a = levels * radial + segment; const b = levels * radial + next
    indices.push(top, a, b)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

class HelixCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private radius: number, private height: number, private turns: number) { super() }
  override getPoint(t: number, target = new THREE.Vector3()) {
    const angle = t * Math.PI * 2 * this.turns
    return target.set(Math.cos(angle) * this.radius, Math.sin(angle) * this.radius, this.height * (t - 0.5))
  }
}

export function applyGeometryDeformation(geometry: THREE.BufferGeometry, node: ModelNode) {
  const deformation = node.deformation
  if (!deformation || deformation.kind === 'none' || Math.abs(deformation.amount) < 0.001) return geometry
  const position = geometry.getAttribute('position')
  if (!position) return geometry
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  if (!bounds) return geometry
  const height = Math.max(0.001, bounds.max.z - bounds.min.z)
  for (let index = 0; index < position.count; index += 1) {
    let x = position.getX(index); let y = position.getY(index); const z = position.getZ(index)
    const t = (z - bounds.min.z) / height
    if (deformation.kind === 'taper') {
      const factor = Math.max(0.05, 1 + (deformation.amount / 100) * (t - 0.5) * 2)
      x *= factor; y *= factor
    } else if (deformation.kind === 'twist') {
      const angle = THREE.MathUtils.degToRad(deformation.amount) * (t - 0.5)
      const cos = Math.cos(angle); const sin = Math.sin(angle)
      const nextX = x * cos - y * sin
      y = x * sin + y * cos; x = nextX
    } else if (deformation.kind === 'bend') {
      x += Math.sin((t - 0.5) * Math.PI) * deformation.amount * 0.2
    }
    position.setXYZ(index, x, y, z)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export function makeSourceGeometry(node: ModelNode) {
  const p = node.parameters
  let geometry: THREE.BufferGeometry
  if (node.kind === 'mesh' && node.mesh) {
    geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(node.mesh.positions, 3))
    geometry.setIndex(node.mesh.indices)
    geometry.computeVertexNormals()
  } else if (node.kind === 'extrude') {
    const profile = sampledNodeProfile(node, [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 0, y: 10 }])
    const shape = new THREE.Shape()
    shape.moveTo(profile[0]!.x, profile[0]!.y)
    profile.slice(1).forEach((point) => shape.lineTo(point.x, point.y))
    shape.closePath()
    geometry = new THREE.ExtrudeGeometry(shape, { depth: p.height, bevelEnabled: false })
    geometry.translate(0, 0, -p.height / 2)
  } else if (node.kind === 'revolve') {
    const profile = sampledNodeProfile(node, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }])
    const lathePoints = profile.map((point) => new THREE.Vector2(Math.max(0, point.x), point.y))
    geometry = new THREE.LatheGeometry(lathePoints, Math.min(128, Math.max(12, p.segments)))
    geometry.rotateX(Math.PI / 2)
  } else if (node.kind === 'box') geometry = new THREE.BoxGeometry(p.width, p.depth, p.height)
  else if (node.kind === 'roundedBox') geometry = new RoundedBoxGeometry(p.width, p.depth, p.height, Math.max(1, Math.min(8, Math.round(p.segments / 12))), Math.min(p.fillet, p.width / 2, p.depth / 2, p.height / 2))
  else if (node.kind === 'sphere') geometry = new THREE.SphereGeometry(p.radius, Math.min(64, p.segments), Math.min(32, p.segments / 2))
  else if (node.kind === 'torus') geometry = new THREE.TorusGeometry(p.radius, Math.max(0.5, p.radiusTop), Math.min(24, p.segments / 2), Math.min(96, p.segments * 2))
  else if (node.kind === 'capsule') {
    const radius = Math.min(p.radius, p.height / 2)
    geometry = new THREE.CapsuleGeometry(radius, Math.max(0, p.height - radius * 2), 10, Math.min(48, p.segments))
    geometry.rotateX(Math.PI / 2)
  }
  else if (node.kind === 'tube') geometry = tubeGeometry(p.radius, p.radiusTop, p.height, p.segments)
  else if (node.kind === 'wedge') geometry = wedgeGeometry(p.width, p.depth, p.height)
  else if (node.kind === 'star') geometry = starGeometry(p.radius, Math.max(0.5, p.radiusTop), p.height, p.segments)
  else if (node.kind === 'gear') geometry = gearGeometry(p.radius, p.radiusTop, p.height, p.count)
  else if (node.kind === 'loft') geometry = loftGeometry(p.width, p.depth, p.topWidth, p.topDepth, p.height, p.twist, p.segments, p.count)
  else if (node.kind === 'spring') geometry = new THREE.TubeGeometry(new HelixCurve(p.radius, p.height, p.count), Math.max(32, Math.round(p.count * 18)), Math.max(0.3, p.radiusTop), Math.max(8, Math.round(p.segments / 4)), false)
  else {
    geometry = new THREE.CylinderGeometry(node.kind === 'cone' ? p.radiusTop : p.radius, p.radius, p.height, p.segments)
    geometry.rotateX(Math.PI / 2)
  }
  return applyGeometryDeformation(geometry, node)
}

export function nodeGeometrySignature(node: ModelNode) {
  return JSON.stringify([node.kind, node.parameters, node.profile, node.profileSettings, node.mesh, node.deformation, node.surface])
}

export function nodeWorldBounds(node: ModelNode) {
  const geometry = nodeToWorldGeometry(node)
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox?.clone() ?? new THREE.Box3()
  geometry.dispose()
  return bounds
}

export function nodeToWorldGeometry(node: ModelNode) {
  const geometry = makeSourceGeometry(node)
  geometry.applyMatrix4(modelTransformMatrix(node.transform))
  return geometry
}

/** Surface operations are evaluated by Manifold, not the editable source preview. */
export function hasSurfaceModifiers(node: ModelNode) {
  return Object.values(node.surface ?? {}).some(value => value > 0)
}

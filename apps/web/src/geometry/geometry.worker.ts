/// <reference lib="webworker" />
import Module from 'manifold-3d'
import type { Manifold as ManifoldType, ManifoldToplevel, Mat4 } from 'manifold-3d'
import { sampleClosedProfile, type ModelDocument, type ModelNode, type ProfileGeometrySettings, type ProfilePoint } from '@formforge/model'
import { createLoftMesh, createSpringMesh } from './primitiveMeshes'
import { modelTransformMatrix } from '../lib/modelTransforms'

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

type Request = { id: number; document: ModelDocument }
type Response = {
  id: number
  ok: true
  positions: Float32Array
  indices: Uint32Array
  volume: number
  triangleCount: number
} | { id: number; ok: false; error: string }

let modulePromise: Promise<ManifoldToplevel> | null = null

async function getModule() {
  if (!modulePromise) {
    modulePromise = Module().then((module) => {
      module.setup()
      return module
    })
  }
  return modulePromise
}

function manifoldFromMesh(api: ManifoldToplevel, positions: number[], indices: number[]) {
  const mesh = new api.Mesh({ numProp: 3, vertProperties: new Float32Array(positions), triVerts: new Uint32Array(indices) })
  mesh.merge()
  return new api.Manifold(mesh)
}

function loftManifold(api: ManifoldToplevel, node: ModelNode) {
  const mesh = createLoftMesh(node.parameters)
  return manifoldFromMesh(api, mesh.positions, mesh.indices)
}

function springManifold(api: ManifoldToplevel, node: ModelNode) {
  const mesh = createSpringMesh(node.parameters)
  return manifoldFromMesh(api, mesh.positions, mesh.indices)
}

function shapeForNode(api: ManifoldToplevel, node: ModelNode) {
  const { Manifold, CrossSection } = api
  const p = node.parameters
  let shape: ManifoldType
  if (node.kind === 'mesh' && node.mesh) {
    const imported = new api.Mesh({
      numProp: 3,
      vertProperties: new Float32Array(node.mesh.positions),
      triVerts: new Uint32Array(node.mesh.indices),
    })
    imported.merge()
    shape = new Manifold(imported)
  } else if (node.kind === 'extrude') {
    const profile = sampledNodeProfile(node, [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 0, y: 10 }])
    const points = profile.map((point) => [point.x, point.y] as [number, number])
    const area = points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length]!
      return sum + point[0] * next[1] - next[0] * point[1]
    }, 0)
    if (area < 0) points.reverse()
    shape = new CrossSection([points]).extrude(p.height, 0, 0, [1, 1], true)
  } else if (node.kind === 'revolve') {
    const profile = sampledNodeProfile(node, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }])
    const points = profile.map((point) => [Math.max(0, point.x), point.y] as [number, number])
    const area = points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length]!
      return sum + point[0] * next[1] - next[0] * point[1]
    }, 0)
    if (area < 0) points.reverse()
    shape = Manifold.revolve(new CrossSection([points]), p.segments)
  } else if (node.kind === 'box') {
    shape = Manifold.cube([p.width, p.depth, p.height], true)
  } else if (node.kind === 'roundedBox') {
    const radius = Math.max(0.01, Math.min(p.fillet, p.width / 2, p.depth / 2, p.height / 2))
    const core = Manifold.cube([Math.max(0.01, p.width - radius * 2), Math.max(0.01, p.depth - radius * 2), Math.max(0.01, p.height - radius * 2)], true)
    const round = Manifold.sphere(radius, Math.max(12, Math.min(48, p.segments)))
    shape = core.minkowskiSum(round)
    core.delete(); round.delete()
  } else if (node.kind === 'sphere') {
    shape = Manifold.sphere(p.radius, p.segments)
  } else if (node.kind === 'torus') {
    shape = Manifold.revolve(CrossSection.circle(Math.max(0.5, p.radiusTop), Math.max(12, p.segments / 2)).translate([p.radius, 0]), p.segments * 2)
  } else if (node.kind === 'capsule') {
    const radius = Math.min(p.radius, p.height / 2)
    const halfStem = Math.max(0, p.height / 2 - radius)
    const stem = Manifold.cylinder(Math.max(0.01, halfStem * 2), radius, radius, p.segments, true)
    const top = Manifold.sphere(radius, p.segments).translate([0, 0, halfStem])
    const bottom = Manifold.sphere(radius, p.segments).translate([0, 0, -halfStem])
    shape = Manifold.union([stem, top, bottom])
    stem.delete(); top.delete(); bottom.delete()
  } else if (node.kind === 'tube') {
    const outer = Manifold.cylinder(p.height, p.radius, p.radius, p.segments, true)
    const inner = Manifold.cylinder(p.height + 0.2, Math.min(p.radiusTop, p.radius * 0.9), Math.min(p.radiusTop, p.radius * 0.9), p.segments, true)
    shape = outer.subtract(inner)
    outer.delete(); inner.delete()
  } else if (node.kind === 'wedge') {
    const points: [number, number][] = [[-p.width / 2, -p.height / 2], [p.width / 2, -p.height / 2], [-p.width / 2, p.height / 2]]
    shape = new CrossSection([points]).extrude(p.depth, 0, 0, [1, 1], true).rotate([90, 0, 0])
  } else if (node.kind === 'star') {
    const points = Math.max(3, Math.min(16, Math.round(p.segments / 6)))
    const polygon: [number, number][] = []
    for (let index = 0; index < points * 2; index += 1) {
      const angle = index * Math.PI / points - Math.PI / 2
      const radius = index % 2 ? Math.max(0.5, p.radiusTop) : p.radius
      polygon.push([Math.cos(angle) * radius, Math.sin(angle) * radius])
    }
    shape = new CrossSection([polygon]).extrude(p.height, 0, 0, [1, 1], true)
  } else if (node.kind === 'gear') {
    const teeth = Math.max(6, Math.min(96, Math.round(p.count)))
    const outer: [number, number][] = []
    for (let index = 0; index < teeth * 4; index += 1) {
      const angle = index * Math.PI * 2 / (teeth * 4); const phase = index % 4
      const radius = phase === 1 || phase === 2 ? p.radius : Math.min(p.radius * 0.96, p.radiusTop)
      outer.push([Math.cos(angle) * radius, Math.sin(angle) * radius])
    }
    const bore: [number, number][] = []
    const boreRadius = Math.max(0.8, Math.min(p.radiusTop * 0.38, p.radius * 0.3))
    for (let index = 31; index >= 0; index -= 1) { const angle = index * Math.PI * 2 / 32; bore.push([Math.cos(angle) * boreRadius, Math.sin(angle) * boreRadius]) }
    shape = new CrossSection([outer, bore]).extrude(p.height, 0, 0, [1, 1], true)
  } else if (node.kind === 'loft') {
    shape = loftManifold(api, node)
  } else if (node.kind === 'spring') {
    shape = springManifold(api, node)
  } else {
    shape = Manifold.cylinder(p.height, p.radius, node.kind === 'cone' ? p.radiusTop : p.radius, p.segments, true)
  }
  const deformation = node.deformation
  if (deformation && deformation.kind !== 'none' && Math.abs(deformation.amount) > 0.001) {
    const bounds = shape.boundingBox()
    const height = Math.max(0.001, bounds.max[2] - bounds.min[2])
    const warped = shape.warp((vertex) => {
      const t = (vertex[2] - bounds.min[2]) / height
      if (deformation.kind === 'taper') {
        const factor = Math.max(0.05, 1 + (deformation.amount / 100) * (t - 0.5) * 2)
        vertex[0] *= factor; vertex[1] *= factor
      } else if (deformation.kind === 'twist') {
        const angle = deformation.amount * Math.PI / 180 * (t - 0.5)
        const x = vertex[0]; const y = vertex[1]
        vertex[0] = x * Math.cos(angle) - y * Math.sin(angle)
        vertex[1] = x * Math.sin(angle) + y * Math.cos(angle)
      } else if (deformation.kind === 'bend') {
        vertex[0] += Math.sin((t - 0.5) * Math.PI) * deformation.amount * 0.2
      }
    })
    shape.delete()
    shape = warped
  }
  const surface = node.surface
  if (surface) {
    if (surface.smoothAngle > 0.01) {
      const next = shape.smoothOut(Math.max(0, Math.min(180, surface.smoothAngle)), 0.25)
      shape.delete(); shape = next
    }
    if (surface.refineLength > 0.01) {
      const next = shape.refineToLength(surface.refineLength)
      shape.delete(); shape = next
    }
    if (surface.simplifyTolerance > 0.0001) {
      const next = shape.simplify(surface.simplifyTolerance)
      shape.delete(); shape = next
    }
    if (surface.hollowThickness > 0.01) {
      const bounds = shape.boundingBox()
      const size = [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]]
      const thickness = Math.min(surface.hollowThickness, Math.min(...size) * 0.45)
      const center = [(bounds.max[0] + bounds.min[0]) / 2, (bounds.max[1] + bounds.min[1]) / 2, (bounds.max[2] + bounds.min[2]) / 2] as [number, number, number]
      const moved = shape.translate([-center[0], -center[1], -center[2]])
      const scaled = moved.scale(size.map((value) => Math.max(0.02, (value - thickness * 2) / value)) as [number, number, number])
      const inner = scaled.translate(center)
      moved.delete(); scaled.delete()
      const next = shape.subtract(inner)
      inner.delete(); shape.delete(); shape = next
    }
  }
  // Manifold.rotate uses a different Euler order from the viewport. Applying
  // the shared matrix also preserves mirrored, nonuniform scales exactly.
  const transformed = shape.transform(modelTransformMatrix(node.transform).elements as Mat4)
  shape.delete()
  return transformed
}

async function evaluate(document: ModelDocument) {
  const api = await getModule()
  const active = document.nodes.filter((node) => !node.suppressed)
  const groupedIds = new Set<string>()
  const operations: { shape: ManifoldType; mode: ModelNode['boolean'] }[] = []

  const combine = (nodes: ModelNode[]) => {
    if (!nodes.length) return null
    if (nodes[0]?.groupOperation === 'hull') {
      const parts = nodes.map((node) => shapeForNode(api, node))
      const hull = api.Manifold.hull(parts)
      parts.forEach((part) => part.delete())
      return hull
    }
    const first = shapeForNode(api, nodes[0]!)
    let groupResult = first.asOriginal()
    first.delete()
    for (const node of nodes.slice(1)) {
      const operand = shapeForNode(api, node)
      const next = node.boolean === 'cut' ? groupResult.subtract(operand) : node.boolean === 'intersect' ? groupResult.intersect(operand) : groupResult.add(operand)
      groupResult.delete(); operand.delete(); groupResult = next
    }
    return groupResult
  }

  for (const node of active) {
    if (node.combined && node.groupId) {
      if (groupedIds.has(node.groupId)) continue
      groupedIds.add(node.groupId)
      const grouped = active.filter((candidate) => candidate.combined && candidate.groupId === node.groupId)
      const shape = combine(grouped)
      if (shape) operations.push({ shape, mode: 'add' })
    } else {
      operations.push({ shape: shapeForNode(api, node), mode: node.boolean })
    }
  }

  let result: ManifoldType | null = null
  for (const operation of operations) {
    if (!result) {
      if (operation.mode === 'cut') { operation.shape.delete(); continue }
      result = operation.shape.asOriginal()
      operation.shape.delete()
      continue
    }
    const current: ManifoldType = result
    const next: ManifoldType = operation.mode === 'cut' ? current.subtract(operation.shape) : operation.mode === 'intersect' ? current.intersect(operation.shape) : current.add(operation.shape)
    result.delete(); operation.shape.delete(); result = next
  }

  if (!result) return { positions: new Float32Array(), indices: new Uint32Array(), volume: 0, triangleCount: 0 }
  let finalResult: ManifoldType = result

  for (const stroke of document.sculptStrokes) {
    if (stroke.mode === 'smooth' || stroke.mode === 'pinch' || stroke.mode === 'flatten') continue
    const radius = stroke.mode === 'inflate' ? stroke.radius * (0.72 + stroke.strength * 0.28) : stroke.radius
    const brush = api.Manifold.sphere(radius, 28).translate([stroke.center.x, stroke.center.y, stroke.center.z])
    const next: ManifoldType = stroke.mode === 'carve' ? finalResult.subtract(brush) : finalResult.add(brush)
    finalResult.delete()
    brush.delete()
    finalResult = next
  }

  const mesh = finalResult.getMesh()
  const positions = new Float32Array(mesh.numVert * 3)
  for (let vertex = 0; vertex < mesh.numVert; vertex += 1) {
    const offset = vertex * mesh.numProp
    positions[vertex * 3] = mesh.vertProperties[offset] ?? 0
    positions[vertex * 3 + 1] = mesh.vertProperties[offset + 1] ?? 0
    positions[vertex * 3 + 2] = mesh.vertProperties[offset + 2] ?? 0
  }
  const indices = new Uint32Array(mesh.triVerts)
  const vertexStrokes = document.sculptStrokes.filter((stroke) => stroke.mode === 'smooth' || stroke.mode === 'pinch' || stroke.mode === 'flatten')
  if (vertexStrokes.length) applyLocalizedDeforms(positions, indices, vertexStrokes)
  const volume = vertexStrokes.length ? meshVolume(positions, indices) : finalResult.volume()
  const triangleCount = finalResult.numTri()
  finalResult.delete()
  return { positions, indices, volume, triangleCount }
}

function falloffWeight(kind: 'smooth' | 'sharp' | 'flat' | undefined, normalizedDistance: number) {
  const value = Math.max(0, Math.min(1, 1 - normalizedDistance))
  if (kind === 'flat') return value > 0 ? 1 : 0
  if (kind === 'sharp') return value * value * value
  return value * value * (3 - 2 * value)
}

function applyLocalizedDeforms(positions: Float32Array, indices: Uint32Array, strokes: ModelDocument['sculptStrokes']) {
  const vertexCount = positions.length / 3
  const neighbors = Array.from({ length: vertexCount }, () => new Set<number>())
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!; const b = indices[i + 1]!; const c = indices[i + 2]!
    neighbors[a]!.add(b); neighbors[a]!.add(c)
    neighbors[b]!.add(a); neighbors[b]!.add(c)
    neighbors[c]!.add(a); neighbors[c]!.add(b)
  }

  for (const stroke of strokes) {
    const iterations = Math.max(1, Math.round(1 + stroke.strength * 3))
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const source = new Float32Array(positions)
      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        const offset = vertex * 3
        const dx = source[offset]! - stroke.center.x
        const dy = source[offset + 1]! - stroke.center.y
        const dz = source[offset + 2]! - stroke.center.z
        const distance = Math.hypot(dx, dy, dz)
        if (distance >= stroke.radius || neighbors[vertex]!.size === 0) continue
        const weight = Math.min(0.62, stroke.strength * falloffWeight(stroke.falloff, distance / stroke.radius))
        if (stroke.mode === 'pinch') {
          positions[offset] = source[offset]! + (stroke.center.x - source[offset]!) * weight * 0.22
          positions[offset + 1] = source[offset + 1]! + (stroke.center.y - source[offset + 1]!) * weight * 0.22
          positions[offset + 2] = source[offset + 2]! + (stroke.center.z - source[offset + 2]!) * weight * 0.08
        } else if (stroke.mode === 'flatten') {
          const normal = stroke.normal ?? { x: 0, y: 0, z: 1 }
          const planeDistance = dx * normal.x + dy * normal.y + dz * normal.z
          positions[offset] = source[offset]! - normal.x * planeDistance * weight * 0.65
          positions[offset + 1] = source[offset + 1]! - normal.y * planeDistance * weight * 0.65
          positions[offset + 2] = source[offset + 2]! - normal.z * planeDistance * weight * 0.65
        } else {
          let x = 0; let y = 0; let z = 0
          for (const adjacent of neighbors[vertex]!) {
            x += source[adjacent * 3]!
            y += source[adjacent * 3 + 1]!
            z += source[adjacent * 3 + 2]!
          }
          const count = neighbors[vertex]!.size
          const smoothWeight = Math.min(0.48, weight * 0.42)
          positions[offset] = source[offset]! + (x / count - source[offset]!) * smoothWeight
          positions[offset + 1] = source[offset + 1]! + (y / count - source[offset + 1]!) * smoothWeight
          positions[offset + 2] = source[offset + 2]! + (z / count - source[offset + 2]!) * smoothWeight
        }
      }
    }
  }
}

function meshVolume(positions: Float32Array, indices: Uint32Array) {
  let volume = 0
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i]! * 3; const ib = indices[i + 1]! * 3; const ic = indices[i + 2]! * 3
    const ax = positions[ia]!; const ay = positions[ia + 1]!; const az = positions[ia + 2]!
    const bx = positions[ib]!; const by = positions[ib + 1]!; const bz = positions[ib + 2]!
    const cx = positions[ic]!; const cy = positions[ic + 1]!; const cz = positions[ic + 2]!
    volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
  }
  return Math.abs(volume / 6)
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, document } = event.data
  try {
    const mesh = await evaluate(document)
    const response: Response = { id, ok: true, ...mesh }
    self.postMessage(response, { transfer: [mesh.positions.buffer, mesh.indices.buffer] })
  } catch (error) {
    const response: Response = { id, ok: false, error: error instanceof Error ? error.message : 'Geometry evaluation failed' }
    self.postMessage(response)
  }
}

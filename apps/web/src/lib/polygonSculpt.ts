import * as THREE from 'three'
import type { BrushFalloff, ModelNode } from '@formforge/model'

export type SculptMesh = NonNullable<ModelNode['mesh']>
export type PolygonBrushMode = 'draw' | 'clay' | 'smooth' | 'inflate' | 'pinch' | 'flatten' | 'crease' | 'grab' | 'snake' | 'relax' | 'mask'
export type SymmetryAxes = { x: boolean; y: boolean; z: boolean }

export interface PolygonBrushParams {
  geometry: THREE.BufferGeometry
  mode: PolygonBrushMode
  center: THREE.Vector3
  normal: THREE.Vector3
  previousCenter?: THREE.Vector3 | null
  dragDelta?: THREE.Vector3 | null
  radius: number
  strength: number
  falloff: BrushFalloff
  invert?: boolean
  symmetry: SymmetryAxes
  frontFacesOnly?: boolean
  viewDirection?: THREE.Vector3
  mask: Float32Array
  adjacency?: Array<Set<number>>
  grabWeights?: Float32Array
  /** Limits a stroke to the connected surface island under the pointer. */
  affectedVertices?: ReadonlySet<number>
}

const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`

export function symmetryPoints(point: THREE.Vector3, axes: SymmetryAxes) {
  const points: THREE.Vector3[] = []
  for (const sx of axes.x ? [1, -1] : [1]) {
    for (const sy of axes.y ? [1, -1] : [1]) {
      for (const sz of axes.z ? [1, -1] : [1]) points.push(new THREE.Vector3(point.x * sx, point.y * sy, point.z * sz))
    }
  }
  return points
}

function mirroredVector(vector: THREE.Vector3, source: THREE.Vector3, target: THREE.Vector3) {
  return new THREE.Vector3(
    Math.sign(source.x || 1) === Math.sign(target.x || 1) ? vector.x : -vector.x,
    Math.sign(source.y || 1) === Math.sign(target.y || 1) ? vector.y : -vector.y,
    Math.sign(source.z || 1) === Math.sign(target.z || 1) ? vector.z : -vector.z,
  )
}

function falloffWeight(falloff: BrushFalloff, distance: number, radius: number) {
  const t = Math.max(0, Math.min(1, 1 - distance / Math.max(0.0001, radius)))
  if (falloff === 'flat') return t > 0 ? 1 : 0
  if (falloff === 'sharp') return t * t * t
  return t * t * (3 - 2 * t)
}

export function buildAdjacency(indices: ArrayLike<number>, vertexCount: number) {
  const adjacency = Array.from({ length: vertexCount }, () => new Set<number>())
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const a = indices[offset]!; const b = indices[offset + 1]!; const c = indices[offset + 2]!
    adjacency[a]?.add(b); adjacency[a]?.add(c)
    adjacency[b]?.add(a); adjacency[b]?.add(c)
    adjacency[c]?.add(a); adjacency[c]?.add(b)
  }
  return adjacency
}

export function connectedVertexSet(adjacency: ReadonlyArray<ReadonlySet<number>>, seedVertex: number) {
  const connected = new Set<number>()
  if (!Number.isInteger(seedVertex) || seedVertex < 0 || seedVertex >= adjacency.length) return connected
  const queue = [seedVertex]
  connected.add(seedVertex)
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const neighbor of adjacency[queue[cursor]!] ?? []) {
      if (connected.has(neighbor)) continue
      connected.add(neighbor)
      queue.push(neighbor)
    }
  }
  return connected
}

function closestSymmetry(vertex: THREE.Vector3, center: THREE.Vector3, axes: SymmetryAxes, radius: number, falloff: BrushFalloff, centers = symmetryPoints(center, axes)) {
  let bestWeight = 0
  let bestPoint = center
  for (const point of centers) {
    const weight = falloffWeight(falloff, vertex.distanceTo(point), radius)
    if (weight > bestWeight) { bestWeight = weight; bestPoint = point }
  }
  return { weight: bestWeight, point: bestPoint }
}

export function createGrabWeights(geometry: THREE.BufferGeometry, center: THREE.Vector3, radius: number, falloff: BrushFalloff, axes: SymmetryAxes, affectedVertices?: ReadonlySet<number>) {
  const positions = geometry.getAttribute('position')
  const weights = new Float32Array(positions.count)
  const vertex = new THREE.Vector3()
  const centers = symmetryPoints(center, axes)
  for (let index = 0; index < positions.count; index += 1) {
    if (affectedVertices && !affectedVertices.has(index)) continue
    vertex.fromBufferAttribute(positions, index)
    weights[index] = closestSymmetry(vertex, center, axes, radius, falloff, centers).weight
  }
  return weights
}

export function applyPolygonBrush(params: PolygonBrushParams) {
  const positions = params.geometry.getAttribute('position') as THREE.BufferAttribute
  if (!positions) return 0
  if (!params.geometry.getAttribute('normal')) params.geometry.computeVertexNormals()
  const normals = params.geometry.getAttribute('normal') as THREE.BufferAttribute
  const index = params.geometry.getIndex()
  const adjacency = params.adjacency ?? buildAdjacency(index?.array ?? Array.from({ length: positions.count }, (_, value) => value), positions.count)
  const source = new Float32Array(positions.array as ArrayLike<number>)
  const reflectedCenters = symmetryPoints(params.center, params.symmetry)
  const vertex = new THREE.Vector3(); const ownNormal = new THREE.Vector3(); const average = new THREE.Vector3(); const delta = new THREE.Vector3()
  const strokeNormal = params.normal.clone().normalize()
  if (['draw', 'clay', 'flatten', 'crease'].includes(params.mode)) {
    const sampledNormal = new THREE.Vector3()
    let sampledWeight = 0
    for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
      if (params.affectedVertices && !params.affectedVertices.has(vertexIndex)) continue
      vertex.set(source[vertexIndex * 3]!, source[vertexIndex * 3 + 1]!, source[vertexIndex * 3 + 2]!)
      const weight = falloffWeight(params.falloff, vertex.distanceTo(params.center), params.radius)
      if (weight <= 0) continue
      ownNormal.fromBufferAttribute(normals, vertexIndex)
      sampledNormal.addScaledVector(ownNormal, weight)
      sampledWeight += weight
    }
    if (sampledWeight > 0 && sampledNormal.lengthSq() > 0.0001) strokeNormal.copy(sampledNormal.normalize())
  }
  const directionSign = params.invert ? -1 : 1
  const amount = params.radius * params.strength * 0.14
  let changed = 0

  for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
    if (params.affectedVertices && !params.affectedVertices.has(vertexIndex)) continue
    vertex.set(source[vertexIndex * 3]!, source[vertexIndex * 3 + 1]!, source[vertexIndex * 3 + 2]!)
    ownNormal.fromBufferAttribute(normals, vertexIndex).normalize()
    const closest = closestSymmetry(vertex, params.center, params.symmetry, params.radius, params.falloff, reflectedCenters)
    const brushWeight = params.grabWeights?.[vertexIndex] ?? closest.weight
    if (brushWeight <= 0) continue
    if (params.frontFacesOnly && params.viewDirection && ownNormal.dot(params.viewDirection) <= 0.05) continue

    if (params.mode === 'mask') {
      const current = params.mask[vertexIndex] ?? 0
      params.mask[vertexIndex] = Math.max(0, Math.min(1, current + directionSign * params.strength * brushWeight * 0.3))
      changed += 1
      continue
    }

    const unmasked = 1 - (params.mask[vertexIndex] ?? 0)
    const weight = brushWeight * unmasked
    if (weight <= 0.0001) continue
    const mirroredNormal = mirroredVector(strokeNormal, params.center, closest.point).normalize()
    delta.set(0, 0, 0)

    if (params.mode === 'draw') {
      delta.copy(mirroredNormal).multiplyScalar(amount * directionSign * weight)
    } else if (params.mode === 'inflate') {
      delta.copy(ownNormal).multiplyScalar(amount * directionSign * weight)
    } else if (params.mode === 'clay') {
      const planeDistance = vertex.clone().sub(closest.point).dot(mirroredNormal)
      const target = amount * directionSign
      delta.copy(mirroredNormal).multiplyScalar((target - planeDistance) * weight * 0.55)
    } else if (params.mode === 'flatten') {
      const planeDistance = vertex.clone().sub(closest.point).dot(mirroredNormal)
      delta.copy(mirroredNormal).multiplyScalar(-planeDistance * weight * params.strength)
    } else if (params.mode === 'pinch' || params.mode === 'crease') {
      const towardCenter = closest.point.clone().sub(vertex)
      towardCenter.addScaledVector(mirroredNormal, -towardCenter.dot(mirroredNormal))
      delta.copy(towardCenter).multiplyScalar(params.strength * weight * (params.mode === 'crease' ? 0.42 : 0.28))
      if (params.mode === 'crease') delta.addScaledVector(mirroredNormal, -amount * directionSign * weight * 0.55)
    } else if (params.mode === 'grab' || params.mode === 'snake') {
      if (!params.dragDelta) continue
      const mirroredDrag = mirroredVector(params.dragDelta, params.center, closest.point)
      // Grab is applied for every pointer-move delta. Respecting strength here
      // prevents a short mouse movement from pulling one coarse vertex the full
      // screen distance and producing the familiar needle-like spike.
      delta.copy(mirroredDrag).multiplyScalar(weight * Math.max(0, Math.min(1, params.strength)))
    } else if (params.mode === 'smooth' || params.mode === 'relax') {
      const neighbors = adjacency[vertexIndex]
      if (!neighbors?.size) continue
      average.set(0, 0, 0)
      for (const neighbor of neighbors) average.add(new THREE.Vector3(source[neighbor * 3]!, source[neighbor * 3 + 1]!, source[neighbor * 3 + 2]!))
      average.divideScalar(neighbors.size)
      delta.copy(average).sub(vertex)
      if (params.mode === 'relax') delta.addScaledVector(ownNormal, -delta.dot(ownNormal))
      delta.multiplyScalar(params.strength * weight * (params.mode === 'relax' ? 0.32 : 0.48))
    }

    if (delta.lengthSq() <= 1e-12) continue
    positions.setXYZ(vertexIndex, vertex.x + delta.x, vertex.y + delta.y, vertex.z + delta.z)
    changed += 1
  }

  if (changed && params.mode !== 'mask') {
    positions.needsUpdate = true
    params.geometry.computeVertexNormals()
    params.geometry.computeBoundingBox()
    params.geometry.computeBoundingSphere()
  }
  return changed
}

export function geometryToSculptMesh(geometry: THREE.BufferGeometry, mask?: Float32Array): SculptMesh {
  const positions = geometry.getAttribute('position')
  const index = geometry.getIndex()
  return {
    positions: Array.from(positions.array as ArrayLike<number>),
    indices: index ? Array.from(index.array as ArrayLike<number>) : Array.from({ length: positions.count }, (_, value) => value),
    mask: mask ? Array.from(mask) : undefined,
  }
}

export function sculptMeshToGeometry(mesh: SculptMesh) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3))
  geometry.setIndex(mesh.indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export function subdivideMesh(mesh: SculptMesh, levels = 1): SculptMesh {
  let result = { positions: [...mesh.positions], indices: [...mesh.indices], mask: mesh.mask ? [...mesh.mask] : undefined }
  for (let level = 0; level < Math.max(0, Math.min(4, Math.round(levels))); level += 1) {
    const positions = [...result.positions]
    const nextIndices: number[] = []
    const nextMask = result.mask ? [...result.mask] : undefined
    const midpoints = new Map<string, number>()
    const midpoint = (a: number, b: number) => {
      const key = edgeKey(a, b)
      const existing = midpoints.get(key)
      if (existing !== undefined) return existing
      const target = positions.length / 3
      positions.push(
        (positions[a * 3]! + positions[b * 3]!) / 2,
        (positions[a * 3 + 1]! + positions[b * 3 + 1]!) / 2,
        (positions[a * 3 + 2]! + positions[b * 3 + 2]!) / 2,
      )
      if (nextMask) nextMask.push(((result.mask?.[a] ?? 0) + (result.mask?.[b] ?? 0)) / 2)
      midpoints.set(key, target)
      return target
    }
    for (let offset = 0; offset < result.indices.length; offset += 3) {
      const a = result.indices[offset]!; const b = result.indices[offset + 1]!; const c = result.indices[offset + 2]!
      const ab = midpoint(a, b); const bc = midpoint(b, c); const ca = midpoint(c, a)
      nextIndices.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca)
    }
    result = { positions, indices: nextIndices, mask: nextMask }
  }
  return result
}

export function adaptiveSubdivideMesh(mesh: SculptMesh, centers: THREE.Vector3[], radius: number, maxEdgeLength: number): SculptMesh {
  const splitEdges = new Set<string>()
  const distanceToCenter = (a: number, b: number) => {
    const midpoint = new THREE.Vector3(
      (mesh.positions[a * 3]! + mesh.positions[b * 3]!) / 2,
      (mesh.positions[a * 3 + 1]! + mesh.positions[b * 3 + 1]!) / 2,
      (mesh.positions[a * 3 + 2]! + mesh.positions[b * 3 + 2]!) / 2,
    )
    return centers.some((center) => midpoint.distanceTo(center) <= radius)
  }
  const edgeLength = (a: number, b: number) => Math.hypot(
    mesh.positions[a * 3]! - mesh.positions[b * 3]!,
    mesh.positions[a * 3 + 1]! - mesh.positions[b * 3 + 1]!,
    mesh.positions[a * 3 + 2]! - mesh.positions[b * 3 + 2]!,
  )
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const tri = [mesh.indices[offset]!, mesh.indices[offset + 1]!, mesh.indices[offset + 2]!]
    const edges: Array<[number, number]> = [[tri[0]!, tri[1]!], [tri[1]!, tri[2]!], [tri[2]!, tri[0]!]]
    for (const [a, b] of edges) {
      if (edgeLength(a, b) > maxEdgeLength && distanceToCenter(a, b)) splitEdges.add(edgeKey(a, b))
    }
  }
  if (!splitEdges.size) return mesh

  let propagated = true
  while (propagated) {
    propagated = false
    for (let offset = 0; offset < mesh.indices.length; offset += 3) {
      const a = mesh.indices[offset]!; const b = mesh.indices[offset + 1]!; const c = mesh.indices[offset + 2]!
      const edges = [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]
      if (edges.filter((edge) => splitEdges.has(edge)).length === 2) {
        const missing = edges.find((edge) => !splitEdges.has(edge))!
        splitEdges.add(missing); propagated = true
      }
    }
  }

  const positions = [...mesh.positions]
  const mask = mesh.mask ? [...mesh.mask] : undefined
  const midpointIndices = new Map<string, number>()
  const midpoint = (a: number, b: number) => {
    const key = edgeKey(a, b)
    const existing = midpointIndices.get(key)
    if (existing !== undefined) return existing
    const target = positions.length / 3
    positions.push((positions[a * 3]! + positions[b * 3]!) / 2, (positions[a * 3 + 1]! + positions[b * 3 + 1]!) / 2, (positions[a * 3 + 2]! + positions[b * 3 + 2]!) / 2)
    if (mask) mask.push(((mesh.mask?.[a] ?? 0) + (mesh.mask?.[b] ?? 0)) / 2)
    midpointIndices.set(key, target)
    return target
  }
  for (const edge of splitEdges) {
    const [a, b] = edge.split(':').map(Number) as [number, number]
    midpoint(a, b)
  }

  const indices: number[] = []
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const a = mesh.indices[offset]!; const b = mesh.indices[offset + 1]!; const c = mesh.indices[offset + 2]!
    const ab = midpointIndices.get(edgeKey(a, b)); const bc = midpointIndices.get(edgeKey(b, c)); const ca = midpointIndices.get(edgeKey(c, a))
    const pattern = (ab !== undefined ? 1 : 0) | (bc !== undefined ? 2 : 0) | (ca !== undefined ? 4 : 0)
    if (pattern === 0) indices.push(a, b, c)
    else if (pattern === 1) indices.push(a, ab!, c, ab!, b, c)
    else if (pattern === 2) indices.push(a, b, bc!, a, bc!, c)
    else if (pattern === 3) indices.push(a, ab!, c, ab!, b, bc!, ab!, bc!, c)
    else if (pattern === 4) indices.push(a, b, ca!, b, c, ca!)
    else if (pattern === 5) indices.push(a, ab!, ca!, ab!, b, c, ca!, ab!, c)
    else if (pattern === 6) indices.push(a, b, bc!, a, bc!, ca!, ca!, bc!, c)
    else indices.push(a, ab!, ca!, b, bc!, ab!, c, ca!, bc!, ab!, bc!, ca!)
  }
  return { positions, indices, mask }
}

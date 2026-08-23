import type { ModelNode } from '@formforge/model'

export type ComponentMesh = NonNullable<ModelNode['mesh']>
export type ComponentMode = 'vertex' | 'edge' | 'face'
export type SelectionConversion = 'contained' | 'touching'
export type SoftSelectionDistance = 'euclidean' | 'topological' | 'surface'
export type SoftSelectionFalloff = 'smooth' | 'linear' | 'sharp' | 'constant'
export type PathComponentMode = 'vertex' | 'edge'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface ComponentSelection {
  mode: ComponentMode
  indices: Set<number>
}

export interface TopologyVertex {
  index: number
  position: Vec3
  sourceIndices: number[]
}

export interface TopologyEdge {
  index: number
  vertices: readonly [number, number]
  faces: number[]
  /** Direction of this edge in each corresponding face: 1 is low-to-high, -1 is high-to-low. */
  faceDirections: number[]
  boundary: boolean
  nonManifold: boolean
}

export interface TopologyFace {
  index: number
  vertices: readonly [number, number, number]
  edges: readonly [number, number, number]
  normal: Vec3
  centroid: Vec3
  area: number
  sourceTriangle: number
}

export interface TopologyExtractionIssues {
  invalidFaces: number
  degenerateFaces: number
  duplicateFaces: number
  trailingPositionValues: number
  trailingIndexValues: number
}

export interface MeshTopology {
  /** Canonical indexed mesh. Positional duplicates are welded within `tolerance`. */
  mesh: ComponentMesh
  tolerance: number
  vertices: TopologyVertex[]
  edges: TopologyEdge[]
  faces: TopologyFace[]
  vertexEdges: number[][]
  vertexFaces: number[][]
  faceNeighbors: number[][]
  sourceVertexToVertex: number[]
  edgeIndexByKey: Map<string, number>
  issues: TopologyExtractionIssues
}

export interface ConnectedMeshComponent {
  /** A compact mesh centered around its own local bounding box. */
  mesh: ComponentMesh
  /** Local-space offset removed from the source positions. */
  center: Vec3
  /** Canonical source faces included in this component. */
  sourceFaceIndices: number[]
}

export interface ManifoldValidation {
  vertexCount: number
  edgeCount: number
  faceCount: number
  boundaryEdges: number
  nonManifoldEdges: number
  nonManifoldVertices: number
  inconsistentWindingEdges: number
  isolatedVertices: number
  connectedFaceComponents: number
  invalidFaces: number
  degenerateFaces: number
  duplicateFaces: number
  manifold: boolean
  watertight: boolean
}

export interface MeshEditResult {
  mesh: ComponentMesh
  topology: MeshTopology
  diagnostics: ManifoldValidation
  createdVertices: number[]
  selection?: ComponentSelection
}

export interface TranslatedMeshEditResult extends MeshEditResult {
  /** Actual applied weight after the optional per-vertex mask. */
  weights: number[]
}

export interface TransformedMeshEditResult extends MeshEditResult {
  /** Actual applied weight after the optional per-vertex mask. */
  weights: number[]
  /** Resolved pivot used by the transformation. */
  pivot: Vec3
}

export type SafeMeshEditResult =
  | { ok: true; result: MeshEditResult }
  | { ok: false; reason: string; diagnostics?: ManifoldValidation }

export type ComponentPathResult =
  | {
      ok: true
      selection: ComponentSelection & { mode: PathComponentMode }
      /** Ordered from the start seed through the end seed. */
      path: number[]
      /** Geometric path cost in mesh units. */
      cost: number
    }
  | { ok: false; reason: string }

export interface EdgeLoopOptions {
  /** Maximum triangle-pair normal difference. Defaults to one degree. */
  coplanarAngleDegrees?: number
}

export type EdgeLoopTermination = 'closed' | 'boundary' | 'ambiguous'

export type EdgeLoopResult =
  | {
      ok: true
      selection: ComponentSelection & { mode: 'edge' }
      /** Ordered loop/path edges, starting at the seed for a closed loop. */
      orderedEdges: number[]
      closed: boolean
      termination: EdgeLoopTermination
      reconstructedQuads: number
    }
  | { ok: false; reason: string }

export interface SoftSelectionOptions {
  /** Omit or use zero to move only explicitly selected vertices. */
  radius?: number
  distance?: SoftSelectionDistance
  falloff?: SoftSelectionFalloff
  /** Existing sculpt masks protect vertices by default. */
  useMask?: boolean
}

export type TransformPivot = 'median' | Vec3

export interface VertexTransform {
  /** Applied after scale and rotation. Defaults to zero. */
  translation?: Vec3
  /** Euler rotation in degrees, applied around X, then Y, then Z. Defaults to zero. */
  rotation?: Vec3
  /** Nonuniform scale around the pivot. Defaults to one. */
  scale?: Vec3
  /** Median means the arithmetic center of the explicitly selected vertices. */
  pivot?: TransformPivot
}

export interface ExtrudeFacesOptions {
  /** Explicit extrusion vector. Takes precedence over `distance`. */
  offset?: Vec3
  /** Distance along the area-weighted average normal. Defaults to 1. */
  distance?: number
}

const DEFAULT_TOLERANCE = 1e-6

const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`
const faceKey = (a: number, b: number, c: number) => [a, b, c].sort((left, right) => left - right).join(':')
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function positionAt(positions: ArrayLike<number>, index: number): Vec3 {
  return {
    x: positions[index * 3] ?? 0,
    y: positions[index * 3 + 1] ?? 0,
    z: positions[index * 3 + 2] ?? 0,
  }
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function length(vector: Vec3) {
  return Math.hypot(vector.x, vector.y, vector.z)
}

function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function normalized(vector: Vec3): Vec3 {
  const magnitude = length(vector)
  if (magnitude <= Number.EPSILON) return { x: 0, y: 0, z: 0 }
  return { x: vector.x / magnitude, y: vector.y / magnitude, z: vector.z / magnitude }
}

function faceGeometry(positions: ArrayLike<number>, vertices: readonly [number, number, number]) {
  const a = positionAt(positions, vertices[0])
  const b = positionAt(positions, vertices[1])
  const c = positionAt(positions, vertices[2])
  const areaVector = cross(subtract(b, a), subtract(c, a))
  const twiceArea = length(areaVector)
  return {
    normal: normalized(areaVector),
    centroid: { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 },
    area: twiceArea / 2,
    twiceArea,
  }
}

function meshWithMask(
  positions: number[],
  indices: number[],
  mask?: number[],
  triangleMaterials?: ComponentMesh['triangleMaterials'],
): ComponentMesh {
  const mesh: ComponentMesh = { positions, indices }
  if (mask) mesh.mask = mask
  if (triangleMaterials !== undefined) {
    mesh.triangleMaterials = triangleMaterials.map((assignment) => ({
      materialId: assignment.materialId,
      triangleIndices: [...assignment.triangleIndices],
    }))
  }
  return mesh
}

function remapTriangleMaterials(
  mesh: ComponentMesh,
  faces: readonly TopologyFace[],
): ComponentMesh['triangleMaterials'] {
  if (mesh.triangleMaterials === undefined) return undefined
  const canonicalFaceBySource = new Map(faces.map((face) => [face.sourceTriangle, face.index]))
  const assignedFaces = new Set<number>()
  const result: NonNullable<ComponentMesh['triangleMaterials']> = []
  for (const assignment of mesh.triangleMaterials) {
    const triangleIndices: number[] = []
    for (const sourceTriangle of assignment.triangleIndices) {
      const canonicalFace = canonicalFaceBySource.get(sourceTriangle)
      if (canonicalFace === undefined || assignedFaces.has(canonicalFace)) continue
      assignedFaces.add(canonicalFace)
      triangleIndices.push(canonicalFace)
    }
    if (triangleIndices.length) result.push({ materialId: assignment.materialId, triangleIndices })
  }
  return result
}

/**
 * Extracts a canonical triangle topology. Vertices at the same position are welded,
 * invalid/degenerate/duplicate faces are reported and omitted from `topology.mesh`.
 */
export function extractMeshTopology(mesh: ComponentMesh, tolerance = DEFAULT_TOLERANCE): MeshTopology {
  const weldTolerance = Math.max(Number.EPSILON, Math.abs(tolerance))
  const sourceVertexCount = Math.floor(mesh.positions.length / 3)
  const positions: number[] = []
  const sourceVertexToVertex: number[] = []
  const sourceLists: number[][] = []
  const spatialCells = new Map<string, number[]>()
  const maskSums: number[] = []
  const maskCounts: number[] = []
  const toleranceSquared = weldTolerance * weldTolerance

  const cellCoordinate = (value: number) => Math.floor(value / weldTolerance)
  const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`

  for (let sourceIndex = 0; sourceIndex < sourceVertexCount; sourceIndex += 1) {
    const point = positionAt(mesh.positions, sourceIndex)
    const cellX = cellCoordinate(point.x)
    const cellY = cellCoordinate(point.y)
    const cellZ = cellCoordinate(point.z)
    let canonical = -1

    for (let dx = -1; dx <= 1 && canonical < 0; dx += 1) {
      for (let dy = -1; dy <= 1 && canonical < 0; dy += 1) {
        for (let dz = -1; dz <= 1 && canonical < 0; dz += 1) {
          const candidates = spatialCells.get(cellKey(cellX + dx, cellY + dy, cellZ + dz)) ?? []
          for (const candidate of candidates) {
            const existing = positionAt(positions, candidate)
            const distanceSquared = (existing.x - point.x) ** 2 + (existing.y - point.y) ** 2 + (existing.z - point.z) ** 2
            if (distanceSquared <= toleranceSquared) {
              canonical = candidate
              break
            }
          }
        }
      }
    }

    if (canonical < 0) {
      canonical = positions.length / 3
      positions.push(point.x, point.y, point.z)
      sourceLists.push([])
      maskSums.push(0)
      maskCounts.push(0)
      const key = cellKey(cellX, cellY, cellZ)
      const members = spatialCells.get(key) ?? []
      members.push(canonical)
      spatialCells.set(key, members)
    }

    sourceVertexToVertex[sourceIndex] = canonical
    sourceLists[canonical]?.push(sourceIndex)
    if (mesh.mask) {
      maskSums[canonical] = (maskSums[canonical] ?? 0) + clamp01(mesh.mask[sourceIndex] ?? 0)
      maskCounts[canonical] = (maskCounts[canonical] ?? 0) + 1
    }
  }

  const issues: TopologyExtractionIssues = {
    invalidFaces: 0,
    degenerateFaces: 0,
    duplicateFaces: 0,
    trailingPositionValues: mesh.positions.length % 3,
    trailingIndexValues: mesh.indices.length % 3,
  }
  const faceTriples: Array<{ vertices: [number, number, number]; sourceTriangle: number }> = []
  const seenFaces = new Set<string>()
  const triangleCount = Math.floor(mesh.indices.length / 3)

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const rawA = mesh.indices[triangle * 3]
    const rawB = mesh.indices[triangle * 3 + 1]
    const rawC = mesh.indices[triangle * 3 + 2]
    if (rawA === undefined || rawB === undefined || rawC === undefined
      || !Number.isInteger(rawA) || !Number.isInteger(rawB) || !Number.isInteger(rawC)
      || rawA < 0 || rawB < 0 || rawC < 0
      || rawA >= sourceVertexCount || rawB >= sourceVertexCount || rawC >= sourceVertexCount) {
      issues.invalidFaces += 1
      continue
    }
    const a = sourceVertexToVertex[rawA]
    const b = sourceVertexToVertex[rawB]
    const c = sourceVertexToVertex[rawC]
    if (a === undefined || b === undefined || c === undefined || a === b || b === c || c === a) {
      issues.degenerateFaces += 1
      continue
    }
    const vertices: [number, number, number] = [a, b, c]
    if (faceGeometry(positions, vertices).twiceArea <= toleranceSquared) {
      issues.degenerateFaces += 1
      continue
    }
    const key = faceKey(a, b, c)
    if (seenFaces.has(key)) {
      issues.duplicateFaces += 1
      continue
    }
    seenFaces.add(key)
    faceTriples.push({ vertices, sourceTriangle: triangle })
  }

  const vertices: TopologyVertex[] = positions.reduce<TopologyVertex[]>((result, _value, offset) => {
    if (offset % 3 === 0) {
      const index = offset / 3
      result.push({ index, position: positionAt(positions, index), sourceIndices: [...(sourceLists[index] ?? [])] })
    }
    return result
  }, [])
  const vertexEdges = Array.from({ length: vertices.length }, () => [] as number[])
  const vertexFaces = Array.from({ length: vertices.length }, () => [] as number[])
  const edges: TopologyEdge[] = []
  const faces: TopologyFace[] = []
  const edgeIndexByKey = new Map<string, number>()

  for (const record of faceTriples) {
    const faceIndex = faces.length
    const faceEdges: number[] = []
    for (let corner = 0; corner < 3; corner += 1) {
      const from = record.vertices[corner]!
      const to = record.vertices[(corner + 1) % 3]!
      const key = edgeKey(from, to)
      let edgeIndex = edgeIndexByKey.get(key)
      if (edgeIndex === undefined) {
        edgeIndex = edges.length
        const low = Math.min(from, to)
        const high = Math.max(from, to)
        edges.push({ index: edgeIndex, vertices: [low, high], faces: [], faceDirections: [], boundary: false, nonManifold: false })
        edgeIndexByKey.set(key, edgeIndex)
        vertexEdges[low]?.push(edgeIndex)
        vertexEdges[high]?.push(edgeIndex)
      }
      const edge = edges[edgeIndex]!
      edge.faces.push(faceIndex)
      edge.faceDirections.push(from < to ? 1 : -1)
      faceEdges.push(edgeIndex)
    }
    for (const vertex of record.vertices) vertexFaces[vertex]?.push(faceIndex)
    const geometry = faceGeometry(positions, record.vertices)
    faces.push({
      index: faceIndex,
      vertices: record.vertices,
      edges: [faceEdges[0]!, faceEdges[1]!, faceEdges[2]!],
      normal: geometry.normal,
      centroid: geometry.centroid,
      area: geometry.area,
      sourceTriangle: record.sourceTriangle,
    })
  }

  for (const edge of edges) {
    edge.boundary = edge.faces.length === 1
    edge.nonManifold = edge.faces.length > 2
  }

  const faceNeighborSets = Array.from({ length: faces.length }, () => new Set<number>())
  for (const edge of edges) {
    for (const face of edge.faces) {
      for (const neighbor of edge.faces) if (neighbor !== face) faceNeighborSets[face]?.add(neighbor)
    }
  }
  const faceNeighbors = faceNeighborSets.map((neighbors) => [...neighbors].sort((a, b) => a - b))
  const mask = mesh.mask
    ? maskSums.map((sum, index) => sum / Math.max(1, maskCounts[index] ?? 1))
    : undefined
  const canonicalIndices = faces.flatMap((face) => [...face.vertices])
  const triangleMaterials = remapTriangleMaterials(mesh, faces)

  return {
    mesh: meshWithMask(positions, canonicalIndices, mask, triangleMaterials),
    tolerance: weldTolerance,
    vertices,
    edges,
    faces,
    vertexEdges,
    vertexFaces,
    faceNeighbors,
    sourceVertexToVertex,
    edgeIndexByKey,
    issues,
  }
}

/**
 * Splits disconnected triangle islands into compact, independently centered meshes.
 * Touching positions are welded first, so pieces are separated only when there is
 * no topological connection between them.
 */
export function splitMeshIntoConnectedComponents(mesh: ComponentMesh, tolerance = DEFAULT_TOLERANCE): ConnectedMeshComponent[] {
  const topology = extractMeshTopology(mesh, tolerance)
  if (!topology.faces.length) return []

  const faceComponents: number[][] = []
  const seen = new Set<number>()
  for (const face of topology.faces) {
    if (seen.has(face.index)) continue
    const component: number[] = []
    const queue = [face.index]
    seen.add(face.index)
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const faceIndex = queue[cursor]!
      component.push(faceIndex)
      for (const neighbor of topology.faceNeighbors[faceIndex] ?? []) {
        if (seen.has(neighbor)) continue
        seen.add(neighbor)
        queue.push(neighbor)
      }
    }
    component.sort((a, b) => a - b)
    faceComponents.push(component)
  }

  const materialByFace = new Map<number, string>()
  for (const assignment of topology.mesh.triangleMaterials ?? []) {
    for (const faceIndex of assignment.triangleIndices) materialByFace.set(faceIndex, assignment.materialId)
  }

  return faceComponents.map((sourceFaceIndices) => {
    const sourceVertices = new Set<number>()
    for (const faceIndex of sourceFaceIndices) {
      for (const vertex of topology.faces[faceIndex]!.vertices) sourceVertices.add(vertex)
    }
    const orderedVertices = [...sourceVertices].sort((a, b) => a - b)
    const remap = new Map(orderedVertices.map((vertex, index) => [vertex, index]))
    const boundsMin = { x: Infinity, y: Infinity, z: Infinity }
    const boundsMax = { x: -Infinity, y: -Infinity, z: -Infinity }
    for (const vertex of orderedVertices) {
      const point = topology.vertices[vertex]!.position
      boundsMin.x = Math.min(boundsMin.x, point.x); boundsMin.y = Math.min(boundsMin.y, point.y); boundsMin.z = Math.min(boundsMin.z, point.z)
      boundsMax.x = Math.max(boundsMax.x, point.x); boundsMax.y = Math.max(boundsMax.y, point.y); boundsMax.z = Math.max(boundsMax.z, point.z)
    }
    const center = {
      x: (boundsMin.x + boundsMax.x) / 2,
      y: (boundsMin.y + boundsMax.y) / 2,
      z: (boundsMin.z + boundsMax.z) / 2,
    }
    const positions = orderedVertices.flatMap((vertex) => {
      const point = topology.vertices[vertex]!.position
      return [point.x - center.x, point.y - center.y, point.z - center.z]
    })
    const mask = topology.mesh.mask
      ? orderedVertices.map((vertex) => topology.mesh.mask?.[vertex] ?? 0)
      : undefined
    const indices: number[] = []
    const materials = new Map<string, number[]>()
    sourceFaceIndices.forEach((faceIndex, localFaceIndex) => {
      const face = topology.faces[faceIndex]!
      indices.push(remap.get(face.vertices[0])!, remap.get(face.vertices[1])!, remap.get(face.vertices[2])!)
      const materialId = materialByFace.get(faceIndex)
      if (materialId) {
        const faces = materials.get(materialId) ?? []
        faces.push(localFaceIndex)
        materials.set(materialId, faces)
      }
    })
    const triangleMaterials = topology.mesh.triangleMaterials === undefined
      ? undefined
      : [...materials].map(([materialId, triangleIndices]) => ({ materialId, triangleIndices }))
    return { mesh: meshWithMask(positions, indices, mask, triangleMaterials), center, sourceFaceIndices }
  })
}

function connectedComponentCount(topology: MeshTopology) {
  const seen = new Set<number>()
  let components = 0
  for (const face of topology.faces) {
    if (seen.has(face.index)) continue
    components += 1
    const queue = [face.index]
    seen.add(face.index)
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const neighbor of topology.faceNeighbors[queue[cursor]!] ?? []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
  }
  return components
}

function isNonManifoldVertex(topology: MeshTopology, vertexIndex: number) {
  const incidentFaces = topology.vertexFaces[vertexIndex] ?? []
  if (!incidentFaces.length) return false
  const link = new Map<number, Set<number>>()
  for (const faceIndex of incidentFaces) {
    const others = topology.faces[faceIndex]?.vertices.filter((vertex) => vertex !== vertexIndex) ?? []
    if (others.length !== 2) return true
    const a = others[0]!
    const b = others[1]!
    if (!link.has(a)) link.set(a, new Set())
    if (!link.has(b)) link.set(b, new Set())
    link.get(a)!.add(b)
    link.get(b)!.add(a)
  }
  const nodes = [...link.keys()]
  if (!nodes.length) return true
  const seen = new Set<number>([nodes[0]!])
  const queue = [nodes[0]!]
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const neighbor of link.get(queue[cursor]!) ?? []) {
      if (!seen.has(neighbor)) {
        seen.add(neighbor)
        queue.push(neighbor)
      }
    }
  }
  if (seen.size !== nodes.length) return true

  const boundaryIncident = (topology.vertexEdges[vertexIndex] ?? [])
    .filter((edgeIndex) => topology.edges[edgeIndex]?.boundary).length
  const degrees = nodes.map((node) => link.get(node)?.size ?? 0)
  if (boundaryIncident === 0) return degrees.some((degree) => degree !== 2)
  if (boundaryIncident !== 2) return true
  return degrees.filter((degree) => degree === 1).length !== 2
    || degrees.some((degree) => degree !== 1 && degree !== 2)
}

function validateTopology(topology: MeshTopology): ManifoldValidation {
  let boundaryEdges = 0
  let nonManifoldEdges = 0
  let inconsistentWindingEdges = 0
  for (const edge of topology.edges) {
    if (edge.boundary) boundaryEdges += 1
    if (edge.nonManifold) nonManifoldEdges += 1
    if (edge.faces.length === 2 && edge.faceDirections[0] === edge.faceDirections[1]) inconsistentWindingEdges += 1
  }
  let nonManifoldVertices = 0
  let isolatedVertices = 0
  for (const vertex of topology.vertices) {
    if (!(topology.vertexFaces[vertex.index]?.length)) isolatedVertices += 1
    else if (isNonManifoldVertex(topology, vertex.index)) nonManifoldVertices += 1
  }
  const invalidFaces = topology.issues.invalidFaces + (topology.issues.trailingIndexValues ? 1 : 0)
  const malformedPositions = topology.issues.trailingPositionValues ? 1 : 0
  const manifold = invalidFaces === 0
    && malformedPositions === 0
    && topology.issues.degenerateFaces === 0
    && topology.issues.duplicateFaces === 0
    && nonManifoldEdges === 0
    && nonManifoldVertices === 0
    && inconsistentWindingEdges === 0
  return {
    vertexCount: topology.vertices.length,
    edgeCount: topology.edges.length,
    faceCount: topology.faces.length,
    boundaryEdges,
    nonManifoldEdges,
    nonManifoldVertices,
    inconsistentWindingEdges,
    isolatedVertices,
    connectedFaceComponents: connectedComponentCount(topology),
    invalidFaces,
    degenerateFaces: topology.issues.degenerateFaces + malformedPositions,
    duplicateFaces: topology.issues.duplicateFaces,
    manifold,
    watertight: manifold && topology.faces.length > 0 && boundaryEdges === 0 && isolatedVertices === 0,
  }
}

export function validateManifold(mesh: ComponentMesh): ManifoldValidation {
  return validateTopology(extractMeshTopology(mesh))
}

function indicesInRange(indices: Iterable<number>, maximum: number) {
  const valid = new Set<number>()
  let invalid = false
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= maximum) invalid = true
    else valid.add(index)
  }
  return { valid, invalid }
}

export function convertSelection(
  topology: MeshTopology,
  selection: ComponentSelection,
  targetMode: ComponentMode,
  strategy: SelectionConversion = 'contained',
): ComponentSelection {
  const maximum = selection.mode === 'vertex'
    ? topology.vertices.length
    : selection.mode === 'edge' ? topology.edges.length : topology.faces.length
  const source = indicesInRange(selection.indices, maximum).valid
  if (selection.mode === targetMode) return { mode: targetMode, indices: new Set(source) }

  const result = new Set<number>()
  if (targetMode === 'vertex') {
    if (selection.mode === 'edge') {
      for (const edgeIndex of source) for (const vertex of topology.edges[edgeIndex]?.vertices ?? []) result.add(vertex)
    } else {
      for (const faceIndex of source) for (const vertex of topology.faces[faceIndex]?.vertices ?? []) result.add(vertex)
    }
  } else if (targetMode === 'edge') {
    if (selection.mode === 'face') {
      for (const faceIndex of source) for (const edge of topology.faces[faceIndex]?.edges ?? []) result.add(edge)
    } else {
      for (const edge of topology.edges) {
        const selectedCount = edge.vertices.filter((vertex) => source.has(vertex)).length
        if ((strategy === 'contained' && selectedCount === 2) || (strategy === 'touching' && selectedCount > 0)) result.add(edge.index)
      }
    }
  } else if (selection.mode === 'edge') {
    for (const face of topology.faces) {
      const selectedCount = face.edges.filter((edge) => source.has(edge)).length
      if ((strategy === 'contained' && selectedCount === 3) || (strategy === 'touching' && selectedCount > 0)) result.add(face.index)
    }
  } else {
    for (const face of topology.faces) {
      const selectedCount = face.vertices.filter((vertex) => source.has(vertex)).length
      if ((strategy === 'contained' && selectedCount === 3) || (strategy === 'touching' && selectedCount > 0)) result.add(face.index)
    }
  }
  return { mode: targetMode, indices: result }
}

function adjacentComponents(topology: MeshTopology, mode: ComponentMode, index: number) {
  const adjacent = new Set<number>()
  if (mode === 'vertex') {
    for (const edgeIndex of topology.vertexEdges[index] ?? []) {
      for (const vertex of topology.edges[edgeIndex]?.vertices ?? []) if (vertex !== index) adjacent.add(vertex)
    }
  } else if (mode === 'edge') {
    const edge = topology.edges[index]
    if (edge) {
      for (const vertex of edge.vertices) {
        for (const edgeIndex of topology.vertexEdges[vertex] ?? []) if (edgeIndex !== index) adjacent.add(edgeIndex)
      }
    }
  } else {
    for (const neighbor of topology.faceNeighbors[index] ?? []) adjacent.add(neighbor)
  }
  return adjacent
}

export function growSelection(topology: MeshTopology, selection: ComponentSelection, steps = 1): ComponentSelection {
  let result = convertSelection(topology, selection, selection.mode).indices
  for (let step = 0; step < Math.max(0, Math.floor(steps)); step += 1) {
    const grown = new Set(result)
    for (const index of result) for (const neighbor of adjacentComponents(topology, selection.mode, index)) grown.add(neighbor)
    result = grown
  }
  return { mode: selection.mode, indices: result }
}

function touchesMeshBoundary(topology: MeshTopology, mode: ComponentMode, index: number) {
  if (mode === 'vertex') return (topology.vertexEdges[index] ?? []).some((edge) => topology.edges[edge]?.boundary)
  if (mode === 'edge') return topology.edges[index]?.boundary ?? true
  return topology.faces[index]?.edges.some((edge) => topology.edges[edge]?.boundary) ?? true
}

export function shrinkSelection(topology: MeshTopology, selection: ComponentSelection, steps = 1): ComponentSelection {
  let result = convertSelection(topology, selection, selection.mode).indices
  for (let step = 0; step < Math.max(0, Math.floor(steps)); step += 1) {
    const shrunk = new Set<number>()
    for (const index of result) {
      const neighbors = adjacentComponents(topology, selection.mode, index)
      if (!touchesMeshBoundary(topology, selection.mode, index) && [...neighbors].every((neighbor) => result.has(neighbor))) shrunk.add(index)
    }
    result = shrunk
  }
  return { mode: selection.mode, indices: result }
}

/** Selects every same-mode component connected to one or more selection seeds. */
export function selectLinked(topology: MeshTopology, selection: ComponentSelection): ComponentSelection {
  const maximum = selection.mode === 'vertex'
    ? topology.vertices.length
    : selection.mode === 'edge' ? topology.edges.length : topology.faces.length
  const linked = indicesInRange(selection.indices, maximum).valid
  const queue = [...linked]
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const neighbor of adjacentComponents(topology, selection.mode, queue[cursor]!)) {
      if (linked.has(neighbor)) continue
      linked.add(neighbor)
      queue.push(neighbor)
    }
  }
  return { mode: selection.mode, indices: linked }
}

/**
 * Selects valid open-mesh boundaries. With a seed selection, only boundaries on
 * connected mesh islands containing those seeds are returned. Vertices and edges
 * are exact boundary components; face mode returns the faces incident to them.
 */
export function selectBoundary(topology: MeshTopology, selection?: ComponentSelection): ComponentSelection {
  const mode = selection?.mode ?? 'edge'
  let island: ComponentSelection | undefined
  if (selection?.indices.size) island = selectLinked(topology, selection)

  const boundaryEdges = topology.edges.filter((edge) => {
    if (!edge.boundary || edge.nonManifold) return false
    if (!island) return true
    if (island.mode === 'vertex') return edge.vertices.some((vertex) => island!.indices.has(vertex))
    if (island.mode === 'edge') return island.indices.has(edge.index)
    return edge.faces.some((face) => island!.indices.has(face))
  })

  if (mode === 'edge') return { mode, indices: new Set(boundaryEdges.map((edge) => edge.index)) }
  if (mode === 'vertex') return {
    mode,
    indices: new Set(boundaryEdges.flatMap((edge) => [...edge.vertices])),
  }
  return {
    mode,
    indices: new Set(boundaryEdges.flatMap((edge) => edge.faces)),
  }
}

class MinimumQueue {
  private values: Array<{ index: number; distance: number }> = []

  push(index: number, distanceValue: number) {
    this.values.push({ index, distance: distanceValue })
    let child = this.values.length - 1
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2)
      if (this.values[parent]!.distance <= distanceValue) break
      this.values[child] = this.values[parent]!
      child = parent
    }
    this.values[child] = { index, distance: distanceValue }
  }

  pop() {
    const first = this.values[0]
    const last = this.values.pop()
    if (!first || !last || !this.values.length) return first
    let parent = 0
    while (true) {
      const left = parent * 2 + 1
      const right = left + 1
      if (left >= this.values.length) break
      const child = right < this.values.length && this.values[right]!.distance < this.values[left]!.distance ? right : left
      if (this.values[child]!.distance >= last.distance) break
      this.values[parent] = this.values[child]!
      parent = child
    }
    this.values[parent] = last
    return first
  }

  get size() { return this.values.length }
}

/**
 * Finds the lowest-cost connected vertex or edge path. Vertex steps use mesh-edge
 * length. Edge steps use half the length of each incident edge, which measures
 * travel between their midpoints through the shared vertex.
 */
export function shortestComponentPath(
  topology: MeshTopology,
  mode: PathComponentMode,
  startIndex: number,
  endIndex: number,
): ComponentPathResult {
  const maximum = mode === 'vertex' ? topology.vertices.length : topology.edges.length
  if (![startIndex, endIndex].every((index) => Number.isInteger(index) && index >= 0 && index < maximum)) {
    return { ok: false, reason: `The ${mode} path seeds must reference existing components.` }
  }
  if (startIndex === endIndex) {
    return { ok: true, selection: { mode, indices: new Set([startIndex]) }, path: [startIndex], cost: 0 }
  }

  const costs = new Array(maximum).fill(Number.POSITIVE_INFINITY) as number[]
  const previous = new Array(maximum).fill(-1) as number[]
  const queue = new MinimumQueue()
  const edgeLengths = mode === 'edge'
    ? topology.edges.map((edge) => distance(topology.vertices[edge.vertices[0]]!.position, topology.vertices[edge.vertices[1]]!.position))
    : []
  costs[startIndex] = 0
  queue.push(startIndex, 0)

  while (queue.size) {
    const current = queue.pop()!
    if (current.distance !== costs[current.index]) continue
    if (current.index === endIndex) break

    if (mode === 'vertex') {
      for (const edgeIndex of topology.vertexEdges[current.index] ?? []) {
        const edge = topology.edges[edgeIndex]!
        const neighbor = edge.vertices[0] === current.index ? edge.vertices[1] : edge.vertices[0]
        const stepCost = distance(topology.vertices[current.index]!.position, topology.vertices[neighbor]!.position)
        const candidate = current.distance + stepCost
        if (candidate + Number.EPSILON >= costs[neighbor]!) continue
        costs[neighbor] = candidate
        previous[neighbor] = current.index
        queue.push(neighbor, candidate)
      }
    } else {
      const neighbors = adjacentComponents(topology, 'edge', current.index)
      for (const neighbor of neighbors) {
        const stepCost = (edgeLengths[current.index]! + edgeLengths[neighbor]!) / 2
        const candidate = current.distance + stepCost
        if (candidate + Number.EPSILON >= costs[neighbor]!) continue
        costs[neighbor] = candidate
        previous[neighbor] = current.index
        queue.push(neighbor, candidate)
      }
    }
  }

  if (!Number.isFinite(costs[endIndex])) return { ok: false, reason: `No connected ${mode} path exists between the seeds.` }
  const path = [endIndex]
  while (path[path.length - 1] !== startIndex) {
    const parent = previous[path[path.length - 1]!]!
    if (parent < 0) return { ok: false, reason: `No connected ${mode} path exists between the seeds.` }
    path.push(parent)
  }
  path.reverse()
  return { ok: true, selection: { mode, indices: new Set(path) }, path, cost: costs[endIndex]! }
}

interface ReconstructedQuad {
  id: number
  faces: readonly [number, number]
  diagonal: number
  boundaryEdges: readonly [number, number, number, number]
  oppositePairs: readonly [readonly [number, number], readonly [number, number]]
}

function edgeIsTopologyUnsafe(edge: TopologyEdge) {
  return edge.nonManifold
    || edge.faces.length > 2
    || (edge.faces.length === 2 && edge.faceDirections[0] === edge.faceDirections[1])
}

function reconstructedQuad(
  topology: MeshTopology,
  diagonal: TopologyEdge,
  minimumNormalDot: number,
): ReconstructedQuad | null {
  if (edgeIsTopologyUnsafe(diagonal) || diagonal.faces.length !== 2) return null
  const firstFace = topology.faces[diagonal.faces[0]!]
  const secondFace = topology.faces[diagonal.faces[1]!]
  if (!firstFace || !secondFace || dot(firstFace.normal, secondFace.normal) < minimumNormalDot) return null

  const boundary = [...firstFace.edges, ...secondFace.edges].filter((edge) => edge !== diagonal.index)
  if (boundary.length !== 4 || new Set(boundary).size !== 4) return null
  const boundaryEdges = boundary.map((edge) => topology.edges[edge]!)
  const vertexNeighbors = new Map<number, number[]>()
  for (const edge of boundaryEdges) {
    for (const [vertex, neighbor] of [[edge.vertices[0], edge.vertices[1]], [edge.vertices[1], edge.vertices[0]]] as const) {
      const neighbors = vertexNeighbors.get(vertex) ?? []
      neighbors.push(neighbor)
      vertexNeighbors.set(vertex, neighbors)
    }
  }
  if (vertexNeighbors.size !== 4 || [...vertexNeighbors.values()].some((neighbors) => neighbors.length !== 2)) return null

  const start = Math.min(...vertexNeighbors.keys())
  const cycle = [start]
  let previous = -1
  let current = start
  for (let step = 0; step < 4; step += 1) {
    const candidates = vertexNeighbors.get(current)!
    const next = step === 0
      ? Math.min(...candidates)
      : candidates[0] === previous ? candidates[1]! : candidates[0]!
    cycle.push(next)
    previous = current
    current = next
  }
  if (cycle[4] !== start || new Set(cycle.slice(0, 4)).size !== 4) return null

  const normal = normalized({
    x: firstFace.normal.x + secondFace.normal.x,
    y: firstFace.normal.y + secondFace.normal.y,
    z: firstFace.normal.z + secondFace.normal.z,
  })
  let turnSign = 0
  for (let index = 0; index < 4; index += 1) {
    const before = topology.vertices[cycle[index]!]!.position
    const corner = topology.vertices[cycle[(index + 1) % 4]!]!.position
    const after = topology.vertices[cycle[(index + 2) % 4]!]!.position
    const turn = dot(cross(subtract(corner, before), subtract(after, corner)), normal)
    if (Math.abs(turn) <= topology.tolerance ** 2) return null
    const sign = Math.sign(turn)
    if (turnSign && sign !== turnSign) return null
    turnSign = sign
  }

  const oppositePairs: Array<readonly [number, number]> = []
  for (let first = 0; first < boundaryEdges.length; first += 1) {
    for (let second = first + 1; second < boundaryEdges.length; second += 1) {
      if (!boundaryEdges[first]!.vertices.some((vertex) => boundaryEdges[second]!.vertices.includes(vertex))) {
        oppositePairs.push([boundaryEdges[first]!.index, boundaryEdges[second]!.index])
      }
    }
  }
  if (oppositePairs.length !== 2) return null
  return {
    id: diagonal.index,
    faces: [firstFace.index, secondFace.index],
    diagonal: diagonal.index,
    boundaryEdges: boundary as [number, number, number, number],
    oppositePairs: oppositePairs as [readonly [number, number], readonly [number, number]],
  }
}

/**
 * Reconstructs mutually unambiguous coplanar triangle pairs as local quads, then
 * follows opposite quad sides. Ambiguous triangle pairing is never guessed.
 */
export function selectEdgeLoop(
  topology: MeshTopology,
  seedEdgeIndex: number,
  options: EdgeLoopOptions = {},
): EdgeLoopResult {
  if (!Number.isInteger(seedEdgeIndex) || seedEdgeIndex < 0 || seedEdgeIndex >= topology.edges.length) {
    return { ok: false, reason: 'The edge-loop seed must reference an existing edge.' }
  }
  const angle = options.coplanarAngleDegrees ?? 1
  if (!Number.isFinite(angle) || angle < 0 || angle >= 90) throw new RangeError('Coplanar angle must be finite and between 0 and 90 degrees.')
  const seed = topology.edges[seedEdgeIndex]!
  if (edgeIsTopologyUnsafe(seed)) return { ok: false, reason: 'Edge loops require consistently wound manifold topology at the seed.' }

  const minimumNormalDot = Math.cos(angle * Math.PI / 180)
  const candidates = topology.edges
    .map((edge) => reconstructedQuad(topology, edge, minimumNormalDot))
    .filter((candidate): candidate is ReconstructedQuad => candidate !== null)
  const candidatesByFace = Array.from({ length: topology.faces.length }, () => [] as ReconstructedQuad[])
  for (const candidate of candidates) for (const face of candidate.faces) candidatesByFace[face]!.push(candidate)

  const accepted: ReconstructedQuad[] = []
  const blockedEdges = new Set<number>()
  const ambiguousDiagonals = new Set<number>()
  for (const candidate of candidates) {
    const uniquePair = candidate.faces.every((face) => candidatesByFace[face]!.length === 1)
    const safeBoundary = candidate.boundaryEdges.every((edge) => !edgeIsTopologyUnsafe(topology.edges[edge]!))
    if (uniquePair && safeBoundary) accepted.push(candidate)
    else {
      ambiguousDiagonals.add(candidate.diagonal)
      for (const edge of candidate.boundaryEdges) blockedEdges.add(edge)
    }
  }

  if (ambiguousDiagonals.has(seedEdgeIndex)) {
    return { ok: false, reason: 'The seed belongs to an ambiguous coplanar triangle region; its original quad pairing cannot be inferred.' }
  }
  if (accepted.some((candidate) => candidate.diagonal === seedEdgeIndex)) {
    return { ok: false, reason: 'The seed is a reconstructed quad diagonal. Select one of the quad side edges instead.' }
  }

  const rawLinks = new Map<string, { edges: readonly [number, number]; quads: Set<number> }>()
  for (const quad of accepted) {
    for (const pair of quad.oppositePairs) {
      const key = edgeKey(pair[0], pair[1])
      const link = rawLinks.get(key) ?? { edges: pair, quads: new Set<number>() }
      link.quads.add(quad.id)
      rawLinks.set(key, link)
    }
  }

  const adjacency = new Map<number, Set<number>>()
  const quadByLink = new Map<string, number>()
  for (const [key, link] of rawLinks) {
    if (link.quads.size !== 1) {
      blockedEdges.add(link.edges[0])
      blockedEdges.add(link.edges[1])
      continue
    }
    const first = adjacency.get(link.edges[0]) ?? new Set<number>()
    const second = adjacency.get(link.edges[1]) ?? new Set<number>()
    first.add(link.edges[1])
    second.add(link.edges[0])
    adjacency.set(link.edges[0], first)
    adjacency.set(link.edges[1], second)
    quadByLink.set(key, [...link.quads][0]!)
  }

  if (!(adjacency.get(seedEdgeIndex)?.size)) {
    const reason = blockedEdges.has(seedEdgeIndex)
      ? 'The edge loop is ambiguous at the seed and was not guessed.'
      : 'No unambiguous reconstructed quad strip passes through the seed edge.'
    return { ok: false, reason }
  }
  if (blockedEdges.has(seedEdgeIndex)) return { ok: false, reason: 'The edge loop is ambiguous at the seed and was not guessed.' }

  const component = new Set([seedEdgeIndex])
  const queue = [seedEdgeIndex]
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const currentEdge = queue[cursor]!
    if (currentEdge !== seedEdgeIndex && blockedEdges.has(currentEdge)) continue
    for (const neighbor of adjacency.get(currentEdge) ?? []) {
      if (component.has(neighbor)) continue
      component.add(neighbor)
      queue.push(neighbor)
    }
  }
  const componentNeighbors = (edge: number) => [...(adjacency.get(edge) ?? [])].filter((neighbor) => component.has(neighbor))
  if ([...component].some((edge) => componentNeighbors(edge).length > 2)) {
    return { ok: false, reason: 'The reconstructed quad strip branches, so a unique edge loop cannot be selected.' }
  }

  const endpoints = [...component].filter((edge) => componentNeighbors(edge).length <= 1).sort((a, b) => a - b)
  const closed = endpoints.length === 0 && component.size >= 3
  if (!closed && endpoints.length !== 2) return { ok: false, reason: 'The reconstructed quad strip has ambiguous connectivity.' }
  const orderedEdges: number[] = []
  const visitedEdges = new Set<number>()
  let previous = -1
  let current = closed ? seedEdgeIndex : endpoints[0]!
  while (!visitedEdges.has(current)) {
    orderedEdges.push(current)
    visitedEdges.add(current)
    const neighbors = componentNeighbors(current).filter((edge) => edge !== previous).sort((a, b) => a - b)
    const next = neighbors[0]
    if (next === undefined || (closed && next === orderedEdges[0])) break
    previous = current
    current = next
  }
  if (orderedEdges.length !== component.size) return { ok: false, reason: 'The reconstructed edge loop could not be ordered uniquely.' }

  const usedQuads = new Set<number>()
  for (let index = 1; index < orderedEdges.length; index += 1) {
    const quad = quadByLink.get(edgeKey(orderedEdges[index - 1]!, orderedEdges[index]!))
    if (quad !== undefined) usedQuads.add(quad)
  }
  if (closed) {
    const quad = quadByLink.get(edgeKey(orderedEdges.at(-1)!, orderedEdges[0]!))
    if (quad !== undefined) usedQuads.add(quad)
  }
  const termination: EdgeLoopTermination = closed
    ? 'closed'
    : [...component].some((edge) => blockedEdges.has(edge)) ? 'ambiguous' : 'boundary'
  return {
    ok: true,
    selection: { mode: 'edge', indices: component },
    orderedEdges,
    closed,
    termination,
    reconstructedQuads: usedQuads.size,
  }
}

function softDistances(topology: MeshTopology, selected: Set<number>, mode: SoftSelectionDistance) {
  const distances = new Array(topology.vertices.length).fill(Number.POSITIVE_INFINITY) as number[]
  for (const vertex of selected) distances[vertex] = 0
  if (mode === 'euclidean') {
    const centers = [...selected].map((vertex) => topology.vertices[vertex]!.position)
    for (const vertex of topology.vertices) {
      if (!selected.has(vertex.index)) {
        distances[vertex.index] = centers.reduce((best, center) => Math.min(best, distance(vertex.position, center)), Number.POSITIVE_INFINITY)
      }
    }
    return distances
  }
  if (mode === 'topological') {
    const queue = [...selected]
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const vertex = queue[cursor]!
      for (const neighbor of adjacentComponents(topology, 'vertex', vertex)) {
        if (distances[neighbor]! > distances[vertex]! + 1) {
          distances[neighbor] = distances[vertex]! + 1
          queue.push(neighbor)
        }
      }
    }
    return distances
  }

  const queue = new MinimumQueue()
  for (const vertex of selected) queue.push(vertex, 0)
  while (queue.size) {
    const current = queue.pop()!
    if (current.distance !== distances[current.index]) continue
    for (const edgeIndex of topology.vertexEdges[current.index] ?? []) {
      const edge = topology.edges[edgeIndex]!
      const neighbor = edge.vertices[0] === current.index ? edge.vertices[1] : edge.vertices[0]
      const candidate = current.distance + distance(topology.vertices[current.index]!.position, topology.vertices[neighbor]!.position)
      if (candidate < distances[neighbor]!) {
        distances[neighbor] = candidate
        queue.push(neighbor, candidate)
      }
    }
  }
  return distances
}

function falloffWeight(falloff: SoftSelectionFalloff, normalizedDistance: number) {
  const value = clamp01(1 - normalizedDistance)
  if (falloff === 'constant') return normalizedDistance <= 1 ? 1 : 0
  if (falloff === 'linear') return value
  if (falloff === 'sharp') return value ** 3
  return value * value * (3 - 2 * value)
}

function softSelectionWeights(topology: MeshTopology, selected: Set<number>, options: SoftSelectionOptions) {
  if (options.radius !== undefined && !Number.isFinite(options.radius)) {
    throw new RangeError('Soft-selection radius must be finite.')
  }
  const weights = new Array(topology.vertices.length).fill(0) as number[]
  const radius = Math.max(0, options.radius ?? 0)
  const mask = options.useMask === false ? undefined : topology.mesh.mask

  if (!selected.size) return weights
  if (radius <= 0) {
    for (const vertex of selected) weights[vertex] = 1 - clamp01(mask?.[vertex] ?? 0)
    return weights
  }

  const distances = softDistances(topology, selected, options.distance ?? 'euclidean')
  for (const vertex of topology.vertices) {
    if (distances[vertex.index]! > radius) continue
    const influence = selected.has(vertex.index)
      ? 1
      : falloffWeight(options.falloff ?? 'smooth', distances[vertex.index]! / radius)
    weights[vertex.index] = influence * (1 - clamp01(mask?.[vertex.index] ?? 0))
  }
  return weights
}

function assertFiniteVector(vector: Vec3, label: string) {
  if (![vector.x, vector.y, vector.z].every(Number.isFinite)) throw new RangeError(`${label} must contain finite values.`)
}

function medianPoint(topology: MeshTopology, selected: Set<number>): Vec3 {
  if (!selected.size) return { x: 0, y: 0, z: 0 }
  const total = { x: 0, y: 0, z: 0 }
  for (const index of selected) {
    const point = topology.vertices[index]!.position
    total.x += point.x
    total.y += point.y
    total.z += point.z
  }
  return { x: total.x / selected.size, y: total.y / selected.size, z: total.z / selected.size }
}

function rotateEulerDegrees(vector: Vec3, rotation: Vec3): Vec3 {
  const xRadians = rotation.x * Math.PI / 180
  const yRadians = rotation.y * Math.PI / 180
  const zRadians = rotation.z * Math.PI / 180

  const xCosine = Math.cos(xRadians)
  const xSine = Math.sin(xRadians)
  const aroundX = {
    x: vector.x,
    y: vector.y * xCosine - vector.z * xSine,
    z: vector.y * xSine + vector.z * xCosine,
  }

  const yCosine = Math.cos(yRadians)
  const ySine = Math.sin(yRadians)
  const aroundY = {
    x: aroundX.x * yCosine + aroundX.z * ySine,
    y: aroundX.y,
    z: -aroundX.x * ySine + aroundX.z * yCosine,
  }

  const zCosine = Math.cos(zRadians)
  const zSine = Math.sin(zRadians)
  return {
    x: aroundY.x * zCosine - aroundY.y * zSine,
    y: aroundY.x * zSine + aroundY.y * zCosine,
    z: aroundY.z,
  }
}

function makeResult(mesh: ComponentMesh, createdVertices: number[] = [], selection?: ComponentSelection): MeshEditResult {
  const topology = extractMeshTopology(mesh)
  const diagnostics = validateTopology(topology)
  const remappedCreated = [...new Set(createdVertices
    .map((vertex) => topology.sourceVertexToVertex[vertex])
    .filter((vertex): vertex is number => vertex !== undefined))]
  const result: MeshEditResult = { mesh: topology.mesh, topology, diagnostics, createdVertices: remappedCreated }
  if (selection) {
    if (selection.mode === 'vertex') {
      result.selection = {
        mode: 'vertex',
        indices: new Set([...selection.indices]
          .map((vertex) => topology.sourceVertexToVertex[vertex])
          .filter((vertex): vertex is number => vertex !== undefined)),
      }
    } else result.selection = convertSelection(topology, selection, selection.mode)
  }
  return result
}

export function translateSelectedVertices(
  mesh: ComponentMesh,
  selectedVertexIndices: Iterable<number>,
  delta: Vec3,
  options: SoftSelectionOptions = {},
): TranslatedMeshEditResult {
  if (![delta.x, delta.y, delta.z].every(Number.isFinite)) throw new RangeError('Translation delta must contain finite values.')
  return transformSelectedVertices(mesh, selectedVertexIndices, { translation: delta }, options)
}

/**
 * Applies scale, then X/Y/Z Euler rotation, then translation. Every vertex is
 * interpolated from its source position to the fully transformed position using
 * the same soft-selection and sculpt-mask weights as translation.
 */
export function transformSelectedVertices(
  mesh: ComponentMesh,
  selectedVertexIndices: Iterable<number>,
  transform: VertexTransform,
  options: SoftSelectionOptions = {},
): TransformedMeshEditResult {
  const topology = extractMeshTopology(mesh)
  const selected = indicesInRange(selectedVertexIndices, topology.vertices.length).valid
  const translation = transform.translation ?? { x: 0, y: 0, z: 0 }
  const rotation = transform.rotation ?? { x: 0, y: 0, z: 0 }
  const scale = transform.scale ?? { x: 1, y: 1, z: 1 }
  assertFiniteVector(translation, 'Transform translation')
  assertFiniteVector(rotation, 'Transform rotation')
  assertFiniteVector(scale, 'Transform scale')

  const pivotOption = transform.pivot ?? 'median'
  if (typeof pivotOption === 'string' && pivotOption !== 'median') throw new RangeError('Transform pivot must be "median" or a finite point.')
  const pivot = pivotOption === 'median' ? medianPoint(topology, selected) : { ...pivotOption }
  assertFiniteVector(pivot, 'Transform pivot')

  const positions = [...topology.mesh.positions]
  const weights = softSelectionWeights(topology, selected, options)

  for (const vertex of topology.vertices) {
    const weight = weights[vertex.index]!
    const relative = {
      x: (vertex.position.x - pivot.x) * scale.x,
      y: (vertex.position.y - pivot.y) * scale.y,
      z: (vertex.position.z - pivot.z) * scale.z,
    }
    const rotated = rotateEulerDegrees(relative, rotation)
    const target = {
      x: pivot.x + rotated.x + translation.x,
      y: pivot.y + rotated.y + translation.y,
      z: pivot.z + rotated.z + translation.z,
    }
    positions[vertex.index * 3] = vertex.position.x + (target.x - vertex.position.x) * weight
    positions[vertex.index * 3 + 1] = vertex.position.y + (target.y - vertex.position.y) * weight
    positions[vertex.index * 3 + 2] = vertex.position.z + (target.z - vertex.position.z) * weight
  }
  const result = makeResult(
    meshWithMask(
      positions,
      [...topology.mesh.indices],
      topology.mesh.mask ? [...topology.mesh.mask] : undefined,
      topology.mesh.triangleMaterials,
    ),
    [],
    { mode: 'vertex', indices: selected },
  ) as TransformedMeshEditResult
  result.weights = weights
  result.pivot = pivot
  return result
}

function compactMesh(mesh: ComponentMesh) {
  const used = new Set(mesh.indices)
  const remap = new Array(Math.floor(mesh.positions.length / 3)).fill(-1) as number[]
  const positions: number[] = []
  const mask = mesh.mask ? [] as number[] : undefined
  for (let vertex = 0; vertex < remap.length; vertex += 1) {
    if (!used.has(vertex)) continue
    remap[vertex] = positions.length / 3
    positions.push(mesh.positions[vertex * 3]!, mesh.positions[vertex * 3 + 1]!, mesh.positions[vertex * 3 + 2]!)
    if (mask) mask.push(mesh.mask?.[vertex] ?? 0)
  }
  return {
    mesh: meshWithMask(positions, mesh.indices.map((vertex) => remap[vertex]!), mask),
    remap,
  }
}

function failure(reason: string, diagnostics?: ManifoldValidation): SafeMeshEditResult {
  return diagnostics ? { ok: false, reason, diagnostics } : { ok: false, reason }
}

function directedEdgeInFace(face: TopologyFace, edge: TopologyEdge): [number, number] | null {
  for (let corner = 0; corner < 3; corner += 1) {
    const from = face.vertices[corner]!
    const to = face.vertices[(corner + 1) % 3]!
    if ((from === edge.vertices[0] && to === edge.vertices[1]) || (from === edge.vertices[1] && to === edge.vertices[0])) return [from, to]
  }
  return null
}

export function extrudeFaces(
  mesh: ComponentMesh,
  faceIndices: Iterable<number>,
  options: ExtrudeFacesOptions = {},
): SafeMeshEditResult {
  const topology = extractMeshTopology(mesh)
  const inputDiagnostics = validateTopology(topology)
  if (!inputDiagnostics.watertight) return failure('Face extrusion requires a closed, consistently oriented two-manifold mesh.', inputDiagnostics)
  const checked = indicesInRange(faceIndices, topology.faces.length)
  if (checked.invalid) return failure('The face selection contains an invalid index.', inputDiagnostics)
  const selected = checked.valid
  if (!selected.size) return failure('Select at least one face to extrude.', inputDiagnostics)

  const first = selected.values().next().value as number
  const reached = new Set<number>([first])
  const queue = [first]
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const neighbor of topology.faceNeighbors[queue[cursor]!] ?? []) {
      if (selected.has(neighbor) && !reached.has(neighbor)) {
        reached.add(neighbor)
        queue.push(neighbor)
      }
    }
  }
  if (reached.size !== selected.size) return failure('Extrusion currently requires one edge-connected face region.', inputDiagnostics)

  const boundaryEdges = topology.edges.filter((edge) => edge.faces.filter((face) => selected.has(face)).length === 1)
  if (!boundaryEdges.length) return failure('The selected region has no boundary to extrude.', inputDiagnostics)

  let offset: Vec3
  if (options.offset) offset = { ...options.offset }
  else {
    const average = { x: 0, y: 0, z: 0 }
    for (const faceIndex of selected) {
      const face = topology.faces[faceIndex]!
      average.x += face.normal.x * face.area
      average.y += face.normal.y * face.area
      average.z += face.normal.z * face.area
    }
    const direction = normalized(average)
    const distanceValue = options.distance ?? 1
    offset = { x: direction.x * distanceValue, y: direction.y * distanceValue, z: direction.z * distanceValue }
  }
  if (![offset.x, offset.y, offset.z].every(Number.isFinite) || length(offset) <= topology.tolerance) {
    return failure('Extrusion offset must be finite and larger than the mesh tolerance.', inputDiagnostics)
  }

  const positions = [...topology.mesh.positions]
  const mask = topology.mesh.mask ? [...topology.mesh.mask] : undefined
  const selectedVertices = new Set<number>()
  for (const faceIndex of selected) for (const vertex of topology.faces[faceIndex]!.vertices) selectedVertices.add(vertex)
  const duplicate = new Map<number, number>()
  for (const vertex of selectedVertices) {
    const point = topology.vertices[vertex]!.position
    const created = positions.length / 3
    positions.push(point.x + offset.x, point.y + offset.y, point.z + offset.z)
    if (mask) mask.push(topology.mesh.mask?.[vertex] ?? 0)
    duplicate.set(vertex, created)
  }

  const indices: number[] = []
  for (const face of topology.faces) if (!selected.has(face.index)) indices.push(...face.vertices)
  const capStart = indices.length / 3
  const sortedSelection = [...selected].sort((a, b) => a - b)
  for (const faceIndex of sortedSelection) {
    const face = topology.faces[faceIndex]!
    indices.push(duplicate.get(face.vertices[0])!, duplicate.get(face.vertices[1])!, duplicate.get(face.vertices[2])!)
  }
  for (const edge of boundaryEdges) {
    const selectedFace = edge.faces.find((face) => selected.has(face))!
    const directed = directedEdgeInFace(topology.faces[selectedFace]!, edge)
    if (!directed) return failure('Could not orient an extrusion boundary edge.', inputDiagnostics)
    const [from, to] = directed
    const newFrom = duplicate.get(from)!
    const newTo = duplicate.get(to)!
    indices.push(from, to, newTo, from, newTo, newFrom)
  }

  const uncompact = meshWithMask(positions, indices, mask)
  const compacted = compactMesh(uncompact)
  const createdVertices = [...duplicate.values()].map((vertex) => compacted.remap[vertex]!).filter((vertex) => vertex >= 0)
  const capSelection = new Set(Array.from({ length: sortedSelection.length }, (_, index) => capStart + index))
  const result = makeResult(compacted.mesh, createdVertices, { mode: 'face', indices: capSelection })
  if (!result.diagnostics.watertight) return failure('Extrusion would create invalid or open topology.', result.diagnostics)
  return { ok: true, result }
}

export function insetFace(mesh: ComponentMesh, faceIndex: number, amount = 0.2): SafeMeshEditResult {
  const topology = extractMeshTopology(mesh)
  const inputDiagnostics = validateTopology(topology)
  if (!inputDiagnostics.watertight) return failure('Face inset requires a closed, consistently oriented two-manifold mesh.', inputDiagnostics)
  if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= topology.faces.length) return failure('The face index is invalid.', inputDiagnostics)
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1) return failure('Inset amount must be greater than 0 and less than 1.', inputDiagnostics)

  const face = topology.faces[faceIndex]!
  const positions = [...topology.mesh.positions]
  const mask = topology.mesh.mask ? [...topology.mesh.mask] : undefined
  const inner: number[] = []
  for (const vertex of face.vertices) {
    const point = topology.vertices[vertex]!.position
    inner.push(positions.length / 3)
    positions.push(
      point.x + (face.centroid.x - point.x) * amount,
      point.y + (face.centroid.y - point.y) * amount,
      point.z + (face.centroid.z - point.z) * amount,
    )
    if (mask) mask.push(topology.mesh.mask?.[vertex] ?? 0)
  }

  const indices: number[] = []
  for (const existing of topology.faces) if (existing.index !== faceIndex) indices.push(...existing.vertices)
  const capFace = indices.length / 3
  indices.push(inner[0]!, inner[1]!, inner[2]!)
  for (let corner = 0; corner < 3; corner += 1) {
    const from = face.vertices[corner]!
    const to = face.vertices[(corner + 1) % 3]!
    const newFrom = inner[corner]!
    const newTo = inner[(corner + 1) % 3]!
    indices.push(from, to, newTo, from, newTo, newFrom)
  }

  const result = makeResult(meshWithMask(positions, indices, mask), inner, { mode: 'face', indices: new Set([capFace]) })
  if (!result.diagnostics.watertight) return failure('Inset would create invalid topology.', result.diagnostics)
  return { ok: true, result }
}

export function deleteFacesSafe(mesh: ComponentMesh, faceIndices: Iterable<number>): SafeMeshEditResult {
  const topology = extractMeshTopology(mesh)
  const inputDiagnostics = validateTopology(topology)
  if (!inputDiagnostics.manifold) return failure('Deletion requires a valid manifold input mesh.', inputDiagnostics)
  const checked = indicesInRange(faceIndices, topology.faces.length)
  if (checked.invalid) return failure('The face selection contains an invalid index.', inputDiagnostics)
  if (!checked.valid.size) return failure('Select at least one face to delete.', inputDiagnostics)
  if (checked.valid.size === topology.faces.length) return failure('Deleting every face would leave no mesh.', inputDiagnostics)

  const indices = topology.faces.filter((face) => !checked.valid.has(face.index)).flatMap((face) => [...face.vertices])
  const compacted = compactMesh(meshWithMask([...topology.mesh.positions], indices, topology.mesh.mask ? [...topology.mesh.mask] : undefined))
  const result = makeResult(compacted.mesh)
  if (!result.diagnostics.manifold || !result.diagnostics.faceCount) return failure('Deletion would create non-manifold topology.', result.diagnostics)
  return { ok: true, result }
}

/**
 * Conservative triangle-mesh dissolve: a closed valence-three vertex is replaced by
 * one triangle. More general dissolves require persistent n-gon support and are refused.
 */
export function dissolveVertexSafe(mesh: ComponentMesh, vertexIndex: number): SafeMeshEditResult {
  const topology = extractMeshTopology(mesh)
  const inputDiagnostics = validateTopology(topology)
  if (!inputDiagnostics.watertight) return failure('Vertex dissolve requires a closed, consistently oriented two-manifold mesh.', inputDiagnostics)
  if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= topology.vertices.length) return failure('The vertex index is invalid.', inputDiagnostics)
  const incidentFaces = topology.vertexFaces[vertexIndex] ?? []
  const neighbors = new Set<number>()
  for (const edgeIndex of topology.vertexEdges[vertexIndex] ?? []) {
    for (const vertex of topology.edges[edgeIndex]!.vertices) if (vertex !== vertexIndex) neighbors.add(vertex)
  }
  if (incidentFaces.length !== 3 || neighbors.size !== 3) return failure('Only valence-three vertices can be safely dissolved in a triangle mesh.', inputDiagnostics)

  const boundaryDirections: Array<[number, number]> = []
  for (const faceIndex of incidentFaces) {
    const face = topology.faces[faceIndex]!
    let found: [number, number] | null = null
    for (let corner = 0; corner < 3; corner += 1) {
      const from = face.vertices[corner]!
      const to = face.vertices[(corner + 1) % 3]!
      if (from !== vertexIndex && to !== vertexIndex) found = [from, to]
    }
    if (!found) return failure('Could not determine the dissolve boundary.', inputDiagnostics)
    boundaryDirections.push(found)
  }
  const cycle = [boundaryDirections[0]![0], boundaryDirections[0]![1]]
  while (cycle.length < 4) {
    const next = boundaryDirections.find(([from]) => from === cycle[cycle.length - 1])
    if (!next) return failure('The dissolve boundary is not a consistently oriented loop.', inputDiagnostics)
    cycle.push(next[1])
  }
  if (cycle[3] !== cycle[0] || new Set(cycle.slice(0, 3)).size !== 3) return failure('The dissolve boundary is invalid.', inputDiagnostics)
  const replacement: [number, number, number] = [cycle[0]!, cycle[1]!, cycle[2]!]
  const replacementKey = faceKey(...replacement)
  if (topology.faces.some((face) => !incidentFaces.includes(face.index) && faceKey(...face.vertices) === replacementKey)) {
    return failure('Dissolving this vertex would duplicate an existing face.', inputDiagnostics)
  }

  const indices = topology.faces.filter((face) => !incidentFaces.includes(face.index)).flatMap((face) => [...face.vertices])
  const replacementFace = indices.length / 3
  indices.push(...replacement)
  const compacted = compactMesh(meshWithMask([...topology.mesh.positions], indices, topology.mesh.mask ? [...topology.mesh.mask] : undefined))
  const result = makeResult(compacted.mesh, [], { mode: 'face', indices: new Set([replacementFace]) })
  if (!result.diagnostics.watertight) return failure('Dissolve would create invalid topology.', result.diagnostics)
  return { ok: true, result }
}

export function faceNormal(source: ComponentMesh | MeshTopology, faceIndex: number): Vec3 {
  const topology = 'faces' in source ? source : extractMeshTopology(source)
  const normal = topology.faces[faceIndex]?.normal
  if (!normal) throw new RangeError(`Face ${faceIndex} does not exist.`)
  return { ...normal }
}

export function faceCentroid(source: ComponentMesh | MeshTopology, faceIndex: number): Vec3 {
  const topology = 'faces' in source ? source : extractMeshTopology(source)
  const centroid = topology.faces[faceIndex]?.centroid
  if (!centroid) throw new RangeError(`Face ${faceIndex} does not exist.`)
  return { ...centroid }
}

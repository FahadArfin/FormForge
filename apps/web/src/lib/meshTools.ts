import type { ModelNode } from '@formforge/model'

export type MeshData = NonNullable<ModelNode['mesh']>

export interface MeshDiagnostics {
  inputVertexCount: number
  inputTriangleCount: number
  vertexCount: number
  triangleCount: number
  invalidTriangles: number
  degenerateTriangles: number
  duplicateTriangles: number
  boundaryEdges: number
  nonManifoldEdges: number
  windingConflicts: number
  watertight: boolean
}

/** Cleanup welds coordinates to a 0.00001 mm grid; inspection may request exact welding. */
export const MESH_WELD_TOLERANCE = 1e-5
const positionKey = (x: number, y: number, z: number, tolerance: number) => tolerance > 0
  ? `${Math.round(x / tolerance)},${Math.round(y / tolerance)},${Math.round(z / tolerance)}` : `${x},${y},${z}`
const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`

function normalizeMesh(mesh: MeshData, tolerance: number) {
  const positions: number[] = [], mask: number[] = [], remap: (number | undefined)[] = []
  const canonical = new Map<string, number>()
  for (let index = 0; index + 2 < mesh.positions.length; index += 3) {
    const x = mesh.positions[index]!, y = mesh.positions[index + 1]!, z = mesh.positions[index + 2]!
    if (![x, y, z].every(Number.isFinite)) { remap.push(undefined); continue }
    const key = positionKey(x, y, z, tolerance)
    let target = canonical.get(key)
    if (target === undefined) {
      target = positions.length / 3
      canonical.set(key, target)
      positions.push(x, y, z)
      mask.push(0)
    }
    // Welding must never turn a protected vertex into an unprotected one.
    const weight = mesh.mask?.[index / 3]
    if (mesh.mask) mask[target] = Math.max(mask[target]!, Number.isFinite(weight) ? Math.max(0, Math.min(1, weight!)) : 1)
    remap.push(target)
  }

  const indices: number[] = [], faceRemap = new Map<number, number>()
  const faces = new Set<string>()
  let invalidTriangles = mesh.indices.length % 3 ? 1 : 0, degenerateTriangles = 0, duplicateTriangles = 0
  for (let offset = 0; offset + 2 < mesh.indices.length; offset += 3) {
    const source = mesh.indices.slice(offset, offset + 3)
    if (source.some(index => !Number.isInteger(index) || index < 0 || remap[index] === undefined)) { invalidTriangles++; continue }
    const a = remap[source[0]!]!, b = remap[source[1]!]!, c = remap[source[2]!]!
    if (a === b || b === c || a === c) { degenerateTriangles++; continue }
    const ax = positions[a * 3]!, ay = positions[a * 3 + 1]!, az = positions[a * 3 + 2]!
    const abx = positions[b * 3]! - ax, aby = positions[b * 3 + 1]! - ay, abz = positions[b * 3 + 2]! - az
    const acx = positions[c * 3]! - ax, acy = positions[c * 3 + 1]! - ay, acz = positions[c * 3 + 2]! - az
    const cross = Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx)
    // A relative angular test has consistent units and preserves small valid faces.
    if (!Number.isFinite(cross) || cross <= Number.EPSILON * 8 * Math.hypot(abx, aby, abz) * Math.hypot(acx, acy, acz)) { degenerateTriangles++; continue }
    const faceKey = [a, b, c].sort((left, right) => left - right).join(':')
    if (faces.has(faceKey)) { duplicateTriangles++; continue }
    faces.add(faceKey)
    faceRemap.set(offset / 3, indices.length / 3)
    indices.push(a, b, c)
  }
  const cleaned: MeshData = { positions, indices }
  if (mesh.mask !== undefined) cleaned.mask = mask
  if (mesh.triangleMaterials !== undefined) cleaned.triangleMaterials = mesh.triangleMaterials.map(assignment => ({
    materialId: assignment.materialId,
    triangleIndices: assignment.triangleIndices.flatMap(index => faceRemap.has(index) ? [faceRemap.get(index)!] : []),
  })).filter(assignment => assignment.triangleIndices.length)
  return { mesh: cleaned, invalidTriangles, degenerateTriangles, duplicateTriangles }
}

export function analyzeMesh(mesh: MeshData, tolerance = MESH_WELD_TOLERANCE): MeshDiagnostics {
  const normalized = normalizeMesh(mesh, tolerance)
  const edges = new Map<string, { count: number; direction: number }>()
  for (let offset = 0; offset < normalized.mesh.indices.length; offset += 3) {
    const a = normalized.mesh.indices[offset]!, b = normalized.mesh.indices[offset + 1]!, c = normalized.mesh.indices[offset + 2]!
    for (const [u, v] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const key = edgeKey(u, v), edge = edges.get(key) ?? { count: 0, direction: 0 }
      edge.count++; edge.direction += u < v ? 1 : -1; edges.set(key, edge)
    }
  }
  let boundaryEdges = 0, nonManifoldEdges = 0, windingConflicts = 0
  for (const edge of edges.values()) {
    if (edge.count === 1) boundaryEdges++
    else if (edge.count > 2) nonManifoldEdges++
    else if (edge.direction !== 0) windingConflicts++
  }
  return {
    inputVertexCount: mesh.positions.length / 3, inputTriangleCount: Math.ceil(mesh.indices.length / 3),
    vertexCount: normalized.mesh.positions.length / 3, triangleCount: normalized.mesh.indices.length / 3,
    invalidTriangles: normalized.invalidTriangles, degenerateTriangles: normalized.degenerateTriangles, duplicateTriangles: normalized.duplicateTriangles,
    boundaryEdges, nonManifoldEdges, windingConflicts,
    watertight: normalized.mesh.indices.length > 0 && mesh.positions.length % 3 === 0 && boundaryEdges === 0 && nonManifoldEdges === 0 && windingConflicts === 0 && normalized.invalidTriangles === 0 && normalized.degenerateTriangles === 0 && normalized.duplicateTriangles === 0,
  }
}

export function repairMesh(mesh: MeshData): { mesh: MeshData; before: MeshDiagnostics; after: MeshDiagnostics } {
  const before = analyzeMesh(mesh)
  const repaired = normalizeMesh(mesh, MESH_WELD_TOLERANCE).mesh
  return { mesh: repaired, before, after: analyzeMesh(repaired) }
}

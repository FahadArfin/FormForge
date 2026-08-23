import type { ModelNode } from '@formforge/model'

export type MeshData = NonNullable<ModelNode['mesh']>

export interface MeshDiagnostics {
  vertexCount: number
  triangleCount: number
  degenerateTriangles: number
  duplicateTriangles: number
  boundaryEdges: number
  nonManifoldEdges: number
  watertight: boolean
}

const positionKey = (x: number, y: number, z: number, tolerance: number) => `${Math.round(x / tolerance)},${Math.round(y / tolerance)},${Math.round(z / tolerance)}`
const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`

function normalizeMesh(mesh: MeshData, tolerance = 1e-5) {
  const positions: number[] = []
  const canonical = new Map<string, number>()
  const remap: number[] = []
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const x = mesh.positions[index] ?? 0; const y = mesh.positions[index + 1] ?? 0; const z = mesh.positions[index + 2] ?? 0
    const key = positionKey(x, y, z, tolerance)
    let target = canonical.get(key)
    if (target === undefined) {
      target = positions.length / 3
      canonical.set(key, target)
      positions.push(x, y, z)
    }
    remap.push(target)
  }

  const indices: number[] = []
  const faces = new Set<string>()
  let degenerateTriangles = 0
  let duplicateTriangles = 0
  for (let offset = 0; offset + 2 < mesh.indices.length; offset += 3) {
    const a = remap[mesh.indices[offset] ?? -1]
    const b = remap[mesh.indices[offset + 1] ?? -1]
    const c = remap[mesh.indices[offset + 2] ?? -1]
    if (a === undefined || b === undefined || c === undefined || a === b || b === c || a === c) { degenerateTriangles += 1; continue }
    const ax = positions[a * 3]!; const ay = positions[a * 3 + 1]!; const az = positions[a * 3 + 2]!
    const abx = positions[b * 3]! - ax; const aby = positions[b * 3 + 1]! - ay; const abz = positions[b * 3 + 2]! - az
    const acx = positions[c * 3]! - ax; const acy = positions[c * 3 + 1]! - ay; const acz = positions[c * 3 + 2]! - az
    const crossX = aby * acz - abz * acy; const crossY = abz * acx - abx * acz; const crossZ = abx * acy - aby * acx
    if (crossX * crossX + crossY * crossY + crossZ * crossZ <= tolerance * tolerance) { degenerateTriangles += 1; continue }
    const faceKey = [a, b, c].sort((left, right) => left - right).join(':')
    if (faces.has(faceKey)) { duplicateTriangles += 1; continue }
    faces.add(faceKey)
    indices.push(a, b, c)
  }
  return { positions, indices, degenerateTriangles, duplicateTriangles }
}

export function analyzeMesh(mesh: MeshData): MeshDiagnostics {
  const normalized = normalizeMesh(mesh)
  const edges = new Map<string, number>()
  for (let offset = 0; offset < normalized.indices.length; offset += 3) {
    const a = normalized.indices[offset]!; const b = normalized.indices[offset + 1]!; const c = normalized.indices[offset + 2]!
    for (const key of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) edges.set(key, (edges.get(key) ?? 0) + 1)
  }
  let boundaryEdges = 0; let nonManifoldEdges = 0
  for (const count of edges.values()) {
    if (count === 1) boundaryEdges += 1
    else if (count > 2) nonManifoldEdges += 1
  }
  return {
    vertexCount: normalized.positions.length / 3,
    triangleCount: normalized.indices.length / 3,
    degenerateTriangles: normalized.degenerateTriangles,
    duplicateTriangles: normalized.duplicateTriangles,
    boundaryEdges,
    nonManifoldEdges,
    watertight: normalized.indices.length > 0 && boundaryEdges === 0 && nonManifoldEdges === 0,
  }
}

export function repairMesh(mesh: MeshData): { mesh: MeshData; before: MeshDiagnostics; after: MeshDiagnostics } {
  const before = analyzeMesh(mesh)
  const normalized = normalizeMesh(mesh)
  const repaired = { positions: normalized.positions, indices: normalized.indices }
  return { mesh: repaired, before, after: analyzeMesh(repaired) }
}

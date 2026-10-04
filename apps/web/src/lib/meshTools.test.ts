import { describe, expect, it } from 'vitest'
import { analyzeMesh, repairMesh } from './meshTools'

describe('mesh diagnostics and cleanup', () => {
  it('recognizes a closed tetrahedron even when faces use duplicate vertices', () => {
    const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]]
    const faces = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]]
    const positions = faces.flatMap((face) => face.flatMap((index) => corners[index]!))
    const mesh = { positions, indices: Array.from({ length: 12 }, (_, index) => index) }
    expect(analyzeMesh(mesh)).toMatchObject({ watertight: true, boundaryEdges: 0, vertexCount: 4, triangleCount: 4 })
  })

  it('welds vertices and removes duplicate and degenerate triangles', () => {
    const mesh = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
      indices: [0, 1, 2, 3, 1, 2, 0, 1, 2, 0, 4, 1],
    }
    const result = repairMesh(mesh)
    expect(result.before.duplicateTriangles).toBe(2)
    expect(result.before.degenerateTriangles).toBe(1)
    expect(result.mesh.indices).toEqual([0, 1, 2])
  })

  it('does not classify a closed mesh with a reversed face as watertight', () => {
    const mesh = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 1, 2, 0, 1, 3, 0, 3, 2, 1, 2, 3] }
    expect(analyzeMesh(mesh)).toMatchObject({ watertight: false, boundaryEdges: 0, windingConflicts: 3 })
  })

  it('preserves small valid triangles instead of comparing area to a distance tolerance', () => {
    const mesh = { positions: [0, 0, 0, .001, 0, 0, 0, .001, 0], indices: [0, 1, 2] }
    expect(repairMesh(mesh).mesh.indices).toEqual([0, 1, 2])
  })

  it('keeps the strongest sculpt mask when welding coincident vertices', () => {
    const mesh = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0], indices: [3, 1, 2], mask: [.2, .3, .4, .9] }
    expect(repairMesh(mesh).mesh.mask).toEqual([.9, .3, .4])
    expect(mesh.mask).toEqual([.2, .3, .4, .9])
  })

  it('reports malformed indices and nonfinite vertices without emitting invalid repaired geometry', () => {
    const mesh = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, NaN, 0, 0], indices: [0, 1, 2, 0, 1.5, 2, 0, 3, 2, -1, 1, 2, 0] }
    const result = repairMesh(mesh)
    expect(result.before.invalidTriangles).toBe(4)
    expect(result.mesh.indices).toEqual([0, 1, 2])
    expect(result.mesh.positions.every(Number.isFinite)).toBe(true)
  })

  it('refuses to call duplicate or degenerate source faces watertight', () => {
    const mesh = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3, 0, 2, 1, 0, 0, 0] }
    expect(analyzeMesh(mesh).watertight).toBe(false)
    expect(repairMesh(mesh).after.watertight).toBe(true)
  })

  it('remaps per-face material assignments with retained faces', () => {
    const mesh = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 0, 0, 0, 2, 1, 0, 2, 1, 0, 1, 3], triangleMaterials: [{ triangleIndices: [1], materialId: 'red' }, { triangleIndices: [3], materialId: 'blue' }] }
    expect(repairMesh(mesh).mesh.triangleMaterials).toEqual([{ triangleIndices: [0], materialId: 'red' }, { triangleIndices: [1], materialId: 'blue' }])
  })
})

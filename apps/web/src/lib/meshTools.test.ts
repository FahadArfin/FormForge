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
})

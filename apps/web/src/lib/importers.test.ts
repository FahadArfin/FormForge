import { describe, expect, it } from 'vitest'
import { importMeshFile } from './importers'

const tetrahedron = `solid tetrahedron
facet normal 0 0 -1
outer loop
vertex 0 0 0
vertex 10 0 0
vertex 0 10 0
endloop
endfacet
facet normal 0 -1 0
outer loop
vertex 0 0 0
vertex 0 0 10
vertex 10 0 0
endloop
endfacet
facet normal -1 0 0
outer loop
vertex 0 0 0
vertex 0 10 0
vertex 0 0 10
endloop
endfacet
facet normal 1 1 1
outer loop
vertex 10 0 0
vertex 0 0 10
vertex 0 10 0
endloop
endfacet
endsolid tetrahedron`

describe('mesh import', () => {
  it('normalizes an STL mesh around the XY origin and onto Z zero', async () => {
    const file = new File([tetrahedron], 'tetrahedron.stl', { type: 'model/stl' })
    const mesh = await importMeshFile(file)
    expect(mesh.indices).toHaveLength(12)
    expect(Math.min(...mesh.positions.filter((_, index) => index % 3 === 2))).toBe(0)
    expect(Math.min(...mesh.positions.filter((_, index) => index % 3 === 0))).toBe(-5)
    expect(Math.max(...mesh.positions.filter((_, index) => index % 3 === 0))).toBe(5)
  })
})

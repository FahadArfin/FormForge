import { describe, expect, it } from 'vitest'
import { inspectMeshProperties, validateInspectionMesh } from './meshInspection'
import type { MeshData } from './meshTools'

function box(size: number, offset = [0, 0, 0], reversed = false): MeshData {
  const positions = [[0,0,0],[size,0,0],[size,size,0],[0,size,0],[0,0,size],[size,0,size],[size,size,size],[0,size,size]].flatMap(p => p.map((v,i) => v + offset[i]!))
  const indices = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5]
  if (reversed) for(let i=0;i<indices.length;i+=3) [indices[i+1],indices[i+2]]=[indices[i+2]!,indices[i+1]!]
  return { positions, indices }
}
const join = (a: MeshData, b: MeshData): MeshData => ({ positions: [...a.positions, ...b.positions], indices: [...a.indices, ...b.indices.map(i => i+a.positions.length/3)] })

describe('evaluated mesh properties', () => {
  it('measures bounds, area, volume and uniform-density centroid of a solid', () => {
    const result = inspectMeshProperties(box(2))
    expect(result.dimensions).toEqual({x:2,y:2,z:2})
    expect(result.surfaceArea).toBeCloseTo(24, 10)
    expect(result.volume).toBeCloseTo(8, 10)
    expect(result.centroid).toEqual({x:1,y:1,z:1})
  })
  it('retains accuracy for geometry translated far from the origin', () => {
    const result = inspectMeshProperties(box(2, [1e9,-1e9,1e9]))
    expect(result.volume).toBeCloseTo(8, 10)
    expect(result.surfaceArea).toBeCloseTo(24, 10)
    expect(result.centroid).toEqual({x:1e9+1,y:-1e9+1,z:1e9+1})
  })
  it('subtracts inward-facing cavities before computing the centroid', () => {
    const result = inspectMeshProperties(join(box(4), box(2,[.5,1,1],true)))
    expect(result.volume).toBeCloseTo(56, 10)
    expect(result.surfaceArea).toBeCloseTo(120, 10)
    expect(result.centroid?.x).toBeCloseTo(29/14, 10)
    expect(result.centroid?.y).toBeCloseTo(2, 10)
  })
  it('accepts consistently reversed solid orientation', () => {
    expect(inspectMeshProperties(box(2,[0,0,0],true)).volume).toBeCloseTo(8)
  })
  it('withholds volume for inverted disconnected shells and incorrectly oriented cavities', () => {
    expect(inspectMeshProperties(join(box(2),box(1,[4,0,0],true))).volume).toBeNull()
    expect(inspectMeshProperties(join(box(4),box(2,[1,1,1]))).volume).toBeNull()
  })
  it('withholds volume for an inverted exterior shell that touches another shell at one vertex', () => {
    const result = inspectMeshProperties(join(box(4), box(2, [4,4,4], true)))
    expect(result.volume).toBeNull()
    expect(result.centroid).toBeNull()
    expect(result.volumeReason).toMatch(/orientation/i)
  })
  it('adds consistently oriented shells that touch at one vertex', () => {
    const result = inspectMeshProperties(join(box(4), box(2, [4,4,4])))
    expect(result.volume).toBeCloseTo(72, 10)
    expect(result.centroid?.x).toBeCloseTo(7/3, 10)
    expect(result.centroid?.y).toBeCloseTo(7/3, 10)
    expect(result.centroid?.z).toBeCloseTo(7/3, 10)
  })
  it('withholds solid properties for an open or inconsistently wound surface', () => {
    const open = box(2); open.indices.splice(0,3)
    expect(inspectMeshProperties(open)).toMatchObject({volume:null,centroid:null})
    const twisted = box(2); [twisted.indices[1],twisted.indices[2]]=[twisted.indices[2]!,twisted.indices[1]!]
    expect(inspectMeshProperties(twisted)).toMatchObject({volume:null,centroid:null})
  })
  it('does not allow tiny geometry to disappear during topology inspection', () => {
    expect(inspectMeshProperties(box(1e-6)).volume).toBeCloseTo(1e-18, 28)
  })
  it('rejects malformed, empty and oversized analysis inputs before work', () => {
    expect(()=>inspectMeshProperties({positions:[],indices:[]})).toThrow(/empty/i)
    expect(()=>inspectMeshProperties({positions:[0,0,NaN],indices:[0,0,0]})).toThrow(/finite|invalid/i)
    expect(()=>inspectMeshProperties({positions:[0,0,0],indices:[0,.5,0]})).toThrow(/indices|invalid/i)
    expect(()=>validateInspectionMesh({positions:[0,0,0],indices:new Array(300003).fill(0)})).toThrow(/100,000/)
  })
})

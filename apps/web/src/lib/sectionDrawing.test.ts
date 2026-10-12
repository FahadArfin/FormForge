import { describe, expect, it } from 'vitest'
import { BoxGeometry, BufferGeometry } from 'three'
import type { MeshPayload } from '@formforge/model'
import { createSectionDrawing, sectionDrawingDxf, sectionDrawingSvg } from './sectionDrawing'
function mesh(g: BufferGeometry): MeshPayload { const result = { positions: new Float32Array(g.getAttribute('position').array), indices: new Uint32Array(g.index!.array), triangleCount: g.index!.count / 3, volume: 0 }; g.dispose(); return result }
const box = () => mesh(new BoxGeometry(20, 30, 40))
function triangles(positions: number[], indices: number[]): MeshPayload { return { positions: new Float32Array(positions), indices: new Uint32Array(indices), triangleCount: indices.length / 3, volume: 0 } }
function length(drawing: ReturnType<typeof createSectionDrawing>) { return drawing.segments.reduce((sum, [a, b]) => sum + Math.hypot(a[0] - b[0], a[1] - b[1]), 0) }
describe('section linework', () => {
  it.each([
    ['x', ['Y', 'Z'], [-15, -20], [15, 20], 30, 40, 140],
    ['y', ['X', 'Z'], [-10, -20], [10, 20], 20, 40, 120],
    ['z', ['X', 'Y'], [-10, -15], [10, 15], 20, 30, 100],
  ] as const)('maps a centered box in the %s plane to model axes and millimeters', (axis, axes, min, max, width, height, perimeter) => {
    const drawing = createSectionDrawing(box(), { axis, offset: 0 })
    expect(drawing.axes).toEqual(axes)
    expect(drawing.bounds).toEqual({ min, max, width, height })
    expect(length(drawing)).toBeCloseTo(perimeter)
    expect(drawing.segments).toHaveLength(8)
  })
  it('preserves both outer and inner tube sections', () => {
    // Square tube walls, outer 20 x 20, inner 10 x 10, height 8.
    const positions: number[] = [], indices: number[] = []
    for (const radius of [10, 5]) {
      const base = positions.length / 3
      for (const z of [-4, 4]) positions.push(-radius,-radius,z, radius,-radius,z, radius,radius,z, -radius,radius,z)
      for (let i = 0; i < 4; i++) { const a = base+i, b = base+(i+1)%4; indices.push(a,b,b+4,a,b+4,a+4) }
    }
    const drawing = createSectionDrawing(triangles(positions, indices), { axis: 'z', offset: 0 })
    expect(length(drawing)).toBeCloseTo(120)
    expect(drawing.segments).toHaveLength(16)
    expect(drawing.segments.some(([a]) => Math.abs(a[0]) === 5)).toBe(true)
  })
  it('keeps coplanar perimeter without triangle diagonals or duplicate face edges', () => {
    const drawing = createSectionDrawing(box(), { axis: 'z', offset: 20 })
    expect(drawing.segments).toHaveLength(4)
    expect(length(drawing)).toBeCloseTo(100)
  })
  it('returns empty for outside planes and vertex-only tangency', () => {
    expect(createSectionDrawing(box(), { axis: 'z', offset: 21 }).segments).toEqual([])
    const tangent = triangles([0,0,0, 2,0,2, 0,2,2], [0,1,2])
    expect(createSectionDrawing(tangent, { axis: 'z', offset: 0 }).bounds).toBeNull()
    expect(createSectionDrawing(triangles([], []), { axis: 'x', offset: 0 }).segments).toEqual([])
  })
  it('deduplicates reversed shared tangent edges and ignores zero-length triangles', () => {
    const input = triangles([0,0,0, 10,0,0, 0,3,3, 0,-3,3], [0,1,2, 1,0,3, 0,0,0])
    expect(createSectionDrawing(input, { axis:'z', offset:0 }).segments).toEqual([[[0,0],[10,0]]])
  })
  it('rejects invalid and excessive input before section processing and honors cancellation', () => {
    expect(() => createSectionDrawing(box(), { axis: 'z', offset: NaN })).toThrow(/finite|plane/i)
    expect(() => createSectionDrawing(triangles([NaN,0,0, 1,0,0, 0,1,0], [0,1,2]), { axis:'z',offset:0 })).toThrow(/finite|coordinate/i)
    expect(() => createSectionDrawing(triangles([0,0,0], [0,1,2]), { axis:'z',offset:0 })).toThrow(/index|indices/i)
    expect(() => createSectionDrawing({ ...box(), triangleCount: 100001 }, { axis:'z',offset:0 })).toThrow(/limit|triangle|count/i)
    const controller = new AbortController(); controller.abort()
    expect(() => createSectionDrawing(box(), { axis:'z',offset:0 }, controller.signal)).toThrow(/cancel/i)
  })
})
describe('portable drawings', () => {
  it('exports escaped SVG title and explicit physical mm sizing with positive model Y upwards', () => {
    const drawing = createSectionDrawing(box(), { axis:'z', offset:0 })
    const svg = sectionDrawingSvg(drawing, '<script>&"unsafe')
    expect(svg).toContain('width="21mm" height="31mm"')
    expect(svg).toContain('viewBox="-10.5 -15.5 21 31"')
    expect(svg).toContain('&lt;script&gt;&amp;&quot;unsafe')
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('M -10 15')
  })
  it('exports DXF LINE coordinates and explicit millimeter units', () => {
    const dxf = sectionDrawingDxf(createSectionDrawing(triangles([2,3,0, 6,8,0, 0,0,2], [0,1,2]), { axis:'z', offset:0 }))
    expect(dxf).toContain('9\n$INSUNITS\n70\n4\n')
    expect(dxf).toContain('0\nLINE\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n10\n2\n20\n3\n30\n0\n11\n6\n21\n8\n31\n0\n')
    expect(dxf).toContain('0\nEOF\n')
  })
  it('rejects empty drawings for download', () => {
    const drawing = createSectionDrawing(box(), { axis:'z', offset:100 })
    expect(() => sectionDrawingSvg(drawing, 'empty')).toThrow(/empty|linework/i)
    expect(() => sectionDrawingDxf(drawing)).toThrow(/empty|linework/i)
  })
})

it('writes modern DXF entity subclasses for millimeter-aware readers', () => {
  const dxf = sectionDrawingDxf(createSectionDrawing(box(), { axis:'z', offset:0 }))
  expect(dxf).toContain('100\nAcDbEntity\n')
  expect(dxf).toContain('100\nAcDbLine\n')
})
it('removes XML-invalid codepoints from project names', () => {
  const svg = sectionDrawingSvg(createSectionDrawing(box(), { axis:'z', offset:0 }), 'Part\uFFFF\uD800\u0001')
  expect(svg).not.toMatch(/[\uFFFF\uD800\u0001]/u)
})
it('bounds actual input buffers and section output, not just reported triangle metadata', () => {
  const oversize = { positions:new Float32Array(9), indices:new Uint32Array(300003), triangleCount:100001, volume:0 }
  expect(() => createSectionDrawing(oversize, { axis:'z', offset:0 })).toThrow(/100,000/)
  const positions: number[] = [], indices: number[] = []
  for (let i = 0; i < 50001; i++) { positions.push(i*2,0,0, i*2+1,0,0, i*2,1,1); indices.push(i*3,i*3+1,i*3+2) }
  expect(() => createSectionDrawing(triangles(positions,indices), { axis:'z', offset:0 })).toThrow(/50,000/)
})

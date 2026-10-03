import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { createNode, vec3, type MeshPayload } from '@formforge/model'
import { export3mf, exportMultiColor3mf, exportObj, exportStl } from './exporters'

const triangle: MeshPayload = {
  positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]),
  indices: new Uint32Array([0, 1, 2]),
  volume: 0,
  triangleCount: 1,
}

describe('model exporters', () => {
  it('creates a standards-shaped 3MF package', async () => {
    const archive = unzipSync(new Uint8Array(await export3mf(triangle, 'Fixture').arrayBuffer()))
    expect(Object.keys(archive)).toContain('3D/3dmodel.model')
    expect(strFromU8(archive['3D/3dmodel.model']!)).toContain('<triangle v1="0" v2="1" v3="2"/>')
  })

  it('creates binary STL and text OBJ files', async () => {
    const stl = exportStl(triangle)
    const obj = exportObj(triangle)
    expect(stl.size).toBeGreaterThan(84)
    expect(await obj.text()).toContain('f 1//1 2//2 3//3')
  })

  it('preserves AMS material slots as separate 3MF objects', async () => {
    const first = createNode('box')
    first.materialSlot = 1
    first.color = '#829eff'
    const second = createNode('sphere')
    second.materialSlot = 2
    second.color = '#ff8a9a'
    const archive = unzipSync(new Uint8Array(await exportMultiColor3mf([first, second], 'AMS fixture').arrayBuffer()))
    const model = strFromU8(archive['3D/3dmodel.model']!)
    expect(model).toContain('<m:basematerials id="5">')
    expect(model).toContain('name="AMS 2"')
    expect(model.match(/<object id=/g)).toHaveLength(2)
  })

  it.each([
    { label: 'one mirrored axis', scale: vec3(-1, 1, 1) },
    { label: 'two mirrored axes', scale: vec3(-1, -1, 1) },
    { label: 'three mirrored axes', scale: vec3(-1, -1, -1) },
  ])('exports outward-facing triangles for $label after compound rotation', async ({ scale }) => {
    const box = createNode('box', 'add', vec3(4, -6, 8))
    box.parameters = { ...box.parameters, width: 10, depth: 20, height: 30 }
    box.transform.rotation = vec3(30, 45, 60)
    box.transform.scale = scale
    const source = structuredClone(box)
    const archive = unzipSync(new Uint8Array(await exportMultiColor3mf([box], 'Mirrored part').arrayBuffer()))
    const model = strFromU8(archive['3D/3dmodel.model']!)
    const vertices = [...model.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)]
      .map(match => [Number(match[1]), Number(match[2]), Number(match[3])] as const)
    const faces = [...model.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)]
    expect(faces).toHaveLength(12)
    const signedVolume = faces.reduce((volume, match) => {
      const a = vertices[Number(match[1])]!; const b = vertices[Number(match[2])]!; const c = vertices[Number(match[3])]!
      return volume + (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    }, 0)
    expect(signedVolume).toBeCloseTo(6_000, 3)
    expect(box).toEqual(source)
  })

  it('does not silently fill holes in a multi-color export', () => {
    const hole = createNode('cylinder')
    hole.boolean = 'cut'
    expect(() => exportMultiColor3mf([createNode('box'), hole], 'Carved')).toThrow('standard 3MF')
  })

  it('omits suppressed solids from a multi-color export', async () => {
    const suppressed = createNode('sphere')
    suppressed.suppressed = true
    const archive = unzipSync(new Uint8Array(await exportMultiColor3mf([createNode('box'), suppressed], 'Visible parts').arrayBuffer()))
    expect(strFromU8(archive['3D/3dmodel.model']!).match(/<object id=/g)).toHaveLength(1)
  })

  it('preserves hull geometry by directing the user to evaluated 3MF', () => {
    const hull = createNode('box')
    hull.groupId = 'hull-group'
    hull.groupOperation = 'hull'
    expect(() => exportMultiColor3mf([hull], 'Hull')).toThrow('standard 3MF')
  })

  it('keeps material and part resource IDs unique for larger models', async () => {
    const parts = Array.from({ length: 6 }, () => createNode('box'))
    const archive = unzipSync(new Uint8Array(await exportMultiColor3mf(parts, 'Six parts').arrayBuffer()))
    const model = strFromU8(archive['3D/3dmodel.model']!)
    const resourceIds = [...model.matchAll(/<(?:object|m:basematerials) id="(\d+)"/g)].map((match) => match[1])
    expect(resourceIds).toHaveLength(7)
    expect(new Set(resourceIds).size).toBe(7)
  })
})

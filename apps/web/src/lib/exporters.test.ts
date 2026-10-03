import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { createNode, type MeshPayload } from '@formforge/model'
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

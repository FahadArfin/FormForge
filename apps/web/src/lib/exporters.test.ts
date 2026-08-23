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
})

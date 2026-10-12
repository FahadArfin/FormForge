import { describe, expect, it } from 'vitest'
import { importMeshFile } from './importers'
import * as exporters from './exporters'

const positions = [2, 3, 4, 12, 3, 4, 2, 13, 4, 2, 3, 14]
const indices = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]
const off = `OFF\n4 4 0\n2 3 4\n12 3 4\n2 13 4\n2 3 14\n3 0 2 1\n3 0 1 3\n3 0 3 2\n3 1 2 3\n`
const ply = `ply\nformat ascii 1.0\ncomment geometry only\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 4\nproperty list uchar int vertex_indices\nend_header\n${off.split('\n').slice(2).join('\n')}`

describe('PLY and OFF exchange', () => {
  it.each([['off', off], ['ply', ply]])('imports known %s triangle geometry without discarding source coordinates before review', async (format, text) => {
    expect(await importMeshFile(new File([text], `tetra.${format}`))).toEqual({ positions, indices })
  })

  it.each(['off', 'ply'] as const)('round trips evaluated %s geometry without mutating the snapshot', async format => {
    const payload = { positions: new Float32Array(positions), indices: new Uint32Array(indices), triangleCount: 4, volume: 1000 / 6 }
    const original = structuredClone(payload)
    const exporter = format === 'off' ? exporters.exportOff : exporters.exportPly
    expect(exporter).toBeTypeOf('function')
    const blob = exporter(payload)
    expect(await importMeshFile(new File([await blob.text()], `roundtrip.${format}`))).toEqual({ positions, indices })
    expect(payload).toEqual(original)
    expect(await blob.text()).toContain('millimeter')
  })

  it.each([
    ['off', 'OFF\n1500001 1 0\n', /limit|1.5 million/i],
    ['off', 'OFF\n3 500001 0\n', /limit|500,000/i],
    ['off', off.replace('4 4 0', '-4 4 0'), /count/i],
    ['off', off.replace('4 4 0', '4.5 4 0'), /count/i],
    ['off', off.replace('2 3 4', 'NaN 3 4'), /coordinate|number/i],
    ['off', off.replace('3 0 2 1', '3 0 2 4'), /index|indices/i],
    ['off', off.replace('3 0 2 1', '3 0 2 1.5'), /index|indices/i],
    ['off', off.replace('3 0 2 1', '4 0 2 1 3'), /triangulat|triangle/i],
    ['off', off.replace('3 1 2 3\n', ''), /truncat|missing/i],
    ['off', off + '3 0 1 2\n', /extra|trailing/i],
    ['off', off.replace('OFF', 'COFF'), /OFF|color/i],
    ['ply', ply.replace('ascii', 'binary_little_endian'), /ASCII|binary/i],
    ['ply', ply.replace('vertex 4', 'vertex 999999999'), /limit|1.5 million/i],
    ['ply', ply.replace('face 4', 'face 500001'), /limit|500,000/i],
    ['ply', ply.replace('property float x', 'property float nope'), /x.*y.*z|coordinate/i],
    ['ply', ply.replace('property float x', 'property float x\nproperty float x'), /duplicate/i],
    ['ply', ply.replace('end_header', 'element edge 1\nend_header'), /element/i],
    ['ply', ply.replace('end_header', 'comment ' + 'a'.repeat(65536) + '\nend_header'), /header|line/i],
    ['ply', ply.replace('end_header\n', ''), /header/i],
    ['ply', ply.replace('3 0 2 1', '4 0 2 1 3'), /triangulat|triangle/i],
    ['ply', ply.replace('3 0 2 1', '3 0 -1 1'), /index|indices/i],
    ['ply', ply.replace('2 3 4', 'Infinity 3 4'), /number|coordinate/i],
    ['ply', ply + '0\n', /extra|trailing/i],
  ] as const)('rejects malformed %s input %#', async (format, text, error) => {
    await expect(importMeshFile(new File([text], `invalid.${format}`))).rejects.toThrow(error)
  })

  it('accepts OFF comments and counts on the magic line', async () => {
    expect(await importMeshFile(new File([off.replace('OFF\n', '# fixture\nOFF ').replace('2 3 4\n', '2 3 4 # corner\n')], 'fixture.OFF'))).toEqual({ positions, indices })
  })

  it('reads PLY coordinates by property name while discarding validated scalar attributes', async () => {
    const text = 'ply\nformat ascii 1.0\nelement vertex 3\nproperty uchar red\nproperty double z\nproperty float x\nproperty float y\nelement face 1\nproperty list uint8 int32 vertex_index\nend_header\n255 0 0 0\n0 0 10 0\n1 0 0 10\n3 0 1 2\n'
    expect(await importMeshFile(new File([text], 'colors.ply'))).toEqual({ positions: [0, 0, 0, 10, 0, 0, 0, 10, 0], indices: [0, 1, 2] })
  })
})

it.each(['off', 'ply'] as const)('rejects invalid %s snapshots instead of generating corrupt files', format => {
  const exporter = format === 'off' ? exporters.exportOff : exporters.exportPly
  const valid = { positions: new Float32Array(positions), indices: new Uint32Array(indices), triangleCount: 4, volume: 0 }
  expect(() => exporter({ ...valid, positions: new Float32Array([0, 1]) })).toThrow(/complete vertices/)
  expect(() => exporter({ ...valid, positions: new Float32Array([NaN, 0, 0]) })).toThrow(/finite/)
  expect(() => exporter({ ...valid, indices: new Uint32Array([0, 1, 4]) })).toThrow(/index/)
  expect(() => exporter({ ...valid, indices: new Uint32Array([0, 1]) })).toThrow(/triangle indices/)
})

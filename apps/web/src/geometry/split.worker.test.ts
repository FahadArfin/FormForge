import { beforeAll, describe, expect, it } from 'vitest'
import Module from 'manifold-3d'
import type { MeshPayload } from '@formforge/model'
import { analyzeMesh } from '../lib/meshTools'
import { splitMeshAtPlane } from './split.worker'

let box: MeshPayload
beforeAll(async () => {
  const api = await Module(); api.setup()
  const original = api.Manifold.cube([20, 30, 40], true)
  const solid = original.translate([4, 5, 6]); original.delete()
  const mesh = solid.getMesh()
  box = { positions: new Float32Array(mesh.vertProperties), indices: new Uint32Array(mesh.triVerts), triangleCount: mesh.triVerts.length / 3, volume: solid.volume() }
  solid.delete()
})

describe('closed planar split using the installed Manifold kernel', () => {
  it.each([
    { axis: 'x' as const, offset: 4, positiveVolume: 12000, negativeVolume: 12000 },
    { axis: 'y' as const, offset: -5, positiveVolume: 20000, negativeVolume: 4000 },
    { axis: 'z' as const, offset: 6, positiveVolume: 12000, negativeVolume: 12000 },
  ])('caps both sides and preserves volume along $axis', async ({ axis, offset, positiveVolume, negativeVolume }) => {
    const originalPositions = box.positions.slice()
    const result = await splitMeshAtPlane(box, { axis, offset })
    expect(result.positive.volume).toBeCloseTo(positiveVolume, 4)
    expect(result.negative.volume).toBeCloseTo(negativeVolume, 4)
    expect(result.positive.volume + result.negative.volume).toBeCloseTo(24000, 4)
    const coordinate = ['x', 'y', 'z'].indexOf(axis)
    for (const side of ['positive', 'negative'] as const) {
      const mesh = result[side]
      const topology = analyzeMesh({ positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) })
      expect(topology.watertight).toBe(true)
      expect(topology.degenerateTriangles).toBe(0)
      const coordinates = Array.from(mesh.positions).filter((_, index) => index % 3 === coordinate)
      if (side === 'positive') expect(Math.min(...coordinates)).toBeCloseTo(offset, 5)
      else expect(Math.max(...coordinates)).toBeCloseTo(offset, 5)
    }
    expect(box.positions).toEqual(originalPositions)
  })
  it.each([-6, 14, 20])('rejects an empty half for X = %s, including a tangent cut', async offset => {
    await expect(splitMeshAtPlane(box, { axis: 'x', offset })).rejects.toThrow(/inside|both|empty/i)
  })
  it('rejects nonfinite or unreasonable planes and open input meshes', async () => {
    await expect(splitMeshAtPlane(box, { axis: 'z', offset: NaN })).rejects.toThrow(/plane|finite/i)
    await expect(splitMeshAtPlane(box, { axis: 'z', offset: 1000001 })).rejects.toThrow(/plane|range/i)
    const open = { ...box, indices: box.indices.slice(0, 3), triangleCount: 1 }
    await expect(splitMeshAtPlane(open, { axis: 'x', offset: 4 })).rejects.toThrow(/closed|manifold|solid/i)
  })
})

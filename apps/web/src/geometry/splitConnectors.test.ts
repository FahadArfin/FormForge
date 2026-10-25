import { beforeAll, describe, expect, it } from 'vitest'
import Module, { type Manifold, type ManifoldToplevel } from 'manifold-3d'
import type { MeshPayload } from '@formforge/model'
import { analyzeMesh } from '../lib/meshTools'
import { splitMeshAtPlane } from './split.worker'
import { connectorDefaults, splitPlaneAxes } from './splitConnectors'

let api: ManifoldToplevel
const payload = (solid: Manifold): MeshPayload => {
  const mesh = solid.getMesh()
  return { positions: new Float32Array(mesh.vertProperties), indices: new Uint32Array(mesh.triVerts), triangleCount: mesh.triVerts.length / 3, volume: solid.volume() }
}
const box = () => { const solid = api.Manifold.cube([40, 40, 40], true); const mesh = payload(solid); solid.delete(); return mesh }
const from = (mesh: MeshPayload) => new api.Manifold(new api.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }))
beforeAll(async () => { api = await Module(); api.setup() })

describe('split connectors using real Manifold geometry', () => {
  it.each(['x', 'y', 'z'] as const)('makes two blind sockets and separate pins along %s', async axis => {
    const source = box(), result = await splitMeshAtPlane(source, { axis, offset: 0 }, connectorDefaults.dowel)
    expect(result.extras).toHaveLength(2)
    for (const mesh of [result.positive, result.negative, ...result.extras!.map(part => part.mesh)]) {
      expect(analyzeMesh({ positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) }).watertight).toBe(true)
      const solid = from(mesh), shells = solid.decompose()
      expect(shells).toHaveLength(1)
      shells.forEach(shell => shell.delete()); solid.delete()
    }
    expect(result.positive.volume).toBeLessThan(source.volume / 2)
    expect(result.negative.volume).toBeCloseTo(result.positive.volume, 5)
    const pin = result.extras![0]!.mesh
    const xs = Array.from(pin.positions).filter((_, i) => i % 3 === 0)
    const zs = Array.from(pin.positions).filter((_, i) => i % 3 === 2)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 5)
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(11.6, 5)
    expect(Math.min(...zs)).toBeCloseTo(0, 5)
  })
  it.each(['x', 'y', 'z'] as const)('makes a noninterfering sliding dovetail along %s', async axis => {
    const source = box(), result = await splitMeshAtPlane(source, { axis, offset: 0 }, connectorDefaults.dovetail)
    expect(result.extras).toEqual([])
    expect(result.negative.volume).toBeGreaterThan(source.volume / 2)
    expect(result.positive.volume).toBeLessThan(source.volume / 2)
    const a = from(result.positive), b = from(result.negative), overlap = a.intersect(b)
    expect(overlap.volume()).toBeCloseTo(0, 6)
    // A dovetail which fits at the final location may still be trapped. Check the
    // entire straight insertion path from either open end, including outside it.
    const { v } = splitPlaneAxes(axis)
    for (const distance of [-45, -30, -10, 10, 30, 45]) {
      const translation: [number, number, number] = [0, 0, 0]; translation[v] = distance
      const sliding = b.translate(translation), collision = a.intersect(sliding)
      expect(collision.volume()).toBeCloseTo(0, 5)
      collision.delete(); sliding.delete()
    }
    for (const solid of [a, b]) {
      const components = solid.decompose(); expect(components).toHaveLength(1); components.forEach(c => c.delete())
      expect(solid.status()).toBe('NoError')
    }
    overlap.delete(); a.delete(); b.delete()
    expect(result.notes?.join(' ')).toMatch(/slide|sliding/i)
  })
  it('increases the socket allowance without changing the pin diameter', async () => {
    const source = box()
    const tight = await splitMeshAtPlane(source, { axis: 'z', offset: 0 }, { ...connectorDefaults.dowel, clearance: .1 })
    const loose = await splitMeshAtPlane(source, { axis: 'z', offset: 0 }, { ...connectorDefaults.dowel, clearance: .4 })
    expect(loose.positive.volume).toBeLessThan(tight.positive.volume)
    const socketArea = Math.PI * (2.4 ** 2 - 2.1 ** 2) * 6 * 2
    expect(tight.positive.volume - loose.positive.volume).toBeCloseTo(socketArea, 0)
  })
  it('rejects insufficient material, hollow cut faces, and gaps between islands', async () => {
    const cube = api.Manifold.cube([40, 40, 40], true), bore = api.Manifold.cylinder(42, 10, 10, 48, true)
    const hollow = cube.subtract(bore)
    await expect(splitMeshAtPlane(payload(hollow), { axis: 'z', offset: 0 }, connectorDefaults.dowel)).rejects.toThrow(/material|wall/i)
    await expect(splitMeshAtPlane(payload(hollow), { axis: 'z', offset: 0 }, connectorDefaults.dovetail)).rejects.toThrow(/material|continuous/i)
    const slab = api.Manifold.cube([40, 40, 4], true)
    await expect(splitMeshAtPlane(payload(slab), { axis: 'z', offset: 0 }, connectorDefaults.dowel)).rejects.toThrow(/material|wall/i)
    const gap = api.Manifold.cube([40, 4, 40], true), islands = cube.subtract(gap)
    await expect(splitMeshAtPlane(payload(islands), { axis: 'z', offset: 0 }, connectorDefaults.dovetail)).rejects.toThrow(/material|continuous/i)
    ;[cube, bore, hollow, slab, gap, islands].forEach(s => s.delete())
  })
  it('rejects invalid counts, overlap, clearance, and unsupported connector kinds', async () => {
    const source = box(), plane = { axis: 'z' as const, offset: 0 }
    for (const change of [{ count: 0 }, { count: 9 }, { spacing: 1 }, { clearance: -1 }, { centerU: NaN }, { diameter: 1000 }]) {
      await expect(splitMeshAtPlane(source, plane, { ...connectorDefaults.dowel, ...change })).rejects.toThrow()
    }
    await expect(splitMeshAtPlane(source, plane, { ...connectorDefaults.dovetail, headWidth: 5 })).rejects.toThrow(/head|neck/i)
    await expect(splitMeshAtPlane(source, plane, { kind: 'unknown' } as never)).rejects.toThrow(/connector/i)
  })
  it('checks off-center connector placement and the requested material margin', async () => {
    const source = box(), plane = { axis: 'z' as const, offset: 0 }
    const moved = await splitMeshAtPlane(source, plane, { ...connectorDefaults.dowel, count: 1, centerU: 10, centerV: 10 })
    expect(moved.extras).toHaveLength(1)
    await expect(splitMeshAtPlane(source, plane, { ...connectorDefaults.dowel, count: 1, centerU: 17, wall: 1.2 })).rejects.toThrow(/material/i)
    await expect(splitMeshAtPlane(source, plane, { ...connectorDefaults.dovetail, centerU: 15 })).rejects.toThrow(/material/i)
    await expect(splitMeshAtPlane(source, plane, { ...connectorDefaults.dowel, wall: .2 })).rejects.toThrow(/wall/i)
  })
  it('uses the real miter-offset channel width when preserving walls between dovetails', async () => {
    const source = box(), plane = { axis: 'z' as const, offset: 0 }
    const connector = { ...connectorDefaults.dovetail, count: 2, spacing: 7.6, neckWidth: 2, headWidth: 4, depth: 2, clearance: 1, wall: .8 }
    // The oblique miter expands each corner further than a radial +clearance rule.
    // Socket width is 7.236 mm, leaving only 0.364 mm at this otherwise-valid spacing.
    await expect(splitMeshAtPlane(source, plane, connector)).rejects.toThrow(/spacing|wall/i)
    const result = await splitMeshAtPlane(source, plane, { ...connector, spacing: 9 })
    expect(result.positive.volume).toBeGreaterThan(0)
  })
})

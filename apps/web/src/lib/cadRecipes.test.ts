import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createNode, parseModelDocument, vec3, type MeshPayload, type ModelDocument, type ModelNode } from '@formforge/model'
import { createFitCoupon, createHoleRecipe, type FitCouponOptions, type HoleRecipeOptions } from './cadRecipes'
import { nodeWorldBounds } from './modelGeometry'
import { splitMeshIntoConnectedComponents } from './componentMesh'
import { analyzeMesh } from './meshTools'

const base = { diameter: 4, depth: 10, clearance: 0.4, x: 12, y: -7, bottomZ: -1 }
beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

async function evaluate(nodes: ModelNode[]) {
  const document = { ...createDocument(), nodes }
  const worker = { postMessage: vi.fn(), onmessage: null as null | ((event: { data: { id: number; document: ModelDocument } }) => Promise<void>) }
  vi.stubGlobal('self', worker)
  await import('../geometry/geometry.worker')
  await worker.onmessage!({ data: { id: 1, document } })
  const result = worker.postMessage.mock.calls[0]![0] as MeshPayload & { ok: boolean; error?: string }
  expect(result.ok, result.error).toBe(true)
  return result
}

describe('editable hole recipes', () => {
  it('adds diametral clearance once and positions the bore from its bottom', () => {
    const [hole] = createHoleRecipe({ ...base, kind: 'plain' })
    expect(hole!.parameters.radius).toBeCloseTo(2.2)
    expect(hole!.parameters.height).toBe(10)
    expect(hole!.transform.position).toEqual(vec3(12, -7, 4))
    const bounds = nodeWorldBounds(hole!)
    expect(bounds.min.z).toBeCloseTo(-1)
    expect(bounds.max.z).toBeCloseTo(9)
  })

  it.each([
    { kind: 'plain', ...base },
    { kind: 'counterbore', ...base, headDiameter: 8, headDepth: 3 },
    { kind: 'countersink', ...base, headDiameter: 8, includedAngle: 90 },
    { kind: 'slot', ...base, length: 14 },
    { kind: 'hex-pocket', depth: 4, acrossFlats: 7, clearance: 0.4, x: 12, y: -7, bottomZ: -1 },
  ] satisfies HoleRecipeOptions[])('creates ordinary editable cutouts for $kind that survive project parsing', options => {
    const nodes = createHoleRecipe(options)
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.every(node => node.boolean === 'cut' && !node.combined && !node.groupId)).toBe(true)
    expect(new Set(nodes.map(node => node.id)).size).toBe(nodes.length)
    expect(parseModelDocument({ ...createDocument(), nodes }).nodes).toEqual(nodes)
  })

  it('opens the counterbore at the upper end with a flat-bottomed recess', () => {
    const [, head] = createHoleRecipe({ ...base, kind: 'counterbore', headDiameter: 8, headDepth: 3 })
    expect(head!.parameters.radius).toBeCloseTo(4.2)
    expect(head!.parameters.height).toBe(3)
    expect(head!.transform.position.z).toBeCloseTo(7.5)
  })

  it('derives countersink depth from its included angle with the wide end on top', () => {
    const [, head] = createHoleRecipe({ ...base, kind: 'countersink', headDiameter: 8, includedAngle: 90 })
    expect(head!.kind).toBe('cone')
    expect(head!.parameters.radius).toBeCloseTo(2.2)
    expect(head!.parameters.radiusTop).toBeCloseTo(4.2)
    expect(head!.parameters.height).toBeCloseTo(2)
    expect(head!.transform.position.z).toBeCloseTo(8)
  })

  it('gives a slot its total tip-to-tip length, width and uniform perimeter clearance', () => {
    const [slot] = createHoleRecipe({ ...base, kind: 'slot', length: 14 })
    const bounds = nodeWorldBounds(slot!)
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(14.4, 4)
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(4.4, 4)
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(10, 4)
  })

  it('sizes hex pockets across parallel flats rather than across corners', () => {
    const [hex] = createHoleRecipe({ kind: 'hex-pocket', depth: 4, acrossFlats: 7, clearance: 0.4, x: 0, y: 0, bottomZ: 0 })
    const bounds = nodeWorldBounds(hex!)
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(7.4, 4)
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(8.54478398, 4)
  })

  it.each([
    { ...base, kind: 'plain', diameter: NaN },
    { ...base, kind: 'plain', depth: 0 },
    { ...base, kind: 'plain', diameter: 1001 },
    { ...base, kind: 'plain', clearance: -0.2 },
    { ...base, kind: 'plain', clearance: Infinity },
    { ...base, kind: 'plain', x: 100001 },
    { ...base, kind: 'counterbore', headDiameter: 3, headDepth: 2 },
    { ...base, kind: 'counterbore', headDiameter: 8, headDepth: 11 },
    { ...base, kind: 'countersink', headDiameter: 40, includedAngle: 90 },
    { ...base, kind: 'countersink', headDiameter: 8, includedAngle: 180 },
    { ...base, kind: 'slot', length: 3 },
    { kind: 'hex-pocket', depth: 4, acrossFlats: 0, clearance: 0, x: 0, y: 0, bottomZ: 0 },
  ] satisfies HoleRecipeOptions[])('rejects invalid recipe dimensions without changing options: %j', options => {
    const original = structuredClone(options)
    expect(() => createHoleRecipe(options)).toThrow()
    expect(options).toEqual(original)
  })

  it.each([
    { kind: 'plain', want: 40_000 - Math.PI * 4 * 10 },
    { kind: 'counterbore', headDiameter: 8, headDepth: 3, want: 40_000 - Math.PI * (4 * 7 + 16 * 3) },
    { kind: 'countersink', headDiameter: 8, includedAngle: 90, want: 40_000 - Math.PI * (4 * 8 + 2 * 28 / 3) },
    { kind: 'slot', length: 14, want: 40_000 - (40 + Math.PI * 4) * 10 },
    { kind: 'hex-pocket', acrossFlats: 7, want: 40_000 - Math.sqrt(3) * 49 / 2 * 10 },
  ] as const)('subtracts $kind in the real geometry worker instead of accidentally adding a group', async recipe => {
    const block = createNode('box', 'add', vec3(0, 0, 5))
    block.parameters = { ...block.parameters, width: 80, depth: 50, height: 10 }
    const placement = { depth: 10, clearance: 0, x: 0, y: 0, bottomZ: 0 }
    const cutters = createHoleRecipe(recipe.kind === 'hex-pocket' ? { ...recipe, ...placement } : { ...recipe, ...placement, diameter: 4 })
    const result = await evaluate([block, ...cutters])
    // Curved cutters are polygonal approximations; 96 segments keep area error below 0.1%.
    expect(Math.abs(result.volume - recipe.want)).toBeLessThan(0.7)
    expect(result.indices.length).toBeGreaterThan(0)
  })
})

const couponOptions: FitCouponOptions = { diameter: 4, clearanceStart: 0, clearanceStep: 0.2, sampleCount: 3, plateThickness: 3, pinHeight: 6, x: 0, y: 0, bottomZ: 0 }

describe('fit-test coupons', () => {
  it('orders distinct diametral clearances from left to right and keeps labels in editable nodes', () => {
    const coupon = createFitCoupon(couponOptions)
    expect(coupon.samples.map(sample => sample.clearance)).toEqual([0, 0.2, 0.4])
    expect(coupon.samples.map(sample => sample.holeDiameter)).toEqual([4, 4.2, 4.4])
    const holes = coupon.nodes.filter(node => node.boolean === 'cut')
    expect(holes.map(node => node.parameters.radius)).toEqual([2, 2.1, 2.2])
    holes.forEach((node, index) => expect(node.transform.position.x).toBeCloseTo([5.2, 13.6, 22][index]!, 6))
    expect(holes.every((node, index) => node.name.includes(coupon.samples[index]!.label))).toBe(true)
    expect(parseModelDocument({ ...createDocument(), nodes: coupon.nodes }).nodes).toEqual(coupon.nodes)
  })

  it('keeps the nominal pin at the original diameter and places its handle clear of the strip', () => {
    const coupon = createFitCoupon(couponOptions)
    const pin = coupon.nodes.find(node => node.name.startsWith('Gauge pin'))!
    const handle = coupon.nodes.find(node => node.name === 'Gauge handle')!
    const plate = coupon.nodes[0]!
    expect(pin.parameters.radius).toBe(2)
    expect(pin.parameters.height).toBe(6)
    expect(nodeWorldBounds(pin).min.z).toBe(3)
    expect(nodeWorldBounds(handle).min.y - nodeWorldBounds(plate).max.y).toBeCloseTo(8)
    expect(nodeWorldBounds(handle).min.z).toBe(0)
    expect(coupon.nodes.indexOf(handle)).toBeGreaterThan(coupon.nodes.map(node => node.boolean === 'cut').lastIndexOf(true))
  })

  it('builds exactly two watertight printed pieces with the expected volume using the real worker', async () => {
    const coupon = createFitCoupon(couponOptions)
    const result = await evaluate(coupon.nodes)
    const parts = splitMeshIntoConnectedComponents({ positions: Array.from(result.positions), indices: Array.from(result.indices) })
    expect(parts).toHaveLength(2)
    expect(parts.every(part => analyzeMesh(part.mesh).watertight)).toBe(true)
    // 27.2×14×3 hole strip, 12×12×3 handle, three through holes and one 4×6 mm pin.
    const expected = 27.2 * 14 * 3 + 12 * 12 * 3 - Math.PI * 39.75 + Math.PI * 24
    expect(result.volume).toBeCloseTo(expected, 0)
  })

  it.each([
    { sampleCount: 2 }, { sampleCount: 8 }, { sampleCount: 3.5 },
    { diameter: 0 }, { diameter: 1000 }, { diameter: Infinity },
    { clearanceStart: -0.1 }, { clearanceStart: 2, clearanceStep: 1 },
    { clearanceStep: 0 }, { plateThickness: 0 }, { pinHeight: 0 }, { x: NaN },
  ])('rejects impractical or unsafe coupon dimensions: %j', patch => {
    expect(() => createFitCoupon({ ...couponOptions, ...patch })).toThrow()
  })
})

import { describe, expect, it } from 'vitest'
import { createNode } from '@formforge/model'
import { shapePlacement } from './shapePlacement'
import { axisWorkplane } from './workplanes'
import { nodeWorldBounds } from './modelGeometry'

describe('direct shape placement', () => {
  it('draws rectangular footprints in either direction and leaves the source unchanged', () => {
    const node = createNode('box'), before = structuredClone(node)
    const placed = shapePlacement(node, { x: 20, y: 30 }, { x: -20, y: 10 }, undefined, 1)
    expect(placed.parameters.width).toBe(40)
    expect(placed.parameters.depth).toBe(20)
    expect(placed.transform.position.x).toBe(0)
    expect(placed.transform.position.y).toBe(20)
    expect(nodeWorldBounds(placed).min.z).toBeCloseTo(0)
    expect(node).toEqual(before)
  })
  it('places a default-size shape on a click and snaps its location', () => {
    const node = createNode('sphere')
    const placed = shapePlacement(node, { x: 7.4, y: 9.7 }, null, undefined, 1)
    expect(placed.parameters).toEqual(node.parameters)
    expect(placed.transform.position.x).toBe(7)
    expect(placed.transform.position.y).toBe(10)
  })
  it.each(['sphere', 'torus', 'tube', 'capsule', 'spring', 'cone'] as const)('keeps %s geometry valid when drawn very small', kind => {
    const node = createNode(kind)
    const placed = shapePlacement(node, { x: 0, y: 0 }, { x: 1, y: 0 }, undefined, null)
    expect(placed.parameters.radius).toBe(1)
    expect(nodeWorldBounds(placed).min.z).toBeCloseTo(0)
    expect(placed.parameters.radiusTop).toBeLessThan(placed.parameters.radius)
  })
  it('places on a rotated and offset workplane', () => {
    const placed = shapePlacement(createNode('box'), { x: 0, y: 0 }, { x: 20, y: 10 }, axisWorkplane('xz', 30), 1)
    expect(nodeWorldBounds(placed).max.y).toBeCloseTo(-30)
  })
})

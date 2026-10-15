import { describe, expect, it } from 'vitest'
import { createNode } from '@formforge/model'
import { shapePlacement } from './shapePlacement'
import { axisWorkplane } from './workplanes'
import { nodeWorldBounds } from './modelGeometry'

describe('direct shape placement', () => {
  it('bounds height drafts and rejects non-finite input', () => {
    const node=createNode('roundedBox')
    const small=shapePlacement(node,{x:0,y:0},null,undefined,1,-5)
    expect(small.parameters.height).toBe(.1)
    expect(small.parameters.fillet).toBeLessThanOrEqual(.05)
    expect(shapePlacement(node,{x:0,y:0},null,undefined,null,20000).parameters.height).toBe(10000)
    expect(()=>shapePlacement(node,{x:0,y:0},null,undefined,null,NaN)).toThrow('finite')
  })
  it.each(['box', 'cylinder', 'roundedBox'] as const)('sets %s height during placement without moving its footprint', kind => {
    const source = createNode(kind), before = structuredClone(source)
    const draft = shapePlacement(source, {x: 12, y: 18}, {x: 38, y: 40}, undefined, 1, 47)
    expect(draft.parameters.height).toBe(47)
    expect(nodeWorldBounds(draft).min.z).toBeCloseTo(0)
    expect(nodeWorldBounds(draft).max.z).toBeCloseTo(47)
    expect(source).toEqual(before)
  })
  it('sets height along an offset vertical workplane and snaps the height', () => {
    const draft = shapePlacement(createNode('box'), {x: 12, y: 18}, {x: 38, y: 40}, axisWorkplane('xz',30), 1, 47.4)
    expect(draft.parameters.height).toBe(47)
    expect(nodeWorldBounds(draft).max.y).toBeCloseTo(-30)
    expect(nodeWorldBounds(draft).min.y).toBeCloseTo(-77)
  })
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

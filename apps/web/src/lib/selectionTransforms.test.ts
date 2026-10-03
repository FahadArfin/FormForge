import { describe, expect, it } from 'vitest'
import { createNode, vec3 } from '@formforge/model'
import { transformSelectionFromPrimary } from './selectionTransforms'

describe('selection transforms around the active shape', () => {
  it('rotates all selected shapes around the active shape without destroying a mirror', () => {
    const primary = createNode('box', 'add', vec3())
    primary.transform.scale.x = -1
    const other = createNode('box', 'add', vec3(20, 0, 0))
    const updates = transformSelectionFromPrimary([primary, other], primary.id, { ...primary.transform, rotation: vec3(0, 0, 90) })
    expect(updates[0]!.transform.scale.x).toBe(-1)
    expect(updates[1]!.transform.position.x).toBeCloseTo(0)
    expect(updates[1]!.transform.position.y).toBeCloseTo(20)
    expect(updates[1]!.transform.rotation.z).toBeCloseTo(90)
  })
  it('scales spacing and shape sizes together, leaving locked members unchanged', () => {
    const primary = createNode('box', 'add', vec3(5, 0, 0))
    const other = createNode('box', 'add', vec3(25, 0, 0))
    const locked = { ...createNode('box', 'add', vec3(50, 0, 0)), locked: true }
    const updates = transformSelectionFromPrimary([primary, other, locked], primary.id, { ...primary.transform, scale: vec3(2, 2, 2) })
    expect(updates).toHaveLength(2)
    expect(updates[1]!.transform.position).toEqual(vec3(45, 0, 0))
    expect(updates[1]!.transform.scale).toEqual(vec3(2, 2, 2))
  })
  it('uses uniform scaling when selected shapes have different local orientations', () => {
    const primary = createNode('box', 'add', vec3())
    const rotated = createNode('box', 'add', vec3(20, 0, 0))
    rotated.transform.rotation.z = 90
    const updates = transformSelectionFromPrimary([primary, rotated], primary.id, { ...primary.transform, scale: vec3(2, 1, 1) })
    expect(updates[0]!.transform.scale).toEqual(vec3(2, 2, 2))
    expect(updates[1]!.transform.scale).toEqual(vec3(2, 2, 2))
    expect(updates[1]!.transform.position).toEqual(vec3(40, 0, 0))
    expect(updates[1]!.transform.rotation.z).toBeCloseTo(90)
  })
})

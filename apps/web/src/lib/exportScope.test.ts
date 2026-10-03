import { describe, expect, it } from 'vitest'
import { createDocument, createNode } from '@formforge/model'
import { createExportDocument } from './exportScope'

describe('selected assembly export scope', () => {
  it('includes the complete explicit boolean group and excludes unrelated shapes', () => {
    const solid = { ...createNode('box'), combined: true, groupId: 'assembly' }
    const hole = { ...createNode('cylinder', 'cut'), combined: true, groupId: 'assembly' }
    const unrelated = createNode('sphere')
    const document = { ...createDocument(), nodes: [solid, hole, unrelated] }
    const result = createExportDocument(document, [hole.id])
    expect(result.nodes.map(n => n.id)).toEqual([solid.id, hole.id])
    expect(document.nodes).toHaveLength(3)
  })
  it('rejects cutter-only or suppressed-only scopes and ambiguous partial volume sculpting', () => {
    const solid = createNode('box'); const hole = createNode('cylinder', 'cut')
    const document = { ...createDocument(), nodes: [solid, hole] }
    expect(() => createExportDocument(document, [])).toThrow(/select/i)
    expect(() => createExportDocument(document, [hole.id])).toThrow(/solid/i)
    expect(() => createExportDocument({ ...document, nodes: [{ ...solid, suppressed: true }] }, [solid.id])).toThrow(/solid/i)
    const sculpted = { ...document, sculptStrokes: [{ id: 's', nodeId: solid.id, mode: 'add' as const, center: { x: 0, y: 0, z: 0 }, radius: 2, strength: 1, createdAt: '' }] }
    expect(() => createExportDocument(sculpted, [solid.id])).toThrow(/sculpt/i)
    expect(createExportDocument(sculpted, [solid.id, hole.id]).sculptStrokes).toHaveLength(1)
  })
  it('requires ungrouped cutters to be explicitly selected', () => {
    const solid = createNode('box'); const hole = createNode('cylinder', 'cut')
    const doc = { ...createDocument(), nodes: [solid, hole] }
    expect(createExportDocument(doc, [solid.id]).nodes).toEqual([solid])
    expect(createExportDocument(doc, [solid.id, hole.id]).nodes).toEqual([solid, hole])
  })
})

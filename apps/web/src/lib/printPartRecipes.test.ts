import { describe, expect, it } from 'vitest'
import { createDocument, createNode, modelDocumentSchema } from '@formforge/model'
import { evaluate } from '../geometry/geometry.worker'
import { analyzeMesh } from './meshTools'
import { splitMeshIntoConnectedComponents } from './componentMesh'
import { generatePrintPart, printPartDefaults, placePrintPart } from './printPartRecipes'

describe('print-friendly parts', () => {
  it.each(['vent', 'bracket', 'boss'] as const)('creates a closed, connected, editable %s with a flat base', async kind => {
    const part = generatePrintPart(printPartDefaults[kind])
    const doc = modelDocumentSchema.parse({ ...createDocument(), nodes: part.nodes })
    const mesh = await evaluate(doc)
    expect(mesh.volume).toBeGreaterThan(0)
    expect(Math.min(...Array.from(mesh.positions).filter((_, index) => index % 3 === 2))).toBeCloseTo(0, 4)
    const data = { positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) }
    expect(splitMeshIntoConnectedComponents(data)).toHaveLength(1)
    expect(analyzeMesh(data).watertight).toBe(true)
    expect(doc.nodes.every(n => n.kind !== 'mesh')).toBe(true)
    expect(new Set(doc.nodes.map(n => n.groupId)).size).toBe(1)
  })

  it('centers evenly spaced slots and preserves the requested border and web', () => {
    const part = generatePrintPart(printPartDefaults.vent)
    const cuts = part.nodes.filter(n => n.boolean === 'cut')
    expect(cuts).toHaveLength(12)
    expect(cuts[1]!.transform.position.x - cuts[0]!.transform.position.x).toBe(7)
    expect(cuts[0]!.profile).toBeDefined()
    expect(part.facts.join(' ')).toMatch(/12 openings/)
    expect(() => generatePrintPart({ ...printPartDefaults.vent, columns: 40 })).toThrow()
    expect(() => generatePrintPart({ ...printPartDefaults.vent, gap: 0 })).toThrow()
    expect(() => generatePrintPart({ ...printPartDefaults.vent, width: 20 })).toThrow(/border|fit/i)
  })

  it('makes round vents with the expected removed volume', async () => {
    const options = { ...printPartDefaults.vent, pattern: 'round' as const, cornerRadius: 0 }
    const mesh = await evaluate({ ...createDocument(), nodes: generatePrintPart(options).nodes })
    const expected = options.width * options.depth * options.thickness - options.rows * options.columns * Math.PI * (options.openingWidth / 2) ** 2 * options.thickness
    expect(mesh.volume / expected).toBeCloseTo(1, 3)
  })

  it('rejects disconnected ribs and mounting holes without edge margin', () => {
    expect(() => generatePrintPart({ ...printPartDefaults.bracket, ribThickness: 20 })).toThrow()
    expect(() => generatePrintPart({ ...printPartDefaults.bracket, holeDiameter: 30 })).toThrow()
    expect(() => generatePrintPart({ ...printPartDefaults.bracket, ribReach: 50 })).toThrow()
  })

  it('keeps a floor below the insert and rejects an oversized lead-in', () => {
    const options = printPartDefaults.boss
    const part = generatePrintPart(options)
    const bore = part.nodes.find(n => n.name === 'Insert pilot bore')!
    expect(bore.parameters.radius * 2).toBe(options.boreDiameter)
    expect(bore.transform.position.z - bore.parameters.height / 2).toBeCloseTo(options.height - options.boreDepth)
    expect(() => generatePrintPart({ ...options, boreDepth: options.height })).toThrow(/floor/i)
    expect(() => generatePrintPart({ ...options, leadIn: 6 })).toThrow()
    expect(() => generatePrintPart({ ...options, boreDiameter: NaN })).toThrow()
  })

  it('places separate grouped parts clear of existing shapes without altering them', () => {
    const doc = createDocument(), snapshot = structuredClone(doc)
    const part = generatePrintPart(printPartDefaults.vent)
    const placed = placePrintPart(doc, part)
    expect(doc).toEqual(snapshot)
    expect(Math.min(...placed.nodes.map(n => n.transform.position.x))).toBeGreaterThan(14)
    const again = generatePrintPart(printPartDefaults.vent)
    expect(again.nodes[0]!.groupId).not.toBe(part.nodes[0]!.groupId)
    expect(() => placePrintPart({ ...doc, nodes: [createNode('box')], sculptStrokes: [{} as never] }, part)).toThrow(/sculpt/i)
  })
})

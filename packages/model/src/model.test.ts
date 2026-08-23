import { describe, expect, it } from 'vitest'
import { createDocument, createNode, executeCommand, parseModelDocument } from './index'

describe('model document', () => {
  it('adds and updates nodes without mutating the previous revision', () => {
    const original = createDocument()
    const sphere = createNode('sphere')
    const added = executeCommand(original, { type: 'add-node', node: sphere })
    const updated = executeCommand(added, { type: 'update-node', nodeId: sphere.id, patch: { name: 'Head' } })

    expect(original.nodes).toHaveLength(1)
    expect(added.nodes).toHaveLength(2)
    expect(updated.nodes[1]?.name).toBe('Head')
    expect(updated.revision).toBe(original.revision + 2)
  })

  it('round-trips through the versioned schema', () => {
    const document = createDocument('Fixture')
    expect(parseModelDocument(JSON.parse(JSON.stringify(document)))).toEqual(document)
  })

  it('loads documents created before named parameters with an empty default', () => {
    const legacyDocument = JSON.parse(JSON.stringify(createDocument('Legacy fixture')))
    delete legacyDocument.namedParameters

    expect(parseModelDocument(legacyDocument).namedParameters).toEqual([])
  })

  it('round-trips named parameters and schema-safe node bindings', () => {
    const document = createDocument('Parametric fixture')
    document.namedParameters = [
      { id: 'wall', name: 'Wall Thickness', expression: '', unit: 'mm', value: 1.6 },
      { id: 'height', name: 'Body Height', expression: '[Wall Thickness] * 20', unit: 'mm', value: 0 },
      { id: 'tilt', name: 'Tilt', expression: '', unit: 'deg', value: 15 },
    ]
    document.nodes[0]!.parameterBindings = {
      wall: 'Wall Thickness',
      height: 'Body Height',
      rotationX: 'Tilt',
    }

    const parsed = parseModelDocument(JSON.parse(JSON.stringify(document)))
    expect(parsed.namedParameters).toEqual(document.namedParameters)
    expect(parsed.nodes[0]?.parameterBindings).toEqual(document.nodes[0]?.parameterBindings)
  })

  it('rejects unsupported node parameter binding targets', () => {
    const document = JSON.parse(JSON.stringify(createDocument()))
    document.nodes[0].parameterBindings = { width: 'Width', segments: 'Segment count' }

    expect(() => parseModelDocument(document)).toThrow()
  })

  it('removes sculpt strokes with their owning node', () => {
    const document = createDocument()
    const nodeId = document.nodes[0]!.id
    document.sculptStrokes.push({ id: 'stroke', nodeId, mode: 'add', center: { x: 0, y: 0, z: 0 }, radius: 5, strength: 0.5, createdAt: new Date().toISOString() })
    const next = executeCommand(document, { type: 'remove-node', nodeId })
    expect(next.nodes).toHaveLength(0)
    expect(next.sculptStrokes).toHaveLength(0)
  })

  it('adds a pattern as one document revision', () => {
    const document = createDocument()
    const first = createNode('box')
    const second = createNode('box')
    const next = executeCommand(document, { type: 'add-nodes', nodes: [first, second] })
    expect(next.nodes).toHaveLength(3)
    expect(next.revision).toBe(document.revision + 1)
  })

  it('supports advanced primitives, intersections and grouped node replacement', () => {
    const document = createDocument()
    const torus = createNode('torus', 'intersect')
    torus.combined = true
    torus.groupId = 'group'
    torus.materialSlot = 3
    torus.deformation = { kind: 'twist', amount: 35 }
    const next = executeCommand(document, { type: 'replace-nodes', nodes: [torus] })
    expect(parseModelDocument(JSON.parse(JSON.stringify(next))).nodes[0]).toMatchObject({ kind: 'torus', boolean: 'intersect', materialSlot: 3, combined: true })
    expect(next.revision).toBe(document.revision + 1)
  })

  it('round-trips revolved and suppressed parametric features', () => {
    const document = createDocument()
    const revolve = createNode('revolve')
    revolve.profile = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 5, y: 16 }, { x: 0, y: 16 }]
    revolve.profileSettings = { curveMode: 'spline', cornerRadius: 0, offset: 1.2, tension: 0.6, resolution: 12 }
    revolve.suppressed = true
    const next = executeCommand(document, { type: 'add-node', node: revolve })
    expect(parseModelDocument(JSON.parse(JSON.stringify(next))).nodes.at(-1)).toMatchObject({
      kind: 'revolve',
      suppressed: true,
      profileSettings: revolve.profileSettings,
    })
  })

  it('rejects unsafe profile sampling settings', () => {
    const document = JSON.parse(JSON.stringify(createDocument()))
    document.nodes[0].profileSettings = { curveMode: 'rounded', cornerRadius: -1, offset: 0, tension: 0.5, resolution: 8 }

    expect(() => parseModelDocument(document)).toThrow()
  })
})

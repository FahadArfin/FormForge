import { describe, expect, it } from 'vitest'
import {
  createDefaultMaterialPalette,
  createDocument,
  createNode,
  parseModelDocument,
  type ModelDocument,
} from './index'

function createPaintedMeshDocument(): ModelDocument {
  const document = createDocument('Painted panel')
  const mesh = createNode('mesh')
  mesh.mesh = {
    positions: [
      0, 0, 0,
      10, 0, 0,
      10, 10, 0,
      0, 10, 0,
    ],
    indices: [0, 1, 2, 0, 2, 3],
  }
  document.nodes = [mesh]
  return document
}

describe('multi-material document schema', () => {
  it('creates a fresh four-slot print palette for new documents', () => {
    const first = createDefaultMaterialPalette()
    const second = createDefaultMaterialPalette()

    expect(first).toHaveLength(4)
    expect(first.map((material) => material.id)).toEqual([
      'material-print-1',
      'material-print-2',
      'material-print-3',
      'material-print-4',
    ])
    expect(first.map((material) => material.printSlot)).toEqual([1, 2, 3, 4])
    expect(first.every((material) => /^#[0-9A-F]{6}$/.test(material.color))).toBe(true)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(second[0]).not.toBe(first[0])
    expect(createDocument().materialPalette).toEqual(first)
  })

  it('round-trips palette defaults and sparse per-triangle overrides', () => {
    const document = createPaintedMeshDocument()
    const node = document.nodes[0]!
    node.materialId = 'material-print-1'
    node.mesh!.triangleMaterials = [
      { materialId: 'material-print-2', triangleIndices: [1] },
    ]

    expect(parseModelDocument(JSON.parse(JSON.stringify(document)))).toEqual(document)
  })

  it('loads legacy color/slot documents without inventing palette entries', () => {
    const legacy = JSON.parse(JSON.stringify(createDocument('Legacy colors')))
    delete legacy.materialPalette
    legacy.nodes[0].color = '#123456'
    legacy.nodes[0].materialSlot = 4

    const parsed = parseModelDocument(legacy)
    expect(parsed.materialPalette).toEqual([])
    expect(parsed.nodes[0]).toMatchObject({ color: '#123456', materialSlot: 4 })
    expect(parsed.nodes[0]?.materialId).toBeUndefined()
  })

  it('rejects malformed colors, duplicate stable ids and duplicate print slots', () => {
    const malformed = JSON.parse(JSON.stringify(createDocument()))
    malformed.materialPalette[0].color = 'blue'
    expect(() => parseModelDocument(malformed)).toThrow(/RRGGBB/)

    const duplicateId = JSON.parse(JSON.stringify(createDocument()))
    duplicateId.materialPalette[1].id = duplicateId.materialPalette[0].id
    expect(() => parseModelDocument(duplicateId)).toThrow(/duplicates palette entry/)

    const duplicateSlot = JSON.parse(JSON.stringify(createDocument()))
    duplicateSlot.materialPalette[1].printSlot = duplicateSlot.materialPalette[0].printSlot
    expect(() => parseModelDocument(duplicateSlot)).toThrow(/already used/)
  })

  it('accepts logical print slots up to sixteen and rejects values outside that range', () => {
    const document = createDocument()
    document.materialPalette = [
      { id: 'remote-print', name: 'Remote print slot', color: '#ABCDEF', printSlot: 16 },
    ]
    expect(parseModelDocument(document).materialPalette[0]?.printSlot).toBe(16)

    const invalid = JSON.parse(JSON.stringify(document))
    invalid.materialPalette[0].printSlot = 17
    expect(() => parseModelDocument(invalid)).toThrow()
  })

  it('rejects palette references that do not exist', () => {
    const nodeDefault = createPaintedMeshDocument()
    nodeDefault.nodes[0]!.materialId = 'missing'
    expect(() => parseModelDocument(nodeDefault)).toThrow(/Unknown material id/)

    const faceOverride = createPaintedMeshDocument()
    faceOverride.nodes[0]!.mesh!.triangleMaterials = [
      { materialId: 'missing', triangleIndices: [0] },
    ]
    expect(() => parseModelDocument(faceOverride)).toThrow(/Unknown material id/)
  })

  it('rejects out-of-range and multiply assigned triangle indices', () => {
    const outOfRange = createPaintedMeshDocument()
    outOfRange.nodes[0]!.mesh!.triangleMaterials = [
      { materialId: 'material-print-2', triangleIndices: [2] },
    ]
    expect(() => parseModelDocument(outOfRange)).toThrow(/outside this mesh's 2 triangles/)

    const duplicate = createPaintedMeshDocument()
    duplicate.nodes[0]!.mesh!.triangleMaterials = [
      { materialId: 'material-print-2', triangleIndices: [0] },
      { materialId: 'material-print-3', triangleIndices: [0] },
    ]
    expect(() => parseModelDocument(duplicate)).toThrow(/already assigned/)
  })

  it('requires complete indexed triangles when face materials are present', () => {
    const document = createPaintedMeshDocument()
    document.nodes[0]!.mesh!.indices.pop()
    document.nodes[0]!.mesh!.triangleMaterials = [
      { materialId: 'material-print-2', triangleIndices: [0] },
    ]

    expect(() => parseModelDocument(document)).toThrow(/index count divisible by three/)
  })
})

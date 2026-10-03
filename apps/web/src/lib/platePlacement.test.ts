import { describe, expect, it } from 'vitest'
import { createDocument, createNode, vec3, type MeshPayload } from '@formforge/model'
import { getPlatePlacementTarget, placeDocumentFromMesh } from './platePlacement'

const mesh: MeshPayload = {
  positions: new Float32Array([10, -30, 5, 50, 10, 25]),
  indices: new Uint32Array([0, 1, 0]), volume: 1, triangleCount: 1,
}
const fixture = () => {
  const a = createNode('box', 'add', vec3(20, 0, 15))
  const b = createNode('cylinder', 'cut', vec3(30, 0, 22))
  a.combined = b.combined = true
  a.groupId = b.groupId = 'assembly'
  const other = createNode('sphere', 'add', vec3(70, 0, 50))
  return { ...createDocument(), nodes: [a, b, other] }
}

describe('rigid plate placement', () => {
  it('includes the complete Boolean assembly and translates its parts by the same delta', () => {
    const document = fixture()
    const target = getPlatePlacementTarget(document, [document.nodes[0]!.id], 'selection')
    expect(target.evaluationDocument.nodes.map(node => node.id)).toEqual(document.nodes.slice(0, 2).map(node => node.id))
    const next = placeDocumentFromMesh(document, target, mesh, 'center-and-drop')!
    expect(next.nodes.map(node => node.transform.position)).toEqual([vec3(-10, 10, 10), vec3(0, 10, 17), vec3(70, 0, 50)])
    expect(next.nodes[2]).toBe(document.nodes[2])
    expect(next.nodes[0]!.groupId).toBe('assembly')
    expect(document.nodes[0]!.transform.position).toEqual(vec3(20, 0, 15))
  })

  it('centers horizontally without changing height and drops without changing horizontal placement', () => {
    const document = fixture()
    const target = getPlatePlacementTarget(document, [], 'document')
    expect(placeDocumentFromMesh(document, target, mesh, 'center')!.nodes[0]!.transform.position).toEqual(vec3(-10, 10, 15))
    expect(placeDocumentFromMesh(document, target, mesh, 'drop')!.nodes[0]!.transform.position).toEqual(vec3(20, 0, 10))
  })

  it('moves hidden and suppressed history with the whole model and carries volume sculpt centers', () => {
    const document = fixture()
    document.nodes[1]!.suppressed = true
    document.nodes[2]!.visible = false
    document.sculptStrokes = [{ id: 'stroke', nodeId: document.nodes[0]!.id, mode: 'carve', center: vec3(20, 0, 15), normal: vec3(0, 0, 1), radius: 2, strength: 1, createdAt: document.createdAt }]
    const target = getPlatePlacementTarget(document, [], 'document')
    const next = placeDocumentFromMesh(document, target, mesh, 'center-and-drop')!
    expect(next.nodes.map(node => node.transform.position)).toEqual([vec3(-10, 10, 10), vec3(0, 10, 17), vec3(40, 10, 45)])
    expect(next.sculptStrokes[0]!.center).toEqual(vec3(-10, 10, 10))
    expect(next.sculptStrokes[0]!.normal).toEqual(vec3(0, 0, 1))
    expect(next.sculptStrokes[0]!.radius).toBe(2)
  })

  it('rejects a partial sculpted selection and any locked member of an assembly', () => {
    const document = fixture()
    document.nodes[1]!.locked = true
    expect(() => getPlatePlacementTarget(document, [document.nodes[0]!.id], 'selection')).toThrow(/locked/i)
    document.nodes[1]!.locked = false
    document.sculptStrokes = [{ id: 'stroke', nodeId: document.nodes[0]!.id, mode: 'carve', center: vec3(), radius: 2, strength: 1, createdAt: document.createdAt }]
    expect(() => getPlatePlacementTarget(document, [document.nodes[0]!.id], 'selection')).toThrow(/whole model/i)
    expect(getPlatePlacementTarget(document, document.nodes.map(node => node.id), 'selection').movesWholeDocument).toBe(true)
  })

  it('uses evaluated bounds even when source shapes have surface modifiers', () => {
    const document = fixture()
    document.nodes[0]!.surface = { hollowThickness: 2, refineLength: 1, smoothAngle: 45, simplifyTolerance: 0 }
    const target = getPlatePlacementTarget(document, [], 'document')
    expect(placeDocumentFromMesh(document, target, mesh, 'drop')!.nodes[0]!.transform.position.z).toBe(10)
  })

  it('does not create a replacement for a model already centered and on the plate', () => {
    const document = fixture()
    const target = getPlatePlacementTarget(document, [], 'document')
    expect(placeDocumentFromMesh(document, target, { ...mesh, positions: new Float32Array([-10, -20, 0, 10, 20, 15]) }, 'center-and-drop')).toBeNull()
  })

  it('rejects empty and invalid evaluated geometry without editing the document', () => {
    const document = fixture()
    const target = getPlatePlacementTarget(document, [], 'document')
    expect(() => placeDocumentFromMesh(document, target, { ...mesh, positions: new Float32Array(), triangleCount: 0 }, 'drop')).toThrow(/printable/i)
    expect(() => placeDocumentFromMesh(document, target, { ...mesh, positions: new Float32Array([NaN, 0, 0]) }, 'drop')).toThrow(/invalid/i)
  })

  it('preserves bound position formulas by requiring them to be cleared before placement', () => {
    const document = fixture()
    document.nodes[0]!.parameterBindings = { positionX: 'width / 2' }
    const target = getPlatePlacementTarget(document, [], 'document')
    expect(() => placeDocumentFromMesh(document, target, mesh, 'center')).toThrow(/position binding/i)
    expect(placeDocumentFromMesh(document, target, mesh, 'drop')!.nodes[0]!.parameterBindings).toEqual({ positionX: 'width / 2' })
  })
})

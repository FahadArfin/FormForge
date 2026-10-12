import { describe, expect, it } from 'vitest'
import { createDocument, createNode } from '@formforge/model'
import { assemblyInventory, inventoryCsv, inventoryJson } from './assemblyInventory'

function fixture() {
  const body = createNode('box'), hole = createNode('cylinder', 'cut'), lid = createNode('box')
  body.name = 'Base'; hole.name = 'Mount hole'; lid.name = 'Lid'
  body.combined = hole.combined = true; body.groupId = hole.groupId = 'base'
  return { ...createDocument(), name: 'Case', nodes: [body, hole, lid] }
}
describe('assembly inventory', () => {
  it('counts one editable component per group and never cutters as purchased parts', () => {
    const doc = fixture(), inventory = assemblyInventory(doc)
    expect(inventory.components.map(c => [c.name, c.quantity, c.solidFeatures, c.cutFeatures])).toEqual([['Base', 1, 1, 1], ['Lid', 1, 1, 0]])
    expect(inventory.components[0]!.nodeIds).toEqual(doc.nodes.slice(0, 2).map(n => n.id))
    expect(doc.nodes).toHaveLength(3)
  })
  it('joins transitive groups, outer assemblies, and attached feature relationships', () => {
    const doc = fixture(), extra = createNode('cylinder', 'cut')
    doc.nodes[0]!.assemblyPath = doc.nodes[2]!.assemblyPath = ['outer']
    extra.faceAttachment = {version:1,targetNodeId:doc.nodes[2]!.id,targetKind:'box',face:'z+',offsetU:0,offsetV:0,depthMode:'through',depth:10}
    doc.nodes.push(extra)
    expect(assemblyInventory(doc).components[0]!.nodeIds).toHaveLength(4)
    expect(assemblyInventory(doc).components).toHaveLength(1)
  })
  it('excludes suppressed features but keeps hidden features, like manufacturing output', () => {
    const doc = fixture(); doc.nodes[0]!.visible = false; doc.nodes[1]!.suppressed = true
    const result = assemblyInventory(doc)
    expect(result.components).toHaveLength(2)
    expect(result.components[0]!.cutFeatures).toBe(0)
    expect(result.suppressedFeatures).toBe(1)
  })
  it('reports orphan boolean tools without inventing an item', () => {
    const doc = fixture(), cutter = createNode('cylinder','cut'), intersect = createNode('sphere','intersect')
    doc.nodes.push(cutter,intersect)
    const result = assemblyInventory(doc)
    expect(result.components).toHaveLength(2)
    expect(result.unassignedTools).toBe(2)
    expect(result.warnings.join(' ')).toMatch(/not.*physical solids/i)
  })
  it('expands selected members to a complete connected group', () => {
    const doc = fixture(), result = assemblyInventory(doc, [doc.nodes[1]!.id])
    expect(result.scope).toBe('selected')
    expect(result.components).toHaveLength(1)
    expect(result.components[0]!.nodeIds).toHaveLength(2)
    expect(assemblyInventory(doc, []).components).toHaveLength(0)
  })
  it('includes assigned materials only from additive shapes, with triangle overrides', () => {
    const doc = fixture(); doc.materialPalette = [{id:'p',name:'PLA red',color:'#ff0000'},{id:'b',name:'Blue accent',color:'#0000ff'}]
    doc.nodes[0]!.materialId = 'p'; doc.nodes[1]!.materialId = 'b'
    doc.nodes[0]!.mesh = {positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],triangleMaterials:[{materialId:'b',triangleIndices:[0]}]}
    expect(assemblyInventory(doc).components[0]!.materials).toEqual(['PLA red', 'Blue accent'])
  })
  it('retains separate identical names and does not infer quantity from mesh shells', () => {
    const doc = fixture(); doc.nodes[2]!.name = 'Base'
    const result = assemblyInventory(doc)
    expect(result.components.map(c=>c.quantity)).toEqual([1,1])
    expect(new Set(result.components.map(c=>c.id)).size).toBe(2)
  })
  it('safely exports formulas/quotes and whitelists JSON fields', () => {
    const doc = fixture(); doc.name = '=CALL("x")'; doc.nodes[0]!.name = '+SUM(1,2)'
    const report = assemblyInventory(doc), csv = inventoryCsv(report), json = JSON.parse(inventoryJson(report))
    expect(csv).toContain('"\'+SUM(1,2)"')
    expect(csv).toContain('"\'=CALL(""x"")"')
    expect(json.source.projectId).toBe(doc.id)
    expect(json.source.revision).toBe(doc.revision)
    expect(json.components).toHaveLength(2)
    expect(json).not.toHaveProperty('document')
    expect(json.components[0]).not.toHaveProperty('mass')
  })
  it('bounds work and rejects ambiguous duplicate identifiers', () => {
    const doc = fixture(); doc.nodes.push({...doc.nodes[0]!})
    expect(()=>assemblyInventory(doc)).toThrow(/unique/i)
    doc.nodes = Array.from({length:2001},()=>createNode('box'))
    expect(()=>assemblyInventory(doc)).toThrow(/2,000/)
  })
})
it('expands selection through a suppressed member before omitting suppressed features',()=>{
 const body=createNode('box'),hole=createNode('cylinder','cut')
 body.combined=hole.combined=true;body.groupId=hole.groupId='g';hole.suppressed=true
 const doc={...createDocument(),nodes:[body,hole]}
 const result=assemblyInventory(doc,[hole.id])
 expect(result.components).toHaveLength(1)
 expect(result.components[0]!.nodeIds).toEqual([body.id])
 expect(result.suppressedFeatures).toBe(1)
})

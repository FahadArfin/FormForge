import { expect, it } from 'vitest'
import { createDocument, createNode, parseModelDocument, type ModelNode } from '@formforge/model'
import { evaluate } from './geometry.worker'
import { analyzeMesh } from '../lib/meshTools'

const allEdges = ['x','y','z'].flatMap(axis => [-1,1].flatMap(sideU => [-1,1].map(sideV => ({axis,sideU,sideV}))))
const box = () => { const node = createNode('box'); node.parameters = {...node.parameters,width:20,depth:20,height:20}; return node }
const treatment = (edges:unknown[], mode='chamfer', amount=2) => ({version:1,axis:'z',sideU:1,sideV:1,mode,amount,edges}) as ModelNode['edgeTreatment']

it('persists multiple selected edges without changing legacy single-edge documents', () => {
  const node = box(); node.edgeTreatment = treatment(allEdges)
  expect(parseModelDocument({...createDocument(),nodes:[node]}).nodes[0]!.edgeTreatment).toEqual(node.edgeTreatment)
  delete node.edgeTreatment!.edges
  expect(parseModelDocument({...createDocument(),nodes:[node]}).nodes[0]!.edgeTreatment).toEqual(node.edgeTreatment)
})

it('chamfers four parallel edges with the expected removed triangular-prism volume', async () => {
  const node = box(); node.edgeTreatment = treatment(allEdges.filter(e => e.axis === 'z'))
  const mesh = await evaluate({...createDocument(),nodes:[node]})
  expect(mesh.volume).toBeCloseTo(7840,4)
  expect(analyzeMesh({positions:Array.from(mesh.positions),indices:Array.from(mesh.indices)}).watertight).toBe(true)
})

it('rounds parallel edges with the expected quarter-circle volume', async () => {
  const node = box(); node.edgeTreatment = treatment(allEdges.filter(e => e.axis === 'x'),'fillet')
  const mesh = await evaluate({...createDocument(),nodes:[node]})
  expect(mesh.volume).toBeCloseTo(8000-4*(4-Math.PI)*20,0)
  expect(analyzeMesh({positions:Array.from(mesh.positions),indices:Array.from(mesh.indices)}).watertight).toBe(true)
})

it('blends all twelve fillets into rounded corners and preserves the outer bounds', async () => {
  const node = box(); node.edgeTreatment = treatment(allEdges,'fillet')
  const mesh = await evaluate({...createDocument(),nodes:[node]})
  // Rounded cube = inner cube + six face slabs + twelve quarter cylinders + eight spherical octants.
  expect(Math.abs(mesh.volume-(4096+3072+192*Math.PI+32*Math.PI/3))).toBeLessThan(2)
  for(let axis=0;axis<3;axis++) {
    const values = Array.from(mesh.positions).filter((_,index)=>index%3===axis)
    expect(Math.max(...values)-Math.min(...values)).toBeCloseTo(20,4)
  }
  expect(analyzeMesh({positions:Array.from(mesh.positions),indices:Array.from(mesh.indices)}).watertight).toBe(true)
})

it('rejects duplicate, empty, unsupported and intersecting partial fillet selections', async () => {
  for(const edges of [[],[allEdges[0],allEdges[0]],[{axis:'w',sideU:1,sideV:1}]]) {
    const node=box();node.edgeTreatment=treatment(edges)
    await expect(evaluate({...createDocument(),nodes:[node]})).rejects.toThrow()
  }
  const node=box();node.edgeTreatment=treatment([allEdges[0],allEdges[4]],'fillet')
  await expect(evaluate({...createDocument(),nodes:[node]})).rejects.toThrow(/parallel|all 12/i)
  node.edgeTreatment=treatment(allEdges,'fillet',10)
  await expect(evaluate({...createDocument(),nodes:[node]})).rejects.toThrow(/half/i)
})

it('keeps a default rectangular box closed after a three-millimeter all-edge fillet',async()=>{
  const document=createDocument(),node=document.nodes[0]!
  node.edgeTreatment=treatment(allEdges,'fillet',3)
  const mesh=await evaluate(document)
  const analysis=analyzeMesh({positions:Array.from(mesh.positions),indices:Array.from(mesh.indices)})
  expect(analysis.watertight,JSON.stringify(analysis)).toBe(true)
})

it.each([.25,1,3,5])('keeps rounded rectangular boxes closed at radius %s',async(radius)=>{
  const node=box();node.parameters={...node.parameters,width:17,depth:35,height:12};node.edgeTreatment=treatment(allEdges,'fillet',radius)
  const mesh=await evaluate({...createDocument(),nodes:[node]})
  const analysis=analyzeMesh({positions:Array.from(mesh.positions),indices:Array.from(mesh.indices)})
  expect(analysis.watertight,JSON.stringify(analysis)).toBe(true)
  const a=17-2*radius,b=35-2*radius,c=12-2*radius
  const exact=a*b*c+2*radius*(a*b+a*c+b*c)+Math.PI*radius**2*(a+b+c)+4*Math.PI*radius**3/3
  expect(Math.abs(mesh.volume-exact)/exact).toBeLessThan(.001)
})

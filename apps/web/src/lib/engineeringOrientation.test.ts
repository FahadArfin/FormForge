import { expect, it } from 'vitest'
import { createDocument, createNode } from '@formforge/model'
import { evaluate } from '../geometry/geometry.worker'
import { rankEngineeringOrientations } from './engineeringOrientation'

it('ranks six axis orientations using evaluated geometry and prioritizes volume fit', async () => {
  const node=createNode('box');node.parameters={...node.parameters,width:100,depth:20,height:10}
  const doc={...createDocument(),nodes:[node]}, mesh=await evaluate(doc), before=Array.from(mesh.positions)
  const ranked=rankEngineeringOrientations(mesh,{...doc.printer,buildVolume:{x:30,y:30,z:120}})
  expect(ranked).toHaveLength(6)
  expect(ranked[0]!.fitsBuildVolume).toBe(true)
  expect(ranked[0]!.dimensions.z).toBeCloseTo(100)
  expect(ranked[0]!.bedContactArea).toBeCloseTo(200)
  expect(ranked[0]!.overhangArea).toBeCloseTo(0)
  expect(Array.from(mesh.positions)).toEqual(before)
})
it('favors the larger bed contact when all orientations fit', async () => {
  const node=createNode('box');node.parameters={...node.parameters,width:40,depth:20,height:5}
  const doc={...createDocument(),nodes:[node]}, mesh=await evaluate(doc)
  const ranked=rankEngineeringOrientations(mesh,doc.printer)
  expect(ranked[0]!.bedContactArea).toBeCloseTo(800)
  expect(ranked[0]!.dimensions.z).toBeCloseTo(5)
  expect(ranked[0]!.overhangArea).toBeCloseTo(0)
})
it('rejects invalid and unbounded geometry rather than manufacturing orientation scores', () => {
  const doc=createDocument()
  expect(()=>rankEngineeringOrientations({positions:new Float32Array(),indices:new Uint32Array(),volume:0,triangleCount:0},doc.printer)).toThrow(/empty/i)
  expect(()=>rankEngineeringOrientations({positions:new Float32Array([NaN,0,0]),indices:new Uint32Array([0,0,0]),volume:0,triangleCount:1},doc.printer)).toThrow(/invalid/i)
  expect(()=>rankEngineeringOrientations({positions:new Float32Array([0,0,0]),indices:new Uint32Array(300003),volume:0,triangleCount:100001},doc.printer)).toThrow(/100,000/)
})

it('counts only the bottom-facing surface of a thinner-than-contact-tolerance slab', async () => {
  const node=createNode('box');node.parameters={...node.parameters,width:40,depth:20,height:.02}
  const doc={...createDocument(),nodes:[node]},mesh=await evaluate(doc)
  const current=rankEngineeringOrientations(mesh,doc.printer).find(c=>c.id==='z-up')!
  expect(current.bedContactArea).toBeCloseTo(800)
})

it('measures a canopy underside as overhang and removes it when flipped onto the bed', async () => {
  const stem=createNode('box'),cap=createNode('box')
  stem.parameters={...stem.parameters,width:10,depth:10,height:20};stem.transform.position={x:0,y:0,z:10}
  cap.parameters={...cap.parameters,width:40,depth:40,height:5};cap.transform.position={x:0,y:0,z:22.5}
  const doc={...createDocument(),nodes:[stem,cap]},mesh=await evaluate(doc)
  const ranked=rankEngineeringOrientations(mesh,doc.printer)
  expect(ranked.find(c=>c.id==='z-up')!.overhangArea).toBeCloseTo(1500)
  expect(ranked.find(c=>c.id==='z-down')!.overhangArea).toBeCloseTo(0)
  expect(ranked[0]!.id).toBe('z-down')
})

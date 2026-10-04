import {expect,it} from 'vitest'
import {createDocument,createNode} from '@formforge/model'
import {evaluate} from '../geometry/geometry.worker'
import {runMechanicalCheck} from '../geometry/mechanicalChecks.worker'
async function slab(thickness:number,x=0){const node=createNode('box');node.parameters={...node.parameters,width:20,depth:20,height:thickness};node.transform.position.x=x;return evaluate({...createDocument(),nodes:[node]})}
it('locates a thin slab and reports sampling coverage rather than universal approval',async()=>{
 const result=await runMechanicalCheck({kind:'walls',mesh:await slab(.6),target:1.2});expect(result.kind).toBe('walls');if(result.kind!=='walls')throw 0
 expect(result.minimum).toBeCloseTo(.6,5);expect(result.thin.length).toBeGreaterThan(0);expect(result.accepted).toBe(result.sampled)
 const thick=await runMechanicalCheck({kind:'walls',mesh:await slab(3),target:1.2});if(thick.kind!=='walls')throw 0;expect(thick.thin).toHaveLength(0)
})
it('distinguishes overlap, contact and separated clearance',async()=>{
 const a=await slab(3)
 for(const [x,overlap,gap] of [[10,600,0],[20,0,0],[21,0,1]]){const result=await runMechanicalCheck({kind:'interference',meshes:[a,await slab(3,x)],search:5});if(result.kind!=='interference')throw 0;expect(result.overlapVolume).toBeCloseTo(overlap!,3);expect(result.gap).toBeCloseTo(gap!,3)}
})

it('does not mistake a gap behind an extremely thin wall for material thickness',async()=>{
 const nodes=[0,-4,4].map((z,i)=>{const n=createNode('box');n.parameters={...n.parameters,width:20,depth:20,height:i===0?.00005:3};n.transform.position.z=z;return n})
 const result=await runMechanicalCheck({kind:'walls',mesh:await evaluate({...createDocument(),nodes}),target:1.2});if(result.kind!=='walls')throw 0
 expect(result.thin.length>0||result.accepted<result.sampled).toBe(true)
})

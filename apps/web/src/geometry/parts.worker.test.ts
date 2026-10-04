import {beforeAll,expect,it} from 'vitest'
import Module,{type ManifoldToplevel,type Manifold} from 'manifold-3d'
import {decomposeParts} from './parts.worker'
import {meshBounds} from '@/lib/importReview'
let api:ManifoldToplevel
beforeAll(async()=>{api=await Module();api.setup()})
const payload=(solid:Manifold)=>{const m=solid.getMesh();return{positions:new Float32Array(m.vertProperties),indices:new Uint32Array(m.triVerts),triangleCount:m.triVerts.length/3,volume:solid.volume()}}
it('exports evaluated disconnected solids with volume and original placement preserved',async()=>{
 const a=api.Manifold.cube([10,10,10]),base=api.Manifold.cube([5,5,5]),b=base.translate([30,0,0]),combined=a.add(b)
 try{const result=await decomposeParts(payload(combined));expect(result).toHaveLength(2);expect(result.reduce((n,p)=>n+p.volume,0)).toBeCloseTo(1125);expect(result.map(p=>meshBounds(p).min.x).sort((a,b)=>a-b)).toEqual([0,30])}finally{[a,base,b,combined].forEach(s=>s.delete())}
})
it('rejects an entire cavity-bearing export instead of filling a hollow part',async()=>{
 const a=api.Manifold.cube([20,20,20],true),b=api.Manifold.cube([10,10,10],true),hollow=a.subtract(b)
 try{await expect(decomposeParts(payload(hollow))).rejects.toThrow(/cavity|whole/i)}finally{[a,b,hollow].forEach(s=>s.delete())}
})
it('rejects oversized and open meshes',async()=>{
 const a=api.Manifold.cube([10,10,10]);try{const m=payload(a);await expect(decomposeParts({...m,triangleCount:100001})).rejects.toThrow(/100,000/);await expect(decomposeParts({...m,indices:m.indices.slice(0,3),triangleCount:1})).rejects.toThrow(/closed|manifold/i)}finally{a.delete()}
})

/// <reference lib="webworker" />
import Module,{type ManifoldToplevel,type Manifold} from 'manifold-3d'
import type {MeshPayload} from '@formforge/model'
let modulePromise:Promise<ManifoldToplevel>|null=null
export async function decomposeParts(mesh:MeshPayload):Promise<MeshPayload[]>{
 if(mesh.triangleCount>100000||mesh.indices.length>300000||mesh.positions.length>900000)throw new Error('Separate-parts export supports up to 100,000 triangles. Simplify the model or export the whole model.')
 if(!mesh.indices.length||mesh.indices.length%3||!mesh.positions.length||mesh.positions.length%3||mesh.positions.some(v=>!Number.isFinite(v))||mesh.indices.some(i=>i>=mesh.positions.length/3))throw new Error('A valid closed manifold mesh is required.')
 const api=await(modulePromise??=Module().then(api=>{api.setup();return api})),input=new api.Mesh({numProp:3,vertProperties:mesh.positions,triVerts:mesh.indices});input.merge()
 const solid=new api.Manifold(input);let shells:Manifold[]=[]
 try{
  if(solid.status()!=='NoError'||solid.isEmpty()||!(solid.volume()>0))throw new Error('A closed manifold solid is required. Repair the model or export it whole.')
  shells=solid.decompose()
  if(!shells.length||shells.length>64)throw new Error('Export between 1 and 64 disconnected solids. Use a smaller selection.')
  // A disconnected negative shell is a cavity boundary, never a printable part.
  if(shells.some(s=>s.status()!=='NoError'||s.isEmpty()||s.volume()<=1e-8))throw new Error('An internal cavity shell cannot be exported as a separate part safely. Use whole-model 3MF/STL export to preserve the cavity.')
  if(Math.abs(shells.reduce((v,s)=>v+s.volume(),0)-solid.volume())>Math.max(.001,solid.volume()*1e-5))throw new Error('The separated volumes do not match the model. Export the whole model instead.')
  return shells.map(s=>{const m=s.getMesh(),positions=new Float32Array(m.numVert*3);for(let i=0;i<m.numVert;i++)for(let axis=0;axis<3;axis++)positions[i*3+axis]=m.vertProperties[i*m.numProp+axis]!;return{positions,indices:new Uint32Array(m.triVerts),triangleCount:m.triVerts.length/3,volume:s.volume()}})
 }finally{shells.forEach(s=>s.delete());solid.delete()}
}
if(typeof WorkerGlobalScope!=='undefined'&&self instanceof WorkerGlobalScope)self.onmessage=async(event:MessageEvent<{mesh:MeshPayload}>)=>{
 try{const parts=await decomposeParts(event.data.mesh);self.postMessage({ok:true,parts},parts.flatMap(p=>[p.positions.buffer,p.indices.buffer]))}catch(e){self.postMessage({ok:false,error:(e as Error).message})}
}

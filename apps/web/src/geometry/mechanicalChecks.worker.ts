/// <reference lib="webworker" />
import Module, {type Manifold,type ManifoldToplevel,type Vec3} from 'manifold-3d'
import type {MeshPayload} from '@formforge/model'
export type MechanicalJob={kind:'walls';mesh:MeshPayload;target:number}|{kind:'interference';meshes:MeshPayload[];search:number}
export type MechanicalResult={kind:'walls';sampled:number;accepted:number;totalFaces:number;components:number;minimum:number|null;thin:{point:Vec3;thickness:number}[]}|{kind:'interference';overlapVolume:number;gap:number;search:number}
let apiPromise:Promise<ManifoldToplevel>|undefined
function solidFromMesh(api:ManifoldToplevel,mesh:MeshPayload){
 if(!mesh.indices.length||mesh.indices.length%3||mesh.positions.length%3||mesh.indices.length>300_000||mesh.positions.length>900_000||mesh.positions.some(v=>!Number.isFinite(v))||mesh.indices.some(v=>v>=mesh.positions.length/3))throw new Error('Checks require a valid closed mesh up to 100,000 triangles and 300,000 vertices.')
 const input=new api.Mesh({numProp:3,vertProperties:mesh.positions,triVerts:mesh.indices});input.merge();const solid=new api.Manifold(input)
 if(solid.status()!=='NoError'||solid.volume()<=0){solid.delete();throw new Error('Repair the model before checking it; a closed manifold solid is required.')}
 return solid
}
export async function runMechanicalCheck(job:MechanicalJob):Promise<MechanicalResult>{
 const api=await(apiPromise??=Module().then(a=>{a.setup();return a})),solids:Manifold[]=[]
 try{
  if(job.kind==='interference'){
   if(job.meshes.length!==2||!Number.isFinite(job.search)||job.search<=0||job.search>100)throw new Error('Compare exactly two parts with a search distance of 0–100 mm.')
   for(const mesh of job.meshes)solids.push(solidFromMesh(api,mesh))
   const common=solids[0]!.intersect(solids[1]!);let overlapVolume:number;try{overlapVolume=common.volume()}finally{common.delete()}
   return {kind:'interference',overlapVolume,gap:overlapVolume>1e-6?0:solids[0]!.minGap(solids[1]!,job.search),search:job.search}
  }
  if(!Number.isFinite(job.target)||job.target<=0||job.target>100)throw new Error('Wall target must be 0–100 mm.')
  const solid=solidFromMesh(api,job.mesh);solids.push(solid);const mesh=solid.getMesh(),count=mesh.triVerts.length/3
  const point=(id:number):Vec3=>[mesh.vertProperties[id*mesh.numProp]!,mesh.vertProperties[id*mesh.numProp+1]!,mesh.vertProperties[id*mesh.numProp+2]!]
  // Reserve one face per connected component before deterministic sampling.
  const parents=Int32Array.from({length:mesh.numVert},(_,i)=>i)
  const root=(id:number):number=>{while(parents[id]!==id){parents[id]=parents[parents[id]!]!;id=parents[id]!}return id}
  for(let i=0;i<mesh.triVerts.length;i+=3){const a=root(mesh.triVerts[i]!),b=root(mesh.triVerts[i+1]!),c=root(mesh.triVerts[i+2]!);parents[b]=a;parents[c]=a}
  const first=new Map<number,number>();for(let i=0;i<count;i++){const r=root(mesh.triVerts[i*3]!);if(!first.has(r))first.set(r,i)}
  if(first.size>512)throw new Error('More than 512 disconnected components. Check smaller part selections separately.')
  const selected=new Set<number>(first.values());for(let i=0;i<Math.min(count,512)&&selected.size<512;i++)selected.add(Math.floor(i*count/Math.min(count,512)))
  const bounds=solid.boundingBox(),length=Math.hypot(...bounds.max.map((v,i)=>v-bounds.min[i]!))+1,epsilon=Math.min(.0001,job.target/1000)
  const thin:{point:Vec3;thickness:number}[]=[];let accepted=0,minimum=Infinity
  for(const face of selected){
   const a=point(mesh.triVerts[face*3]!),b=point(mesh.triVerts[face*3+1]!),c=point(mesh.triVerts[face*3+2]!),u=b.map((v,i)=>v-a[i]!),v=c.map((v,i)=>v-a[i]!),normal:Vec3=[u[1]!*v[2]!-u[2]!*v[1]!,u[2]!*v[0]!-u[0]!*v[2]!,u[0]!*v[1]!-u[1]!*v[0]!],magnitude=Math.hypot(...normal)
   if(magnitude<1e-12)continue
   const center=a.map((x,i)=>(x+b[i]!+c[i]!)/3) as Vec3,n=normal.map(x=>x/magnitude),start=center.map((x,i)=>x+n[i]!*epsilon) as Vec3,end=center.map((x,i)=>x-n[i]!*length) as Vec3
   // Start outside, identify the entry at this face, then require the next crossing to be an exit.
   // Starting inside by epsilon can skip walls thinner than epsilon and measure air to another part.
   const hits=solid.rayCast(start,end),entry=hits[0]
   const distanceFromCenter=(p:Vec3)=>Math.hypot(...p.map((x,i)=>x-center[i]!))
   const dot=(normal:Vec3)=>normal.reduce((sum,x,i)=>sum+x*n[i]!,0)
   if(!entry||distanceFromCenter(entry.position)>epsilon*1.1||dot(entry.normal)<=1e-8)continue
   const exit=hits.find(hit=>Math.hypot(...hit.position.map((x,i)=>x-entry.position[i]!))>1e-9)
   if(!exit||dot(exit.normal)>=-1e-8)continue
   const distance=distanceFromCenter(exit.position)
   accepted++;minimum=Math.min(minimum,distance);if(distance<job.target&&thin.length<64)thin.push({point:center,thickness:distance})
  }
  return {kind:'walls',sampled:selected.size,accepted,totalFaces:count,components:first.size,minimum:Number.isFinite(minimum)?minimum:null,thin}
 }finally{solids.forEach(s=>s.delete())}
}
if(typeof WorkerGlobalScope!=='undefined'&&self instanceof WorkerGlobalScope)self.onmessage=async(e:MessageEvent<MechanicalJob>)=>{try{self.postMessage({ok:true,result:await runMechanicalCheck(e.data)})}catch(error){self.postMessage({ok:false,error:(error as Error).message})}}

import type {MeshPayload,Vec3Value} from '@formforge/model'
import { splitMeshIntoConnectedComponents } from './componentMesh'
import { meshBounds } from './importReview'
/** Deterministic footprint rows, translation only. Keep the editable document untouched. */
export function arrangeMesh(mesh:MeshPayload,bed:Vec3Value,gap=3,margin=3){
 if(![...Object.values(bed),gap,margin].every(Number.isFinite)||Math.min(...Object.values(bed))<=0||gap<0||gap>100||margin<0||margin>100)throw new Error('Enter valid printer dimensions, spacing and edge margin (0–100 mm).')
 if(mesh.triangleCount>100_000)throw new Error('Arrange up to 100,000 triangles. Simplify this model or arrange it in your slicer.')
 const components=splitMeshIntoConnectedComponents({positions:Array.from(mesh.positions),indices:Array.from(mesh.indices)})
 if(!components.length||components.length>64)throw new Error('Arrange between 1 and 64 disconnected solids. Use your slicer for larger batches.')
 const ordered=components.map((part,index)=>{
  const p=part.mesh.positions,ix=part.mesh.indices;let signed=0
  for(let i=0;i<ix.length;i+=3){const a=ix[i]!*3,b=ix[i+1]!*3,c=ix[i+2]!*3;signed+=p[a]!*(p[b+1]!*p[c+2]!-p[b+2]!*p[c+1]!)+p[a+1]!*(p[b+2]!*p[c]!-p[b]!*p[c+2]!)+p[a+2]!*(p[b]!*p[c+1]!-p[b+1]!*p[c]!)}
  if(signed<=0.000001)throw new Error('A cavity shell or inconsistent winding cannot be arranged separately. Keep the original layout or arrange the model in your slicer.')
  return{part,index,bounds:meshBounds(part.mesh)}
 }).sort((a,b)=>b.bounds.size.y-a.bounds.size.y||a.index-b.index)
 let x=margin,y=margin,rowHeight=0;const positions:number[]=[],indices:number[]=[],parts:{id:number;x:number;y:number;width:number;depth:number}[]=[]
 for(const {part,index,bounds} of ordered){const w=bounds.size.x,d=bounds.size.y
  if(x+w>bed.x-margin+1e-6){x=margin;y+=rowHeight+gap;rowHeight=0}
  if(w>bed.x-2*margin||d>bed.y-2*margin||y+d>bed.y-margin+1e-6||bounds.size.z>bed.z)throw new Error('These parts do not fit this row layout. Reduce spacing, use a larger bed, export a smaller selection, or arrange them in your slicer.')
  const base=positions.length/3,dx=x-bed.x/2-bounds.min.x,dy=y-bed.y/2-bounds.min.y
  for(let i=0;i<part.mesh.positions.length;i+=3)positions.push(part.mesh.positions[i]!+dx,part.mesh.positions[i+1]!+dy,part.mesh.positions[i+2]!-bounds.min.z)
  for(const i of part.mesh.indices)indices.push(i+base)
  parts.push({id:index+1,x:x-bed.x/2,y:y-bed.y/2,width:w,depth:d});x+=w+gap;rowHeight=Math.max(rowHeight,d)
 }
 return{mesh:{positions:new Float32Array(positions),indices:new Uint32Array(indices),triangleCount:indices.length/3,volume:mesh.volume},parts}
}

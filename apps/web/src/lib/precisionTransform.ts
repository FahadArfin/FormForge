import {Box3,Euler,MathUtils,Quaternion,Vector3} from 'three'
import type {ModelDocument,Vec3Value} from '@formforge/model'
import {completeSelection} from './assemblies'
import {nodeWorldBounds} from './modelGeometry'
import {detachDirectBindings} from './modelParameters'
import {resolveAttachedHoles} from './attachedHoles'

export interface PrecisionTransform {translation:Vec3Value;rotation:Vec3Value;scale:number;pivot:'center'|'active'|'world'}
const vector=(v:Vec3Value)=>new Vector3(v.x,v.y,v.z)
const value=(v:Vector3)=>({x:v.x,y:v.y,z:v.z})
export function transformAssembly(doc:ModelDocument,ids:readonly string[],activeId:string|null,draft:PrecisionTransform):ModelDocument {
 const chosen=completeSelection(doc.nodes,ids)
 if(!chosen.length)throw new Error('Select a shape or assembly first.')
 if(chosen.some(n=>n.locked))throw new Error('Unlock every affected assembly member first.')
 if(doc.sculptStrokes.length)throw new Error('Export and reimport to bake volume sculpting before transforming an assembly.')
 if(!['center','active','world'].includes(draft.pivot)||!Object.values(draft.translation).every(v=>Number.isFinite(v)&&Math.abs(v)<=10000)||!Object.values(draft.rotation).every(v=>Number.isFinite(v)&&Math.abs(v)<=360))throw new Error('Use finite moves within ±10,000 mm and rotations within ±360°.')
 if(!Number.isFinite(draft.scale)||draft.scale<.001||draft.scale>100)throw new Error('Uniform scale must be between 0.001 and 100.')
 if(draft.scale!==1&&chosen.some(n=>n.faceAttachment))throw new Error('Scaling attached holes is unsupported. Resize their target dimensions instead; rigid moves and rotations are supported.')
 if(draft.scale===1&&Object.values(draft.translation).every(v=>v===0)&&Object.values(draft.rotation).every(v=>v===0))return doc
 const pivot=new Vector3()
 if(draft.pivot==='active'){const active=chosen.find(n=>n.id===activeId);if(!active)throw new Error('Select an active shape for this pivot.');pivot.copy(vector(active.transform.position))}
 if(draft.pivot==='center'){const bounds=new Box3();for(const n of chosen)bounds.union(nodeWorldBounds(n));if(bounds.isEmpty())throw new Error('This selection has no source bounds.');bounds.getCenter(pivot)}
 const rotation=new Quaternion().setFromEuler(new Euler(...[draft.rotation.x,draft.rotation.y,draft.rotation.z].map(MathUtils.degToRad) as [number,number,number],'XYZ'))
 const rotate=Object.values(draft.rotation).some(v=>v!==0),selected=new Set(chosen.map(n=>n.id))
 const nodes=doc.nodes.map(n=>{
  if(!selected.has(n.id))return n
  const p=vector(n.transform.position).sub(pivot).multiplyScalar(draft.scale).applyQuaternion(rotation).add(pivot).add(vector(draft.translation))
  let angles=n.transform.rotation
  if(rotate){const q=new Quaternion().setFromEuler(new Euler(...[angles.x,angles.y,angles.z].map(MathUtils.degToRad) as [number,number,number],'XYZ'));const e=new Euler().setFromQuaternion(rotation.clone().multiply(q),'XYZ');angles={x:MathUtils.radToDeg(e.x),y:MathUtils.radToDeg(e.y),z:MathUtils.radToDeg(e.z)}}
  const scale=value(vector(n.transform.scale).multiplyScalar(draft.scale))
  if(!p.toArray().every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6)||!Object.values(scale).every(v=>Number.isFinite(v)&&Math.abs(v)>=.0001&&Math.abs(v)<=10000))throw new Error('The result exceeds supported position or scale limits.')
  return detachDirectBindings(n,{...n,transform:{position:value(p),rotation:angles,scale}})
 })
 const resolved=resolveAttachedHoles({...doc,nodes})
 if(Object.keys(resolved.errors).some(id=>selected.has(id)))throw new Error('An attached hole could not follow this transform. Check its target dimensions.')
 return {...resolved.document,revision:doc.revision+1,updatedAt:new Date().toISOString()}
}

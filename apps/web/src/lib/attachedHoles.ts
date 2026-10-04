import {createNode,type ModelNode,type ModelDocument} from '@formforge/model'
import {Vector3,Matrix4,Euler,MathUtils} from 'three'
import {modelTransformMatrix} from './modelTransforms'
export type AttachedFace=NonNullable<ModelNode['faceAttachment']>['face']
export function supportedHoleTarget(n:ModelNode){return (n.kind==='box'||n.kind==='cylinder')&&n.boolean==='add'&&!n.suppressed&&!n.faceAttachment&&!n.edgeTreatment&&n.groupOperation!=='hull'&&(!n.deformation||n.deformation.kind==='none')&&!Object.values(n.surface??{}).some(v=>v>0)&&Object.values(n.transform.scale).every(v=>Math.abs(v-1)<1e-6)}
const value=(v:Vector3)=>({x:v.x,y:v.y,z:v.z})
export function resolveHole(node:ModelNode,target:ModelNode|undefined):ModelNode{
 const a=node.faceAttachment!;if(!target||target.kind!==a.targetKind||!supportedHoleTarget(target))throw new Error('Hole target needs repair. Choose an enabled, unscaled box or cylinder without modifiers.')
 if(node.kind!=='cylinder'||node.boolean!=='cut')throw new Error('Attached holes must remain cylinder cut features.')
 if(target.kind==='cylinder'&&!a.face.startsWith('z'))throw new Error('Only the flat top and bottom cylinder faces support attached holes.')
 const axis=a.face[0] as 'x'|'y'|'z',sign=a.face.endsWith('+')?1:-1
 const sizes={x:target.kind==='cylinder'?2*target.parameters.radius:target.parameters.width,y:target.kind==='cylinder'?2*target.parameters.radius:target.parameters.depth,z:target.parameters.height}
 const normal=new Vector3(axis==='x'?sign:0,axis==='y'?sign:0,axis==='z'?sign:0),u=axis==='x'?new Vector3(0,1,0):new Vector3(1,0,0),v=new Vector3().crossVectors(normal,u)
 const uAxis=axis==='x'?'y':'x',vAxis=axis==='z'?'y':'z',radius=node.parameters.radius
 if(!Number.isFinite(radius)||radius<=0||Math.abs(a.offsetU)+radius>sizes[uAxis]/2-.01||Math.abs(a.offsetV)+radius>sizes[vAxis]/2-.01||(target.kind==='cylinder'&&Math.hypot(a.offsetU,a.offsetV)+radius>target.parameters.radius-.01))throw new Error('Hole no longer fits this face. Reduce its diameter or offsets, or resize the target.')
 const depth=a.depthMode==='through'?sizes[axis]:a.depth
 if(!Number.isFinite(depth)||depth<=0||depth>sizes[axis]+.001)throw new Error('Blind depth must fit inside the target; use Through for a complete hole.')
 const origin=normal.clone().multiplyScalar(sizes[axis]/2).addScaledVector(u,a.offsetU).addScaledVector(v,a.offsetV)
 const center=origin.clone().addScaledVector(normal,-depth/2+(a.depthMode==='blind'?.05:0)).applyMatrix4(modelTransformMatrix(target.transform))
 const matrix=modelTransformMatrix(target.transform),basis=new Matrix4().makeBasis(u.transformDirection(matrix),v.transformDirection(matrix),normal.transformDirection(matrix)),rotation=new Euler().setFromRotationMatrix(basis,'XYZ')
 return {...node,parameters:{...node.parameters,height:depth+(a.depthMode==='blind'?.1:.2)},transform:{position:value(center),rotation:{x:MathUtils.radToDeg(rotation.x),y:MathUtils.radToDeg(rotation.y),z:MathUtils.radToDeg(rotation.z)},scale:{x:1,y:1,z:1}}}
}
export function createAttachedHole(target:ModelNode,face:AttachedFace,diameter:number,u:number,v:number,depthMode:'through'|'blind',depth:number){
 if(!Number.isFinite(diameter)||diameter<.2||diameter>1000||![u,v,depth].every(Number.isFinite)||Math.abs(u)>10000||Math.abs(v)>10000||depth<.1||depth>10000)throw new Error('Use finite dimensions: diameter 0.2–1,000 mm, depth 0.1–10,000 mm and offsets within ±10,000 mm.')
 const n=createNode('cylinder','cut');n.name=`Attached hole · ${target.name} ${face}`;n.parameters.radius=diameter/2;n.parameters.segments=96;n.assemblyPath=target.assemblyPath?[...target.assemblyPath]:undefined;n.combined=target.combined;n.groupId=target.groupId;n.groupOperation=target.groupOperation
 n.faceAttachment={version:1,targetNodeId:target.id,targetKind:target.kind as 'box'|'cylinder',face,offsetU:u,offsetV:v,depthMode,depth}
 return resolveHole(n,target)
}
export function resolveAttachedHoles(doc:ModelDocument){
 const errors:Record<string,string>={};let changed=false
 const nodes=doc.nodes.map(n=>{if(!n.faceAttachment||n.suppressed)return n;try{const result=resolveHole(n,doc.nodes.find(t=>t.id===n.faceAttachment!.targetNodeId));if(JSON.stringify(n.transform)===JSON.stringify(result.transform)&&n.parameters.height===result.parameters.height)return n;changed=true;return result}catch(e){errors[n.id]=(e as Error).message;return n}})
 return {document:changed?{...doc,nodes}:doc,errors}
}

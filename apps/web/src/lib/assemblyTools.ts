import {Quaternion,Vector3} from 'three'
import type {ModelDocument,Vec3Value} from '@formforge/model'
import {completeSelection} from './assemblies'
import {rotateTransform,value,vector} from './workplanes'
export function movableSelection(doc:ModelDocument,ids:readonly string[]){const nodes=completeSelection(doc.nodes,ids);if(!nodes.length)throw new Error('Select shapes first.');if(nodes.some(n=>n.locked))throw new Error('Unlock every selected assembly member.');if(doc.sculptStrokes.length)throw new Error('Convert volume sculpting to a mesh before arranging parts.');if(nodes.some(n=>Object.keys(n.parameterBindings??{}).some(k=>k.startsWith('position')||k.startsWith('rotation'))))throw new Error('Clear position and rotation bindings before arranging parts.');return nodes}
export function translateAssembly(doc:ModelDocument,ids:readonly string[],delta:Vec3Value):ModelDocument{if(!Object.values(delta).every(Number.isFinite))throw new Error('Translation must be finite.');const selected=new Set(movableSelection(doc,ids).map(n=>n.id));return {...doc,nodes:doc.nodes.map(n=>selected.has(n.id)?{...n,transform:{...n.transform,position:value(vector(n.transform.position).add(vector(delta)))}}:n),revision:doc.revision+1,updatedAt:new Date().toISOString()}}
export function patternAssembly(doc:ModelDocument,ids:readonly string[],options:{mode:'linear'|'polar';axis:'x'|'y'|'z';count:number;spacing:number;degrees:number;origin:Vec3Value}):ModelDocument{
 const source=movableSelection(doc,ids);const {count,axis,spacing,degrees,origin}=options
 if(!Number.isInteger(count)||count<2||count>64||doc.nodes.length+source.length*(count-1)>2000)throw new Error('Use 2–64 instances and no more than 2,000 total shapes.')
 if(![spacing,degrees,...Object.values(origin)].every(Number.isFinite)||Math.abs(spacing)>10000||Math.abs(degrees)>360)throw new Error('Check pattern spacing, angle, and origin.')
 if(source.some(n=>(n.assemblyPath?.length??0)>=8))throw new Error('Maximum assembly nesting reached.')
 const copies=[]
 for(let i=1;i<count;i++){
  const groups=new Map<string,string>(),assemblies=new Map<string,string>(),outer=crypto.randomUUID();const remap=(m:Map<string,string>,key:string)=>{if(!m.has(key))m.set(key,crypto.randomUUID());return m.get(key)!}
  const angle=degrees*Math.PI/180*i/(Math.abs(degrees)===360?count:count-1),axisVector=new Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0)
  for(const node of source){let copy=structuredClone(node);copy.id=crypto.randomUUID();copy.name=`${node.name} · ${i+1}`;copy.groupId=node.groupId?remap(groups,node.groupId):undefined;copy.assemblyPath=[outer,...(node.assemblyPath??[]).map(a=>remap(assemblies,a))]
   if(options.mode==='linear')copy.transform.position[axis]+=spacing*i
   else copy=rotateTransform(copy,new Quaternion().setFromAxisAngle(axisVector,angle),vector(origin))
   copies.push(copy)
  }
 }
 return {...doc,nodes:[...doc.nodes,...copies],revision:doc.revision+1,updatedAt:new Date().toISOString()}
}
export function meshBounds(positions:Float32Array){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];if(!positions.length)throw new Error('This selection has no evaluated solid.');for(let i=0;i<positions.length;i++){if(!Number.isFinite(positions[i]))throw new Error('Invalid mesh.');min[i%3]=Math.min(min[i%3]!,positions[i]!);max[i%3]=Math.max(max[i%3]!,positions[i]!)}return {min,max}}

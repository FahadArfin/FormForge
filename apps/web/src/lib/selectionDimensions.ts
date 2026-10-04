import type {ModelNode} from '@formforge/model'
import {makeSourceGeometry} from './modelGeometry'
const sizes=new WeakMap<ModelNode,{x:number;y:number;z:number}>()
export function shapeDimensions(node:ModelNode) {
 let local=sizes.get(node)
 if(!local){const geometry=makeSourceGeometry(node);geometry.computeBoundingBox();const b=geometry.boundingBox!;local={x:b.max.x-b.min.x,y:b.max.y-b.min.y,z:b.max.z-b.min.z};geometry.dispose();sizes.set(node,local)}
 return {x:local.x*Math.abs(node.transform.scale.x),y:local.y*Math.abs(node.transform.scale.y),z:local.z*Math.abs(node.transform.scale.z)}
}
export function resizeNodeDimension(node:ModelNode,axis:'x'|'y'|'z',next:number,proportional:boolean) {
 const dimensions=shapeDimensions(node)
 if(!Number.isFinite(next)||next<=0||next>100000||!Number.isFinite(dimensions[axis])||dimensions[axis]<=0)throw new Error('Enter a size above 0 and at most 100,000 mm.')
 const factor=next/dimensions[axis],scale=node.transform.scale
 return {...node.transform,scale:proportional?{x:scale.x*factor,y:scale.y*factor,z:scale.z*factor}:{...scale,[axis]:scale[axis]*factor}}
}

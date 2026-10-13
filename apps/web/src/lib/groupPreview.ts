import type {MeshPayload,ModelNode} from '@formforge/model'
import {Vector3} from 'three'
import {modelTransformMatrix} from './modelTransforms'
export function groupPreviewKey(nodes:ModelNode[],anchor=nodes[0]!){
 const inverse=modelTransformMatrix(anchor.transform).invert()
 return JSON.stringify(nodes.map(n=>({...n,transform:modelTransformMatrix(n.transform).premultiply(inverse).elements.map(v=>Math.round(v*1e8)/1e8)})))
}
export function localGroupMesh(mesh:MeshPayload,anchor:ModelNode):MeshPayload{
 const inverse=modelTransformMatrix(anchor.transform).invert(),positions=new Float32Array(mesh.positions.length),point=new Vector3()
 for(let i=0;i<positions.length;i+=3){point.fromArray(mesh.positions,i).applyMatrix4(inverse);point.toArray(positions,i)}
 // Inverse reflection changes winding; the anchor transform reflects it back.
 const indices=mesh.indices.slice()
 if(inverse.determinant()<0)for(let i=0;i<indices.length;i+=3){const a=indices[i]!;indices[i]=indices[i+2]!;indices[i+2]=a}
 return {...mesh,positions,indices}
}

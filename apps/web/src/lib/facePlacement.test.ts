import { expect,it } from 'vitest'
import { createDocument,createNode,vec3 } from '@formforge/model'
import { nodeToWorldGeometry } from './modelGeometry'
import { placeFaceOnPlate } from './facePlacement'
import { modelTransformMatrix } from './modelTransforms'
import { Matrix3, Vector3 } from 'three'

it('places a rotated mirrored face on the plate without changing scale or spacing',()=>{
 const node=createNode('box');node.transform.scale=vec3(-2,3,0.5);node.transform.rotation=vec3(30,45,60)
 const doc={...createDocument(),nodes:[node]};const matrix=modelTransformMatrix(node.transform)
 const point=new Vector3(0,0,-node.parameters.height/2).applyMatrix4(matrix)
 const normal=new Vector3(0,0,-1).applyNormalMatrix(new Matrix3().getNormalMatrix(matrix))
 const g=nodeToWorldGeometry(node); const mesh={positions:g.getAttribute('position').array as Float32Array,indices:new Uint32Array(),triangleCount:12,volume:1}
 const next=placeFaceOnPlate(doc,[node.id],mesh,point,normal)
 const ng=nodeToWorldGeometry(next.nodes[0]!);ng.computeBoundingBox()
 expect(ng.boundingBox!.min.z).toBeCloseTo(0,4)
 expect(next.nodes[0]!.transform.scale).toEqual(node.transform.scale)
 expect(doc.nodes[0]).toBe(node);g.dispose();ng.dispose()
})
it('rejects a recessed face and locked assemblies',()=>{
 const n=createNode('box');const d={...createDocument(),nodes:[n]};const mesh={positions:new Float32Array([0,0,-1,0,0,1,1,0,1]),indices:new Uint32Array([0,1,2]),triangleCount:1,volume:1}
 expect(()=>placeFaceOnPlate(d,[n.id],mesh,vec3(),vec3(0,0,-1))).toThrow('extends below')
 expect(()=>placeFaceOnPlate({...d,nodes:[{...n,locked:true}]},[n.id],mesh,vec3(),vec3(0,0,-1))).toThrow('Unlock')
})

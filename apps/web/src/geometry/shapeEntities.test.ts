import {expect,it} from 'vitest'
import {createDocument,createNode,parseModelDocument,vec3} from '@formforge/model'
import {Vector3} from 'three'
import {evaluate} from './geometry.worker'
import {localGroupMesh,groupPreviewKey} from '@/lib/groupPreview'
import {modelTransformMatrix} from '@/lib/modelTransforms'
import {transformSelectionFromPrimary} from '@/lib/selectionTransforms'
it.each([['add',1500],['cut',500],['intersect',500]] as const)('evaluates editable %s groups and round-trips their source nodes',async(mode,volume)=>{
 const a=createNode('box'),b=createNode('box',mode,vec3(5,0,0))
 for(const n of [a,b]){n.parameters={...n.parameters,width:10,depth:10,height:10};n.groupId='group';n.combined=true}
 const doc=parseModelDocument(JSON.parse(JSON.stringify({...createDocument(),nodes:[a,b]})))
 expect((await evaluate(doc)).volume).toBeCloseTo(volume)
 expect(doc.nodes).toHaveLength(2)
 expect(doc.nodes[1]!.boolean).toBe(mode)
})
it('keeps cached group surfaces aligned after movement and converts mirrored anchors back to world geometry',async()=>{
 const a=createNode('box'),b=createNode('sphere')
 a.transform={position:vec3(2,3,4),rotation:vec3(10,20,30),scale:vec3(-1,2,1)}
 b.transform.position=vec3(4,6,8)
 for(const n of [a,b]){n.combined=true;n.groupId='group'}
 const mesh=await evaluate({...createDocument(),nodes:[a,b]}),local=localGroupMesh(mesh,a),matrix=modelTransformMatrix(a.transform)
 for(let i=0;i<local.positions.length;i+=3){const world=new Vector3().fromArray(local.positions,i).applyMatrix4(matrix);expect(world.x).toBeCloseTo(mesh.positions[i]!,4);expect(world.y).toBeCloseTo(mesh.positions[i+1]!,4);expect(world.z).toBeCloseTo(mesh.positions[i+2]!,4)}
 const next={...a.transform,position:vec3(15,25,35)},updates=transformSelectionFromPrimary([a,b],a.id,next)
 const moved=[a,b].map(n=>({...n,transform:updates.find(u=>u.id===n.id)!.transform}))
 expect(groupPreviewKey(moved)).toBe(groupPreviewKey([a,b]))
})

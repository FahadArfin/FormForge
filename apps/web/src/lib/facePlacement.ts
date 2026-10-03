import { Quaternion, Vector3 } from 'three'
import type { MeshPayload, ModelDocument, Vec3Value } from '@formforge/model'
import { getPlatePlacementTarget } from './platePlacement'
import { rotateTransform, value, vector } from './workplanes'

export function placeFaceOnPlate(document:ModelDocument, selectedIds:readonly string[], mesh:MeshPayload, point:Vec3Value, normal:Vec3Value):ModelDocument {
  const target=getPlatePlacementTarget(document,selectedIds,'selection')
  if(document.sculptStrokes.length) throw new Error('Face orientation requires editable shapes without volume sculpting. Save a checkpoint and convert the result to a mesh first.')
  if(!mesh.triangleCount) throw new Error('The selected assembly has no printable solid.')
  if(!Object.values(point).every(Number.isFinite)||!Object.values(normal).every(Number.isFinite)||vector(normal).length()<0.99) throw new Error('Pick a valid face.')
  const q=new Quaternion().setFromUnitVectors(vector(normal).normalize(),new Vector3(0,0,-1)), pivot=vector(point)
  let min=Infinity, max=-Infinity
  for(let i=0;i<mesh.positions.length;i+=3){ const v=new Vector3().fromArray(mesh.positions,i).sub(pivot).applyQuaternion(q); min=Math.min(min,v.z); max=Math.max(max,v.z) }
  if(min < -Math.max(0.001,(max-min)*1e-5)) throw new Error('Another part extends below that face. Choose an outer supporting face for this assembly.')
  if(min > Math.max(0.001,(max-min)*1e-5)) throw new Error('That source face is no longer on the evaluated solid. Pick a face in Solid result instead.')
  const nodes=document.nodes.map(node=>{
    if(!target.nodeIds.has(node.id)) return node
    if(Object.keys(node.parameterBindings??{}).some(k=>k.startsWith('position')||k.startsWith('rotation'))) throw new Error('Clear position and rotation bindings on affected shapes before face placement.')
    const next=rotateTransform(node,q,pivot)
    next.transform.position=value(vector(next.transform.position).add(new Vector3(0,0,-point.z)))
    return next
  })
  return {...document,nodes,revision:document.revision+1,updatedAt:new Date().toISOString()}
}

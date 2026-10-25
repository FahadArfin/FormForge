import { modelDocumentSchema, type EdgeTreatment, type MeshPayload, type ModelDocument } from '@formforge/model'
import { evaluateSnapshot } from '@/geometry/evaluateSnapshot'
import { validateEdgeTreatment } from '@/geometry/edgeTreatment'
import { analyzeMesh } from './meshTools'

export interface EdgeFinishingPreview { source:ModelDocument;nodeId:string;treatment:EdgeTreatment;mesh:MeshPayload }
export async function previewEdgeFinishing(getCurrent:()=>ModelDocument,nodeId:string,treatment:EdgeTreatment,signal:AbortSignal,evaluate=evaluateSnapshot):Promise<EdgeFinishingPreview> {
  const source=getCurrent(),node=source.nodes.find(n=>n.id===nodeId)
  if(signal.aborted)throw new DOMException('Edge preview cancelled.','AbortError')
  if(!node||node.suppressed)throw new Error('Select a visible box to finish.')
  if(node.locked)throw new Error('Unlock the box before finishing its edges.')
  if(source.sculptStrokes.length)throw new Error('Edge finishing needs a project without volume sculpting. Undo the sculpt strokes to finish the original box.')
  if(node.faceAttachment||source.nodes.some(n=>n.faceAttachment?.targetNodeId===node.id))throw new Error('Remove attached holes before finishing this box. Standard cutout shapes can be retained.')
  validateEdgeTreatment({...node,edgeTreatment:treatment})
  const proposed=modelDocumentSchema.parse({...source,nodes:source.nodes.map(n=>n.id===nodeId?{...n,edgeTreatment:treatment}:n)})
  const mesh=await evaluate(proposed,signal)
  if(signal.aborted)throw new DOMException('Edge preview cancelled.','AbortError')
  if(getCurrent()!==source)throw new Error('The project changed. Preview the edges again before applying.')
  if(!mesh.triangleCount||!Number.isFinite(mesh.volume)||mesh.volume<=0||!analyzeMesh({positions:Array.from(mesh.positions),indices:Array.from(mesh.indices)}).watertight)throw new Error('This edge selection did not produce closed geometry. Reduce the size or change the selection.')
  return {source,nodeId,treatment:proposed.nodes.find(n=>n.id===nodeId)!.edgeTreatment!,mesh}
}
export function applyEdgeFinishing(getCurrent:()=>ModelDocument,preview:EdgeFinishingPreview,update:(id:string,treatment:EdgeTreatment)=>void) {
  if(getCurrent()!==preview.source)throw new Error('The project changed. Preview the edges again before applying.')
  update(preview.nodeId,preview.treatment)
  if(JSON.stringify(getCurrent().nodes.find(n=>n.id===preview.nodeId)?.edgeTreatment)!==JSON.stringify(preview.treatment))throw new Error('The editor could not apply the finish. Complete the current edit and try again.')
}

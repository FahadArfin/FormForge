import type {ModelNode} from '@formforge/model'
export function completeSelection(nodes:ModelNode[],selected:readonly string[]){
 const ids=new Set(selected)
 let changed=true
 while(changed){changed=false;const chosen=nodes.filter(n=>ids.has(n.id));const groups=new Set(chosen.filter(n=>n.combined).map(n=>n.groupId).filter(Boolean));const assemblies=new Set(chosen.map(n=>n.assemblyPath?.[0]).filter(Boolean));for(const n of nodes)if(!ids.has(n.id)&&((n.faceAttachment&&ids.has(n.faceAttachment.targetNodeId))||chosen.some(c=>c.faceAttachment?.targetNodeId===n.id)||(n.combined&&groups.has(n.groupId))||(n.assemblyPath?.[0]&&assemblies.has(n.assemblyPath[0])))){ids.add(n.id);changed=true}}
 return nodes.filter(n=>ids.has(n.id))
}

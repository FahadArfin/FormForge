import type {ModelDocument,ModelNode} from '@formforge/model'
export function isGroupedNode(node:ModelNode|undefined){return Boolean(node&&(node.booleanPath?.length||(node.combined&&node.groupId)))}
export function entityNodes(nodes:ModelNode[],id:string){
 const node=nodes.find(n=>n.id===id)
 if(!node)return []
 if(node.booleanPath?.length)return nodes.filter(n=>n.booleanPath?.[0]?.id===node.booleanPath![0]!.id)
 return node.combined&&node.groupId?nodes.filter(n=>n.combined&&n.groupId===node.groupId&&JSON.stringify(n.assemblyPath??[])===JSON.stringify(node.assemblyPath??[])):[node]
}
// Existing global cuts, sculpting and assemblies must keep their evaluated view.
export function preferSolidPreview(document:ModelDocument){return Boolean(document.sculptStrokes.length||document.nodes.some(n=>n.assemblyPath?.length||n.faceAttachment||n.edgeTreatment||(!n.combined&&n.boolean!=='add')))}

export function entityAnchor(nodes:ModelNode[],id:string){const parts=entityNodes(nodes,id);return parts.find(n=>n.visible&&!n.suppressed)??parts[0]}

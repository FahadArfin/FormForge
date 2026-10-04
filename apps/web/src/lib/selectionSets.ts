import {parseModelDocument,type ModelDocument,type SelectionSet} from '@formforge/model'
import {completeSelection} from './assemblies'
export function saveSelectionSet(doc:ModelDocument,name:string,ids:string[],id?:string):ModelDocument{
 const nodeIds=completeSelection(doc.nodes,ids).filter(n=>!n.suppressed).map(n=>n.id),trimmed=name.trim()
 if(!nodeIds.length)throw new Error('Select at least one enabled shape.')
 if(nodeIds.length>256)throw new Error('Selection sets support up to 256 shapes.')
 if(!trimmed||trimmed.length>60)throw new Error('Use a set name of 1–60 characters.')
 if(doc.selectionSets?.some(s=>s.id!==id&&s.name.toLowerCase()===trimmed.toLowerCase()))throw new Error('That selection set name is already used.')
 if(id&&!doc.selectionSets?.some(s=>s.id===id))throw new Error('This selection set no longer exists.')
 const entry={id:id??crypto.randomUUID(),name:trimmed,nodeIds},sets=id?doc.selectionSets!.map(s=>s.id===id?entry:s):[...doc.selectionSets??[],entry]
 // Validate metadata while retaining geometry references so saving a set does not rebuild the model.
 parseModelDocument({...doc,selectionSets:sets})
 return {...doc,selectionSets:sets,revision:doc.revision+1,updatedAt:new Date().toISOString()}
}
export function resolveSelectionSet(doc:ModelDocument,set:SelectionSet){
 const missing=set.nodeIds.filter(id=>!doc.nodes.some(n=>n.id===id)).length
 const nodes=completeSelection(doc.nodes,set.nodeIds),enabled=nodes.filter(n=>!n.suppressed)
 return {ids:enabled.map(n=>n.id),missing,suppressed:nodes.length-enabled.length,locked:enabled.filter(n=>n.locked).length,hidden:enabled.filter(n=>!n.visible).length}
}
export function renameSelectionSet(doc:ModelDocument,id:string,name:string):ModelDocument{
 const trimmed=name.trim()
 if(!doc.selectionSets?.some(s=>s.id===id))throw new Error('This selection set no longer exists.')
 if(!trimmed||trimmed.length>60)throw new Error('Use a set name of 1–60 characters.')
 if(doc.selectionSets.some(s=>s.id!==id&&s.name.toLowerCase()===trimmed.toLowerCase()))throw new Error('That selection set name is already used.')
 return {...doc,selectionSets:doc.selectionSets.map(s=>s.id===id?{...s,name:trimmed}:s),revision:doc.revision+1,updatedAt:new Date().toISOString()}
}

import {expect,it} from 'vitest'
import {createDocument,createNode,parseModelDocument} from '@formforge/model'
import {saveSelectionSet,resolveSelectionSet} from './selectionSets'
it('keeps assemblies and cutters together and persists stable references, including missing shapes',()=>{
 const a=createNode('box'),b=createNode('cylinder','cut'),c=createNode('sphere');a.combined=b.combined=true;a.groupId=b.groupId='g';b.visible=false
 const doc={...createDocument(),nodes:[a,b,c]},saved=saveSelectionSet(doc,'Housing',[a.id])
 expect(saved.selectionSets![0]!.nodeIds).toEqual([a.id,b.id])
 const reopened=parseModelDocument({...saved,nodes:[{...b,locked:true},c]}),resolved=resolveSelectionSet(reopened,reopened.selectionSets![0]!)
 expect(resolved.missing).toBe(1);expect(resolved.locked).toBe(1);expect(resolved.ids).toEqual([b.id])
 expect(()=>saveSelectionSet(saved,'housing',[c.id])).toThrow(/name/i)
 expect(()=>saveSelectionSet(doc,'Empty',[])).toThrow(/select/i)
 expect(()=>parseModelDocument({...saved,selectionSets:[...saved.selectionSets!,...saved.selectionSets!]})).toThrow()
})

it('preserves missing and suppressed references when renaming a saved set',async()=>{
 const {renameSelectionSet}=await import('./selectionSets'),node=createNode('box'),doc=saveSelectionSet({...createDocument(),nodes:[node]},'Body',[node.id]),missing={...doc,nodes:[]}
 const next=renameSelectionSet(missing,doc.selectionSets![0]!.id,'Main body')
 expect(next.selectionSets![0]!.nodeIds).toEqual([node.id]);expect(next.nodes).toBe(missing.nodes)
})

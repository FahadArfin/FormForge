import {useEffect,useMemo,useRef,useState} from 'react'
import type {MeshPayload,ModelDocument} from '@formforge/model'
import {entityNodes,entityAnchor} from '@/lib/shapeEntities'
import {groupPreviewKey,localGroupMesh} from '@/lib/groupPreview'
import {evaluateSnapshot} from '@/geometry/evaluateSnapshot'
import {useEditor} from '@/store/editor'

// Evaluated group surfaces are display caches only. All editable operands remain
// in the document and normal transforms/undo continue to operate on those nodes.
export function useGroupPreviews(document:ModelDocument,showResult:boolean){
 const cache=useRef(new Map<string,MeshPayload>()),[version,refresh]=useState(0)
 const groups=useMemo(()=>{
  const seen=new Set<string>()
  return document.nodes.flatMap(n=>{
   if(!n.combined||!n.groupId||seen.has(n.id))return []
   const nodes=entityNodes(document.nodes,n.id);nodes.forEach(n=>seen.add(n.id))
   const anchor=entityAnchor(nodes,n.id)!
   return [{nodes,anchor,key:document.id+anchor.id+groupPreviewKey(nodes,anchor)}]
  })
 },[document.id,document.nodes])
 useEffect(()=>{
  if(showResult)return
  const controller=new AbortController()
  const activeKeys=new Set(groups.map(g=>g.key))
  for(const key of cache.current.keys())if(!activeKeys.has(key))cache.current.delete(key)
  const run=async()=>{
   for(const group of groups){
    if(controller.signal.aborted)return
    if(cache.current.has(group.key))continue
    try{
     const mesh=await evaluateSnapshot({...document,nodes:group.nodes,sculptStrokes:[]},controller.signal)
     if(controller.signal.aborted)return
     cache.current.set(group.key,localGroupMesh(mesh,group.anchor))
     refresh(n=>n+1)
     if(!mesh.indices.length)useEditor.getState().setNotice('This combination has no solid volume. Undo or Separate to adjust its shapes.')
    }catch(e){if(!controller.signal.aborted)useEditor.getState().setNotice(`Joined-shape preview unavailable: ${e instanceof Error?e.message:'Could not build geometry'}. Source shapes remain editable.`)}
   }
  }
  void run();return()=>controller.abort()
 },[groups,showResult])
 return useMemo(()=>{
 const previews=new Map<string,{key:string;mesh:MeshPayload}>(),hidden=new Set<string>()
 for(const group of groups){const mesh=cache.current.get(group.key);if(mesh){previews.set(group.anchor.id,{key:group.key,mesh});group.nodes.filter(n=>n.id!==group.anchor.id).forEach(n=>hidden.add(n.id))}}
 return {previews,hidden}
 },[groups,version])
}

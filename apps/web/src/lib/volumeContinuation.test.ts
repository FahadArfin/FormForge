import {expect,it,vi} from 'vitest'
import {createDocument,createNode,executeCommand,vec3,type ModelDocument} from '@formforge/model'
import {isVolumeContinuation} from './volumeContinuation'

function importedDocument(): ModelDocument {
 const node=createNode('mesh','add',vec3())
 node.mesh={positions:Array.from({length:90_000},(_,i)=>i%300),indices:Array.from({length:30_000},(_,i)=>i%30_000)}
 return {...createDocument(),nodes:[node],sculptStrokes:Array.from({length:100},(_,i)=>({id:String(i),nodeId:node.id,mode:'add',center:vec3(i,0,0),radius:3,strength:0.5,createdAt:''}))}
}

it('does no serialization for unchanged imported geometry and prior strokes during append and hover',()=>{
 let document=importedDocument()
 const stringify=vi.spyOn(JSON,'stringify')
 try{
  for(let i=0;i<40;i++){
   const previous=document
   document=executeCommand(document,{type:'add-sculpt-stroke',stroke:{...document.sculptStrokes[0]!,id:`new-${i}`,center:vec3(i,0,0)}})
   expect(isVolumeContinuation(previous,document)).toBe(true)
   expect(isVolumeContinuation(previous,document)).toBe(true) // stale-prefix hover
   expect(isVolumeContinuation(document,document)).toBe(true) // current hover
  }
  expect(stringify.mock.calls.length).toBe(0)
 }finally{stringify.mockRestore()}
})

it('accepts reconstructed exact snapshots and rejects edited inputs with reused metadata',()=>{
 const previous=importedDocument(),next=structuredClone(previous)
 next.sculptStrokes.push({...next.sculptStrokes[0]!,id:'new',mode:'carve'})
 expect(isVolumeContinuation(previous,next)).toBe(true)
 const changedMesh=structuredClone(next);changedMesh.nodes[0]!.mesh!.positions[50_000]=999
 expect(isVolumeContinuation(previous,changedMesh)).toBe(false)
 const changedStroke=structuredClone(next);changedStroke.sculptStrokes[50]!.radius=4
 expect(isVolumeContinuation(previous,changedStroke)).toBe(false)
 const changedPosition=structuredClone(next);changedPosition.sculptStrokes[50]!.center.x=999
 expect(isVolumeContinuation(previous,changedPosition)).toBe(false)
 expect(isVolumeContinuation(previous,{...next,sculptStrokes:next.sculptStrokes.slice(0,99)})).toBe(false)
 expect(isVolumeContinuation(previous,{...next,id:'another-project'})).toBe(false)
 expect(isVolumeContinuation(null,next)).toBe(false)
})

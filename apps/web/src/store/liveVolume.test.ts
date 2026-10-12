// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {createDocument,createNode,vec3,type MeshPayload} from '@formforge/model'
import {geometryClient} from '@/geometry/client'
import {useEditor} from './editor'
vi.mock('@/geometry/client',()=>({geometryClient:{evaluate:vi.fn(),cancel:vi.fn()}}))
vi.mock('@/lib/db',()=>({saveProject:vi.fn(async()=>{}),loadMostRecentProject:vi.fn(),deleteProject:vi.fn()}))
afterEach(()=>{useEditor.getState().cancelBuild();vi.clearAllTimers();vi.useRealTimers()})
it('delivers a useful in-flight prefix during movement then catches up without pointer-up',async()=>{
 vi.useFakeTimers()
 const doc={...createDocument(),nodes:[createNode('box','add',vec3())]}
 const mesh:MeshPayload={positions:new Float32Array([0,0,0,1,1,1]),indices:new Uint32Array([0,1,0]),volume:1,triangleCount:1}
 const pending:((mesh:MeshPayload)=>void)[]=[]
 vi.mocked(geometryClient.evaluate).mockImplementation(()=>new Promise(resolve=>pending.push(resolve)))
 useEditor.setState({document:doc,meshDocument:doc,mesh,buildMode:'automatic',geometryStatus:'ready',undoStack:[],redoStack:[],selectedNodeId:doc.nodes[0]!.id})
 useEditor.getState().addSculptStroke(vec3(),'add',3,0.5,'smooth')
 await vi.advanceTimersByTimeAsync(40)
 expect(pending).toHaveLength(1)
 const prefix=useEditor.getState().document
 for(let i=0;i<10;i++){useEditor.getState().addSculptStroke(vec3(i,0,0),'carve',3,0.5,'smooth',undefined,false);await vi.advanceTimersByTimeAsync(20)}
 expect(pending).toHaveLength(1)
 pending[0]!(mesh);await vi.advanceTimersByTimeAsync(40)
 expect(useEditor.getState().meshDocument).toBe(prefix)
 expect(useEditor.getState().geometryStatus).toBe('building')
 expect(pending).toHaveLength(2)
 pending[1]!(mesh);await vi.advanceTimersByTimeAsync(0)
 expect(useEditor.getState().meshDocument).toBe(useEditor.getState().document)
 expect(useEditor.getState().geometryStatus).toBe('ready')
 expect(useEditor.getState().undoStack).toHaveLength(1)
})
it.each(['undo','project','base','manual','cancel'] as const)('rejects pending live results after %s',async(change)=>{
 vi.useFakeTimers()
 const doc={...createDocument(),nodes:[createNode('box','add',vec3())]}
 const mesh:MeshPayload={positions:new Float32Array([0,0,0]),indices:new Uint32Array(),volume:0,triangleCount:0}
 let resolve!:(value:MeshPayload)=>void
 vi.mocked(geometryClient.evaluate).mockImplementation(()=>new Promise(done=>resolve=done))
 useEditor.setState({document:doc,meshDocument:doc,mesh,buildMode:'automatic',geometryStatus:'ready',undoStack:[],redoStack:[],selectedNodeId:doc.nodes[0]!.id})
 useEditor.getState().addSculptStroke(vec3(),'add',3,0.5,'smooth')
 await vi.advanceTimersByTimeAsync(32)
 if(change==='undo')useEditor.getState().undo()
 if(change==='project')useEditor.getState().newDocument()
 if(change==='base')useEditor.getState().updateNode(doc.nodes[0]!.id,{parameters:{...doc.nodes[0]!.parameters,width:31}})
 if(change==='manual')useEditor.getState().setBuildMode('manual')
 if(change==='cancel')useEditor.getState().cancelBuild()
 const before=useEditor.getState().meshDocument
 resolve(mesh);await vi.advanceTimersByTimeAsync(0)
 expect(useEditor.getState().meshDocument).toBe(before)
})
it('keeps two quick gestures and mirrored stamps in separate undo entries',async()=>{
 vi.useFakeTimers()
 const doc={...createDocument(),nodes:[createNode('box','add',vec3())]}
 useEditor.setState({document:doc,buildMode:'automatic',undoStack:[],redoStack:[],selectedNodeId:doc.nodes[0]!.id})
 for(let gesture=0;gesture<2;gesture++){
  useEditor.getState().addSculptStroke(vec3(gesture+1,0,0),'add',3,0.5,'smooth')
  useEditor.getState().addSculptStroke(vec3(-gesture-1,0,0),'add',3,0.5,'smooth',undefined,false)
 }
 expect(useEditor.getState().undoStack).toHaveLength(2)
 expect(useEditor.getState().document.sculptStrokes).toHaveLength(4)
 useEditor.getState().undo();expect(useEditor.getState().document.sculptStrokes).toHaveLength(2)
 useEditor.getState().undo();expect(useEditor.getState().document.sculptStrokes).toHaveLength(0)
 useEditor.getState().redo();expect(useEditor.getState().document.sculptStrokes).toHaveLength(2)
})
it('does not append a held gesture across undo or a changed document',()=>{
 vi.useFakeTimers()
 const doc={...createDocument(),nodes:[createNode('box','add',vec3())]}
 useEditor.setState({document:doc,buildMode:'automatic',undoStack:[],redoStack:[],selectedNodeId:doc.nodes[0]!.id})
 useEditor.getState().addSculptStroke(vec3(),'add',3,0.5,'smooth')
 useEditor.getState().undo()
 const restored=useEditor.getState().document
 useEditor.getState().addSculptStroke(vec3(1,0,0),'carve',3,0.5,'smooth',undefined,false)
 expect(useEditor.getState().document).toBe(restored)
})

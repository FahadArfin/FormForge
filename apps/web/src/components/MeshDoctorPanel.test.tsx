// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createNode, vec3 } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { repairMesh } from '@/lib/meshTools'
import { MeshDoctorPanel } from './MeshDoctorPanel'
const boundary=vi.hoisted(()=>({inspect:vi.fn()}))
vi.mock('@/geometry/client',()=>({geometryClient:{evaluate:vi.fn(()=>new Promise(()=>undefined))}}))
vi.mock('@/lib/db',()=>({saveProject:vi.fn(async()=>undefined),loadMostRecentProject:vi.fn(),deleteProject:vi.fn()}))
vi.mock('@/lib/meshInspectionClient',()=>({inspectSourceMesh:boundary.inspect}))
// WebGL is an external renderer unavailable in jsdom. Panel state and store writes remain real.
vi.mock('./MeshPreview',()=>({MeshPreview:()=>null}))
let host:HTMLDivElement,root:Root
beforeEach(()=>{
 vi.useFakeTimers();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});boundary.inspect.mockReset()
 const doc=createDocument(),node=createNode('mesh','add',vec3());node.name='Imported tetrahedron';node.mesh={positions:[0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],indices:[0,2,1,0,1,3,0,3,2,1,2,3,4,2,1],mask:[.2,0,0,0,.9]};doc.nodes=[node]
 useEditor.setState({document:doc,selectedNodeId:node.id,selectedNodeIds:[node.id],placingNodeId:null,undoStack:[],redoStack:[]})
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllTimers();vi.useRealTimers()})
const button=(label:RegExp)=>[...host.querySelectorAll('button')].find(b=>label.test(b.textContent??''))!
describe('Mesh Doctor preview and apply',()=>{
 it('previews cleanup without editing and applies it in one undo step',async()=>{
  const before=useEditor.getState().document;boundary.inspect.mockResolvedValue(repairMesh(before.nodes[0]!.mesh!))
  await act(async()=>root.render(<MeshDoctorPanel/>));await act(async()=>button(/Inspect mesh/).click())
  expect(useEditor.getState().document).toBe(before);expect(host.textContent).toMatch(/Before/);expect(host.textContent).toMatch(/After/)
  await act(async()=>button(/Apply cleanup/).click())
  expect(useEditor.getState().document.nodes[0]!.mesh!.indices).toHaveLength(12)
  expect(useEditor.getState().document.nodes[0]!.mesh!.mask![0]).toBe(.9)
  expect(useEditor.getState().undoStack).toEqual([before])
  await act(async()=>useEditor.getState().undo());expect(useEditor.getState().document).toBe(before)
 })
 it('rejects a preview after newer source edits',async()=>{
  let finish!:(result:ReturnType<typeof repairMesh>)=>void;boundary.inspect.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  const result=repairMesh(useEditor.getState().document.nodes[0]!.mesh!)
  await act(async()=>root.render(<MeshDoctorPanel/>));await act(async()=>button(/Inspect mesh/).click())
  await act(async()=>useEditor.getState().dispatch({type:'rename-document',name:'Newer work'}))
  const newer=useEditor.getState().document
  await act(async()=>finish(result))
  expect(button(/Apply cleanup/)).toBeUndefined();expect(useEditor.getState().document).toBe(newer)
 })
 it('checks the current lock again at apply time',async()=>{
  const before=useEditor.getState().document;boundary.inspect.mockResolvedValue(repairMesh(before.nodes[0]!.mesh!))
  await act(async()=>root.render(<MeshDoctorPanel/>));await act(async()=>button(/Inspect mesh/).click())
  before.nodes[0]!.locked=true
  await act(async()=>button(/Apply cleanup/).click())
  expect(useEditor.getState().undoStack).toHaveLength(0);expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/lock|changed/i)
 })
 it('refuses a stale apply before React has rendered a changed document',async()=>{
  const before=useEditor.getState().document;boundary.inspect.mockResolvedValue(repairMesh(before.nodes[0]!.mesh!))
  await act(async()=>root.render(<MeshDoctorPanel/>));await act(async()=>button(/Inspect mesh/).click())
  const apply=button(/Apply cleanup/)
  await act(async()=>{useEditor.getState().dispatch({type:'rename-document',name:'Newer source'});apply.click()})
  expect(useEditor.getState().document.nodes[0]!.mesh).toBe(before.nodes[0]!.mesh)
  expect(useEditor.getState().undoStack).toHaveLength(1)
 })
 it('cancels a pending analysis and ignores its late result',async()=>{
  let finish!:(result:ReturnType<typeof repairMesh>)=>void;boundary.inspect.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  const before=useEditor.getState().document
  await act(async()=>root.render(<MeshDoctorPanel/>));await act(async()=>button(/Inspect mesh/).click())
  await act(async()=>button(/Cancel inspection/).click());await act(async()=>finish(repairMesh(before.nodes[0]!.mesh!)))
  expect(button(/Apply cleanup/)).toBeUndefined();expect(useEditor.getState().document).toBe(before)
  expect(boundary.inspect.mock.calls[0]![1].aborted).toBe(true)
 })
 it('clears a ready preview when the selected mesh changes',async()=>{
  boundary.inspect.mockResolvedValue(repairMesh(useEditor.getState().document.nodes[0]!.mesh!))
  await act(async()=>root.render(<MeshDoctorPanel/>));await act(async()=>button(/Inspect mesh/).click())
  await act(async()=>useEditor.setState({selectedNodeId:null,selectedNodeIds:[]}))
  expect(button(/Apply cleanup/)).toBeUndefined();expect(host.textContent).toMatch(/Select one/i)
 })
 it('does not offer inspection during placement or cleanup for a locked source',async()=>{
  const node=useEditor.getState().document.nodes[0]!;node.locked=true
  await act(async()=>root.render(<MeshDoctorPanel/>))
  expect(host.textContent).toMatch(/unlock/i)
  await act(async()=>useEditor.setState({placingNodeId:node.id}))
  expect(button(/Inspect mesh/).disabled).toBe(true)
 })
})

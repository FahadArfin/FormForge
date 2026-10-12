// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Blob as NodeBlob } from 'node:buffer'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createDocument, createNode } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { AssemblyInventoryPanel } from './AssemblyInventoryPanel'
const download = vi.hoisted(() => vi.fn())
vi.mock('@/geometry/client', () => ({ geometryClient: { evaluate: vi.fn(() => new Promise(() => undefined)) } }))
vi.mock('@/lib/db', () => ({saveProject:vi.fn(async()=>undefined),loadMostRecentProject:vi.fn(),deleteProject:vi.fn()}))
vi.mock('@/lib/download', async original => ({...await original<typeof import('@/lib/download')>(),downloadBlob:download}))
let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true}); vi.stubGlobal('Blob',NodeBlob);download.mockReset()
  const a=createNode('box'),b=createNode('cylinder','cut');a.name='Base';a.combined=b.combined=true;a.groupId=b.groupId='g'
  useEditor.setState({document:{...createDocument(),nodes:[a,b]},selectedNodeIds:[],selectedNodeId:null,placingNodeId:null,undoStack:[],redoStack:[]})
  host=document.createElement('div');document.body.append(host);root=createRoot(host)
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()})
const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!
it('lists and selects complete source components without editing the project',async()=>{
  const original=useEditor.getState().document
  await act(async()=>root.render(<AssemblyInventoryPanel/>))
  expect(host.textContent).toContain('1 component')
  await act(async()=>button('Select component').click())
  expect(useEditor.getState().selectedNodeIds).toEqual(original.nodes.map(n=>n.id))
  expect(useEditor.getState().document).toBe(original)
  expect(useEditor.getState().undoStack).toHaveLength(0)
})
it('downloads current report metadata and excludes suppressed rows',async()=>{
  await act(async()=>root.render(<AssemblyInventoryPanel/>))
  await act(async()=>button('Download inventory JSON').click())
  const result=JSON.parse(await (download.mock.calls[0]![0] as Blob).text())
  expect(result.source.projectId).toBe(useEditor.getState().document.id)
  expect(result.components[0].cutFeatures).toBe(1)
  await act(async()=>useEditor.setState(s=>({document:{...s.document,nodes:s.document.nodes.map(n=>({...n,suppressed:true}))}})))
  expect(button('Download inventory JSON').disabled).toBe(true)
  expect(host.textContent).toContain('No active solid components')
})
it('does not export an old report when the document changes before React rerenders',async()=>{
  await act(async()=>root.render(<AssemblyInventoryPanel/>))
  const old=button('Download inventory JSON')
  await act(async()=>{useEditor.setState(s=>({document:{...s.document,name:'New project'}}));old.click()})
  expect(download).not.toHaveBeenCalled()
})
it('offers selected scope and explains source grouping limits',async()=>{
  await act(async()=>root.render(<AssemblyInventoryPanel/>))
  await act(async()=>{const field=host.querySelector('select')!;field.value='selected';field.dispatchEvent(new Event('change',{bubbles:true}))})
  expect(host.textContent).toContain('Select a solid or assembly')
  expect(button('Download inventory CSV').disabled).toBe(true)
  expect(host.textContent).toMatch(/not.*physical solids/)
})
it('uses the normal object-selection lifecycle to clear old mesh component picks',async()=>{
 useEditor.setState({meshComponentMode:'vertex',selectedMeshVertices:[123],selectedMeshEdges:[1,2],selectedMeshFaces:[9],showResult:true})
 await act(async()=>root.render(<AssemblyInventoryPanel/>))
 await act(async()=>button('Select component').click())
 expect(useEditor.getState().meshComponentMode).toBe('object')
 expect(useEditor.getState().selectedMeshVertices).toEqual([])
 expect(useEditor.getState().selectedMeshEdges).toEqual([])
 expect(useEditor.getState().selectedMeshFaces).toEqual([])
 expect(useEditor.getState().showResult).toBe(false)
})

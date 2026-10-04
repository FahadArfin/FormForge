// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { inspectMeshProperties } from '@/lib/meshInspection'
import { PartPropertiesPanel } from './PartPropertiesPanel'
const boundary=vi.hoisted(()=>({inspect:vi.fn(),download:vi.fn()}))
vi.mock('@/geometry/client',()=>({geometryClient:{evaluate:vi.fn(()=>new Promise(()=>undefined))}}))
vi.mock('@/lib/db',()=>({saveProject:vi.fn(async()=>undefined),loadMostRecentProject:vi.fn(),deleteProject:vi.fn()}))
vi.mock('@/lib/meshInspectionClient',()=>({inspectDocumentProperties:boundary.inspect}))
vi.mock('@/lib/download',async original=>({...await original<typeof import('@/lib/download')>(),downloadBlob:boundary.download}))
const properties=inspectMeshProperties({positions:[0,0,0,1,0,0,0,1,0,0,0,1],indices:[0,2,1,0,1,3,0,3,2,1,2,3]})
let host:HTMLDivElement,root:Root
beforeEach(()=>{
 vi.useFakeTimers();vi.stubGlobal('Blob',NodeBlob);Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});boundary.inspect.mockReset();boundary.download.mockReset()
 const document=createDocument();useEditor.setState({document,selectedNodeId:document.nodes[0]!.id,selectedNodeIds:[document.nodes[0]!.id],placingNodeId:null,undoStack:[],redoStack:[]})
 host=window.document.createElement('div');window.document.body.append(host);root=createRoot(host)
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals()})
const button=(label:RegExp)=>[...host.querySelectorAll('button')].find(b=>label.test(b.textContent??''))!
const scope=async(value:string)=>act(async()=>{const field=host.querySelector('select')!;field.value=value;field.dispatchEvent(new Event('change',{bubbles:true}))})
describe('evaluated part properties panel',()=>{
 it('shows evaluated properties and downloads a report tied to that source',async()=>{
  const before=useEditor.getState().document;boundary.inspect.mockResolvedValue(properties)
  await act(async()=>root.render(<PartPropertiesPanel/>));await act(async()=>button(/Calculate properties/).click())
  expect(host.textContent).toMatch(/Surface area/);expect(host.textContent).toMatch(/0.166667/);expect(host.textContent).toMatch(/uniform density/i)
  await act(async()=>button(/Download JSON report/).click())
  const blob=boundary.download.mock.calls[0]![0] as Blob,report=JSON.parse(await blob.text())
  expect(report.source.projectId).toBe(before.id);expect(report.scope).toBe('whole');expect(report.properties.volume).toBeCloseTo(1/6)
  expect(useEditor.getState().document).toBe(before)
 })
 it('removes a report and download when the model changes',async()=>{
  boundary.inspect.mockResolvedValue(properties)
  await act(async()=>root.render(<PartPropertiesPanel/>));await act(async()=>button(/Calculate properties/).click())
  const oldDownload=button(/Download JSON report/)
  await act(async()=>{useEditor.getState().dispatch({type:'rename-document',name:'Changed'});oldDownload.click()})
  expect(button(/Download JSON report/)).toBeUndefined()
  expect(boundary.download).not.toHaveBeenCalled()
 })
 it('rejects an in-flight result after a scope change',async()=>{
  let finish!:(value:typeof properties)=>void;boundary.inspect.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  await act(async()=>root.render(<PartPropertiesPanel/>));await act(async()=>button(/Calculate properties/).click())
  await scope('selected');await act(async()=>finish(properties))
  expect(button(/Download JSON report/)).toBeUndefined();expect(boundary.inspect.mock.calls[0]![3].aborted).toBe(true)
 })
 it('clears selected-part properties when selection changes',async()=>{
  boundary.inspect.mockResolvedValue(properties)
  await act(async()=>root.render(<PartPropertiesPanel/>));await scope('selected');await act(async()=>button(/Calculate properties/).click())
  await act(async()=>useEditor.setState({selectedNodeId:null,selectedNodeIds:[]}))
  expect(button(/Download JSON report/)).toBeUndefined();expect(button(/Calculate properties/).disabled).toBe(true)
 })
 it('makes unknown volume explicit for open geometry',async()=>{
  boundary.inspect.mockResolvedValue({...properties,volume:null,centroid:null,volumeReason:'An open surface has unknown solid volume.'})
  await act(async()=>root.render(<PartPropertiesPanel/>));await act(async()=>button(/Calculate properties/).click())
  expect(host.textContent).toMatch(/Unknown/);expect(host.textContent).toMatch(/open surface/)
 })
 it('cancels active work and releases it on unmount',async()=>{
  let finish!:(value:typeof properties)=>void;boundary.inspect.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  await act(async()=>root.render(<PartPropertiesPanel/>));await act(async()=>button(/Calculate properties/).click())
  await act(async()=>button(/Cancel calculation/).click());await act(async()=>finish(properties))
  expect(button(/Download JSON report/)).toBeUndefined();expect(boundary.inspect.mock.calls[0]![3].aborted).toBe(true)
  await act(async()=>button(/Calculate properties/).click());await act(async()=>root.render(null))
  expect(boundary.inspect.mock.calls[1]![3].aborted).toBe(true)
 })
})

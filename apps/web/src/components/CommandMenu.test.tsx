// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { createDocument } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { CommandMenu } from './CommandMenu'
vi.mock('@/geometry/client',()=>({geometryClient:{evaluate:vi.fn(()=>new Promise(()=>undefined))}}))
let host:HTMLDivElement,root:Root
const onExport=vi.fn(),onClose=vi.fn()
beforeEach(async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.clearAllMocks()
 HTMLDialogElement.prototype.showModal=function(){this.open=true};HTMLDialogElement.prototype.close=function(){this.open=false};HTMLElement.prototype.scrollIntoView=vi.fn()
 useEditor.setState({document:createDocument('Commands'),selectedNodeId:null,selectedNodeIds:[],undoStack:[],redoStack:[]})
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
 await act(async()=>root.render(<CommandMenu onClose={onClose} onExport={onExport} onImport={vi.fn()} onProjects={vi.fn()} onHelp={vi.fn()} onGenerate={vi.fn()}/>))
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove()})
async function search(value:string){await act(async()=>{const input=host.querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})}
it('starts with a short useful list and keeps every command searchable',async()=>{
 expect(host.querySelectorAll('[role="option"]').length).toBeLessThanOrEqual(8)
 expect(host.querySelectorAll('[role="option"][aria-disabled="true"]')).toHaveLength(0)
 const browse=[...host.querySelectorAll('button')].find(button=>button.textContent?.startsWith('Browse all'))
 expect(browse).toBeTruthy();await act(async()=>browse!.click());expect(host.querySelectorAll('[role="option"]').length).toBeGreaterThan(50)
 await search('cross section');expect(host.querySelectorAll('[role="option"]')).toHaveLength(1);expect(host.textContent).toContain('Inspect a cross section')
})
it('explains the actual reason Undo is unavailable and never runs it',async()=>{
 const undo=vi.spyOn(useEditor.getState(),'undo');await search('undo')
 expect(host.querySelector('[role="option"]')?.getAttribute('aria-disabled')).toBe('true')
 expect(host.textContent).toContain('Make a change in this project first.')
 await act(async()=>host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})))
 expect(undo).not.toHaveBeenCalled();expect(onClose).not.toHaveBeenCalled();undo.mockRestore()
})
it('runs a searched command with Enter and recovers from an empty search',async()=>{
 await search('not-a-real-command');expect(host.textContent).toContain('No commands found')
 await search('export or download backup');await act(async()=>host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})))
 expect(onExport).toHaveBeenCalledOnce();expect(onClose).toHaveBeenCalledOnce()
})

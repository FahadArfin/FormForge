// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createNode } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { evaluate } from '../geometry/geometry.worker'
import { EngineeringInspector } from './EngineeringInspector'
vi.mock('@/geometry/client',()=>({geometryClient:{evaluate:vi.fn(()=>new Promise(()=>undefined))}}))
vi.mock('@/lib/db',()=>({saveProject:vi.fn(async()=>undefined),loadMostRecentProject:vi.fn(),deleteProject:vi.fn()}))
let host:HTMLDivElement,root:Root
beforeEach(async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 const doc={...createDocument(),nodes:[createNode('box')]}, mesh=await evaluate(doc)
 useEditor.setState({document:doc,mesh,meshDocument:doc,geometryStatus:'ready',placingNodeId:null,selectedNodeId:null,selectedNodeIds:[],undoStack:[],redoStack:[]})
 host=window.document.createElement('div');window.document.body.append(host);root=createRoot(host)
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove()})
const button=(label:RegExp)=>[...host.querySelectorAll('button')].find(b=>label.test(b.textContent??''))!
it('proposes the chosen orientation without mutating the document and drops stale scores after edits',async()=>{
 const callback=vi.fn(),source=useEditor.getState().document
 await act(async()=>root.render(<EngineeringInspector onProposeOrientation={callback}/>))
 await act(async()=>button(/Compare six orientations/).click())
 const preview=button(/Preview orientation/)
 expect(preview).toBeDefined()
 await act(async()=>preview.click())
 expect(callback).toHaveBeenCalledTimes(1)
 expect(useEditor.getState().document).toBe(source)
 await act(async()=>{useEditor.setState({document:{...source,revision:source.revision+1}});preview.click()})
 expect(callback).toHaveBeenCalledTimes(1)
 expect(button(/Preview orientation/)).toBeUndefined()
 expect(button(/Compare six orientations/).disabled).toBe(true)
})
it('does not analyze an in-flight placement or enable orientation previews without a proposal handler',async()=>{
 await act(async()=>root.render(<EngineeringInspector/>))
 await act(async()=>button(/Compare six orientations/).click())
 expect(button(/Preview orientation/).disabled).toBe(true)
 await act(async()=>useEditor.setState({placingNodeId:'placing'}))
 expect(button(/Compare six orientations/).disabled).toBe(true)
 expect(button(/Preview orientation/)).toBeUndefined()
})
it('distinguishes equally named hole targets and shows a compact findings summary',async()=>{
 const source=useEditor.getState().document
 const a=createNode('cylinder'),b=createNode('cylinder');a.name=b.name='Mounting hole';a.boolean=b.boolean='cut';b.transform.position.x=40
 const doc={...source,nodes:[...source.nodes,a,b]}
 useEditor.setState({document:doc})
 await act(async()=>root.render(<EngineeringInspector/>))
 const options=[...host.querySelectorAll('select')][0]!.querySelectorAll('option')
 expect(options[1]!.textContent).not.toBe(options[2]!.textContent)
 expect(host.querySelector('[aria-label="Findings summary"]')).not.toBeNull()
 expect(button(/^Printer setup$/)).toBeDefined()
})

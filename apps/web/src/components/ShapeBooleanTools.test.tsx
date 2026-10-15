// @vitest-environment jsdom
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {createDocument,createNode} from '@formforge/model'
import {useEditor} from '@/store/editor'
import {ShapeBooleanTools} from './ShapeBooleanTools'
vi.mock('@/geometry/client',()=>({geometryClient:{evaluate:vi.fn(),cancel:vi.fn()}}))
vi.mock('@/lib/db',()=>({saveProject:vi.fn(async()=>undefined),loadMostRecentProject:vi.fn(),deleteProject:vi.fn()}))
let host:HTMLDivElement,root:Root
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();host=document.createElement('div');document.body.append(host);root=createRoot(host);useEditor.setState({document:{...createDocument(),nodes:[createNode('box'),createNode('sphere')]},selectedNodeId:null,selectedNodeIds:[],placingNodeId:null,undoStack:[],redoStack:[]})})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllTimers();vi.useRealTimers()})
const button=(name:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===name)!
it('enables explicit operations for multiple shapes and exposes Separate for a joined entity',async()=>{
 await act(async()=>root.render(<ShapeBooleanTools/>))
 expect(button('Join').disabled).toBe(true)
 await act(async()=>useEditor.getState().selectAll())
 expect(button('Exclude').disabled).toBe(false)
 await act(async()=>button('Exclude').click())
 expect(useEditor.getState().document.nodes.map(n=>n.boolean)).toEqual(['add','cut'])
 expect(button('Join').disabled).toBe(true)
 await act(async()=>button('Separate').click())
 expect(useEditor.getState().document.nodes.every(n=>!n.groupId)).toBe(true)
 expect(button('Intersect').disabled).toBe(false)
})

it('enables another combination for a joined object plus a new shape',async()=>{
 await act(async()=>root.render(<ShapeBooleanTools/>))
 await act(async()=>{useEditor.getState().selectAll();useEditor.getState().combineSelected('subtract')})
 const before=useEditor.getState().document.nodes,extra=createNode('box')
 await act(async()=>{useEditor.getState().dispatch({type:'add-node',node:extra});useEditor.getState().selectNode(extra.id,true)})
 expect(button('Join').disabled).toBe(false)
 await act(async()=>button('Join').click())
 expect(useEditor.getState().document.nodes.every(n=>n.booleanPath?.length===1)).toBe(true)
 expect(useEditor.getState().document.nodes[1]!.boolean).toBe('cut')
 await act(async()=>button('Separate').click())
 expect(useEditor.getState().document.nodes.slice(0,2)).toEqual(before)
})

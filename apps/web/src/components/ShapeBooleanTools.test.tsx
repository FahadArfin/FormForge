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

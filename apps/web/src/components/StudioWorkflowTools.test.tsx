// @vitest-environment jsdom
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {createDocument,createNode} from '@formforge/model'
import {useEditor} from '@/store/editor'
import {PrecisionTransformPanel} from './PrecisionTransformPanel'
import {SessionHistoryPanel} from './SessionHistoryPanel'
import {ManualBuildNotice} from './BuildControls'
vi.mock('@/geometry/client',()=>({geometryClient:{evaluate:vi.fn(),cancel:vi.fn()}}))
vi.mock('@/lib/db',()=>({saveProject:vi.fn(async()=>undefined),loadMostRecentProject:vi.fn(),deleteProject:vi.fn()}))
let host:HTMLDivElement,root:Root
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();host=document.createElement('div');document.body.append(host);root=createRoot(host);const node=createNode('box'),doc={...createDocument(),nodes:[node]};useEditor.setState({document:doc,meshDocument:doc,buildMode:'manual',geometryStatus:'ready',selectedNodeIds:[node.id],selectedNodeId:node.id,placingNodeId:null,undoStack:[],redoStack:[]})})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllTimers();vi.useRealTimers()})
const button=(name:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===name)!
async function enter(label:string,value:string){const input=host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;await act(async()=>input.focus());await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))});await act(async()=>input.blur())}
it('keeps numeric drafts out of the document and applies an assembly in one undo step',async()=>{const original=useEditor.getState().document;await act(async()=>root.render(<PrecisionTransformPanel/>));await enter('Assembly move X (millimeters)','1/2 in');expect(useEditor.getState().document).toBe(original);await act(async()=>button('Apply transform').click());expect(useEditor.getState().document.nodes[0]!.transform.position.x).toBe(12.7);expect(useEditor.getState().undoStack).toEqual([original]);await act(async()=>useEditor.getState().undo());expect(useEditor.getState().document).toBe(original)})
it('resets drafts after the selection changes and prevents locked changes',async()=>{await act(async()=>root.render(<PrecisionTransformPanel/>));await enter('Assembly move X (millimeters)','25');await act(async()=>useEditor.getState().selectNode(null));expect(button('Apply transform').disabled).toBe(true);const n=useEditor.getState().document.nodes[0]!;await act(async()=>{useEditor.getState().selectNode(n.id);useEditor.getState().updateNode(n.id,{locked:true})});expect(host.textContent).toContain('Unlock every affected shape');expect(button('Apply transform').disabled).toBe(true)})
it('jumps directly to a past state and keeps the future reachable',async()=>{const a=useEditor.getState().document,b={...a,name:'Later'};useEditor.setState({document:b,undoStack:[a]});await act(async()=>root.render(<SessionHistoryPanel/>));expect(host.querySelector('[aria-current="step"]')?.textContent).toContain('Rename project');await act(async()=>host.querySelector('button')!.click());expect(useEditor.getState().document).toBe(a);expect(host.textContent).toContain('Redo 1 edit');await act(async()=>host.querySelectorAll('button')[1]!.click());expect(useEditor.getState().document).toBe(b)})
it('shows manual stale state, and removes it when automatic rebuilding is restored',async()=>{const before=useEditor.getState().document;useEditor.setState({document:{...before,name:'changed'},geometryStatus:'idle'});await act(async()=>root.render(<ManualBuildNotice/>));expect(host.textContent).toContain('Preview needs a rebuild');await act(async()=>button('Use automatic').click());expect(useEditor.getState().buildMode).toBe('automatic');expect(host.textContent).toBe('')})

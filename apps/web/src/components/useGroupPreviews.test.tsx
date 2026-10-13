// @vitest-environment jsdom
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {createDocument,createNode,type ModelDocument} from '@formforge/model'
import {useGroupPreviews} from './useGroupPreviews'
import {evaluateSnapshot} from '@/geometry/evaluateSnapshot'
vi.mock('@/geometry/evaluateSnapshot',()=>({evaluateSnapshot:vi.fn(async()=>({positions:new Float32Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2]),volume:1,triangleCount:1}))}))
let host:HTMLDivElement,root:Root
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');root=createRoot(host);vi.clearAllMocks()})
afterEach(async()=>{await act(async()=>root.unmount());host.remove()})
function Probe({document}:{document:ModelDocument}){const result=useGroupPreviews(document,false);return <span>{result.previews.size}:{[...result.previews.keys()].join(',')}</span>}
it('retains every active preview beyond 32 groups and chooses a visible anchor for legacy groups',async()=>{
 const nodes=Array.from({length:33},(_,i)=>{const a=createNode('box'),b=createNode('box');a.id=`a${i}`;b.id=`b${i}`;for(const n of [a,b]){n.groupId=`g${i}`;n.combined=true}return [a,b]}).flat()
 nodes[0]!.visible=false
 const document={...createDocument(),nodes}
 await act(async()=>root.render(<Probe document={document}/>))
 expect(host.textContent).toMatch(/^33:b0,a1,/)
 expect(evaluateSnapshot).toHaveBeenCalledTimes(33)
 await act(async()=>root.render(<Probe document={{...document,name:'Renamed'}}/>))
 expect(host.textContent).toMatch(/^33:/)
 expect(evaluateSnapshot).toHaveBeenCalledTimes(33)
})

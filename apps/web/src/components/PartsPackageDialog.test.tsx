// @vitest-environment jsdom
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it,vi} from 'vitest'
import {createDocument} from '@formforge/model'
import {useEditor} from '@/store/editor'
import {PartsPackageDialog} from './PartsPackageDialog'
import {evaluateParts,createPartsPackage} from '@/lib/partsPackage'
import {downloadBlob} from '@/lib/download'
vi.mock('@/lib/partsPackage',async()=>({...await vi.importActual('@/lib/partsPackage'),evaluateParts:vi.fn(),createPartsPackage:vi.fn()}))
vi.mock('@/lib/download',async()=>({...await vi.importActual('@/lib/download'),downloadBlob:vi.fn()}))
vi.mock('./MeshPreview',()=>({MeshPreview:()=>null}))
vi.mock('@/lib/db',()=>({saveProject:vi.fn(),loadMostRecentProject:vi.fn(),deleteProject:vi.fn()}))
it('aborts parts packaging and suppresses its late download when the project changes',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLDialogElement.prototype.showModal=function(){this.open=true};HTMLDialogElement.prototype.close=function(){this.open=false}
 useEditor.setState({document:createDocument(),selectedNodeIds:[],placingNodeId:null})
 const mesh={positions:new Float32Array([0,0,0,10,10,10]),indices:new Uint32Array([0,1,0]),triangleCount:1,volume:1}
 vi.mocked(evaluateParts).mockResolvedValue([mesh]);vi.mocked(downloadBlob).mockClear();let finish:(b:Blob)=>void=()=>{},signal:AbortSignal|undefined
 vi.mocked(createPartsPackage).mockImplementation((_d,_p,_f,_s,abort)=>{signal=abort;return new Promise(resolve=>{finish=resolve})})
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 try{await act(async()=>root.render(<PartsPackageDialog onClose={()=>{}}/>));await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Download parts ZIP')!.click());await act(async()=>useEditor.setState({document:createDocument()}));expect(signal?.aborted).toBe(true);await act(async()=>finish(new Blob(['late'])));expect(downloadBlob).not.toHaveBeenCalled()}
 finally{await act(async()=>root.unmount());host.remove()}
})

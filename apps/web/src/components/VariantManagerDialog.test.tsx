// @vitest-environment jsdom
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it,vi} from 'vitest'
import {createDocument} from '@formforge/model'
import {useEditor} from '@/store/editor'
import {VariantManagerDialog} from './VariantManagerDialog'
import {createVariantPackage} from '@/lib/variantPackage'
import {downloadBlob} from '@/lib/download'
vi.mock('@/lib/variantPackage',async()=>({...await vi.importActual('@/lib/variantPackage'),createVariantPackage:vi.fn()}))
vi.mock('@/lib/download',async()=>({...await vi.importActual('@/lib/download'),downloadBlob:vi.fn()}))
vi.mock('@/lib/db',()=>({saveProject:vi.fn(),loadMostRecentProject:vi.fn(),deleteProject:vi.fn()}))
it.each(['cancel','project change','close'])('never downloads a late variant ZIP after %s',async(action)=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLDialogElement.prototype.showModal=function(){this.open=true};HTMLDialogElement.prototype.close=function(){this.open=false}
 const parameters=[{id:'w',name:'Width',expression:'20',value:20,unit:'mm' as const}],doc={...createDocument(),namedParameters:parameters,parameterVariants:[{id:'small',name:'Small',parameters}]}
 useEditor.setState({document:doc,placingNodeId:null});let finish:(blob:Blob)=>void=()=>{},signal:AbortSignal|undefined
 vi.mocked(downloadBlob).mockClear();vi.mocked(createVariantPackage).mockImplementation((_d,_ids,_format,abort)=>{signal=abort;return new Promise(resolve=>{finish=resolve})})
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let mounted=true
 try{
  await act(async()=>root.render(<VariantManagerDialog onClose={()=>{}}/>))
  await act(async()=>document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
  const button=(text:string)=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)!
  await act(async()=>button('Download variants ZIP').click())
  if(action==='cancel')await act(async()=>button('Cancel export').click())
  else if(action==='project change')await act(async()=>useEditor.setState({document:createDocument()}))
  else {await act(async()=>root.unmount());mounted=false}
  expect(signal?.aborted).toBe(true);await act(async()=>finish(new Blob(['late result'])));expect(downloadBlob).not.toHaveBeenCalled()
 }finally{if(mounted)await act(async()=>root.unmount());host.remove()}
})

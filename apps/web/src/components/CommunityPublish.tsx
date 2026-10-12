import {useEffect,useState} from 'react'
import {Box,Globe,HardDrive,Layers3} from 'lucide-react'
import type {ModelDocument} from '@formforge/model'
import {communityCategories,communitySeed,saveShowcaseModel,type CommunityModel} from '@/lib/community'
import {normalizeCommunityTags} from '@/lib/communityDiscovery'
import {publicCommunityModel,type PublicCommunityModel} from '@/lib/communityCloud'
import {cloudRequest,signInPath} from '@/lib/cloud'
import {cachedProjectThumbnail,renderProjectThumbnails} from '@/lib/projectThumbnails'
import {WorkspaceDialog} from './WorkspaceDialog'

export function CommunityPublish({document,existing,signedIn,onClose,onSaved}:{document:ModelDocument;existing?:CommunityModel;signedIn:boolean;onClose:()=>void;onSaved:(model:CommunityModel)=>void}){
 const [title,setTitle]=useState(existing?.title??document.name),[description,setDescription]=useState(existing?.description??'')
 const [category,setCategory]=useState(existing?.category??'Organization'),[tags,setTags]=useState(existing?.tags.join(', ')??'editable, parametric')
 const [license,setLicense]=useState(document.communitySource?.license==='CC BY-SA 4.0'?'CC BY-SA 4.0':'CC BY 4.0')
 const [author,setAuthor]=useState(()=>{try{return localStorage.getItem('printlab-community-alias')??''}catch{return ''}})
 const [visibility,setVisibility]=useState<'local'|'public'>('local'),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [image,setImage]=useState(cachedProjectThumbnail(document)??'')
 useEffect(()=>{const abort=new AbortController();void renderProjectThumbnails([document],abort.signal,(_key,preview)=>setImage(preview??''));return()=>abort.abort()},[document])
 const parsedTags=normalizeCommunityTags(tags)
 const submit=async()=>{
  if(busy)return
  const rawTags=tags.split(',').map(t=>t.trim()).filter(Boolean)
  if(rawTags.length>10||rawTags.some(t=>!normalizeCommunityTags(t).length)){setError('Use up to 10 comma-separated tags, each 1–32 letters, numbers or hyphens.');return}
  setBusy(true);setError('')
  try{
   let saved:CommunityModel
   if(visibility==='public'){
    const result=await cloudRequest<{model:PublicCommunityModel}>('/community',{method:'POST',body:{title:title.trim(),description:description.trim(),category,tags:parsedTags,license,creator:author.trim(),document,remixOf:document.communitySource?.modelId,image:image&&image.length<=250000?image:undefined,confirmPublic:confirmed}})
    saved=publicCommunityModel(result.model,document)
    try{localStorage.setItem('printlab-community-alias',author.trim())}catch{/* Publication already succeeded. */}
   }else{
    saved=saveShowcaseModel({...communitySeed[0]!,id:existing?.id??`user-${crypto.randomUUID()}`,title:title.trim(),description:description.trim(),category,tags:parsedTags,license,creator:'You',creatorHandle:'@you',creatorAvatar:'YO',createdAt:new Date().toISOString(),image,gallery:[],document:structuredClone(document),comments:[],remixOf:document.communitySource?.modelId})
   }
   onSaved(saved)
  }catch(e){setError(e instanceof Error?e.message:'Could not save. Your editable project is unchanged.')}finally{setBusy(false)}
 }
 return <WorkspaceDialog className="cw-publish-dialog" title="Share something you made" description="Keep a local showcase copy, or explicitly publish a design everyone can browse and remix." onClose={()=>{if(!busy)onClose()}}>
 <form onSubmit={event=>{event.preventDefault();void submit()}}>
 <div className="cw-publish-layout"><div className="cw-publish-preview">{image?<img src={image} alt={`Geometry preview of ${document.name}`}/>:<div><Box size={48}/><p>Preparing model preview…</p></div>}<p><Layers3 size={16}/> {document.nodes.length} editable features · {document.namedParameters.length} named parameters</p>{document.communitySource&&<aside>Remix of <strong>{document.communitySource.title}</strong> by {document.communitySource.creator}. Source license: {document.communitySource.license}.</aside>}</div>
 <div className="cw-form-fields"><fieldset className="cw-visibility"><legend>Where should this design live?</legend><label><input type="radio" name="visibility" checked={visibility==='local'} onChange={()=>setVisibility('local')}/><HardDrive size={17}/><span>On this device<small>Your private local showcase</small></span></label><label><input type="radio" name="visibility" checked={visibility==='public'} onChange={()=>setVisibility('public')}/><Globe size={17}/><span>Public community<small>Anyone can view, download and remix</small></span></label></fieldset>
 <label>Model title<input data-initial-focus required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></label>
 <label>Description<textarea required rows={3} maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="What does it do? What can other makers customize?"/></label>
 <div className="cw-field-row"><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}>{communityCategories.slice(2).map(c=><option key={c}>{c}</option>)}</select></label><label>License<select value={license} disabled={document.communitySource?.license==='CC BY-SA 4.0'} onChange={e=>setLicense(e.target.value)}><option>CC0</option><option>CC BY 4.0</option><option>CC BY-SA 4.0</option></select></label></div>
 <label>Tags, separated by commas<input value={tags} maxLength={330} onChange={e=>setTags(e.target.value)} placeholder="desk, organizer, beginner"/><small>Up to 10 tags. Spaces become hyphens.</small></label><div className="cw-tags">{parsedTags.map(tag=><span key={tag}>#{tag}</span>)}</div>
 {visibility==='public'&&<><label>Public display name<input required minLength={2} maxLength={40} value={author} onChange={e=>setAuthor(e.target.value)} placeholder="Your maker name"/></label><p className="cw-notice">This publishes a separate, downloadable snapshot of this entire project, including names and reference images. Print-test evidence and engineering conversation history are omitted. Remove private information before publishing. Your other projects stay private.</p><label className="cw-checkbox"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I have permission to share this project and its included content under {license}, and want it publicly available.</span></label></>}
 {error&&<p role="alert" className="cw-error">{error} {error.includes('Sign in')&&<a href={signInPath()} target="_top">Sign in again</a>}</p>}
 </div></div><footer className="cw-publish-footer"><small>{document.nodes.length?'Print fit, strength and safety have not been verified.':'Add a shape in Studio before sharing this project.'}</small>{visibility==='public'&&!signedIn?<a href={signInPath()} target="_top">Sign in with ChatGPT to publish</a>:<button className="cw-primary" disabled={busy||!document.nodes.length||!title.trim()||!description.trim()||(visibility==='public'&&(!confirmed||author.trim().length<2))}>{busy?'Saving…':visibility==='public'?'Publish publicly':existing?'Update local showcase':'Save to local showcase'}</button>}</footer>
 </form></WorkspaceDialog>
}

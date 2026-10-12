import {useEffect,useRef,useState} from 'react'
import {MessageCircle,RefreshCw,Send,Trash2,X} from 'lucide-react'
import {cloudRequest,signInPath} from '@/lib/cloud'
import type {PublicCommunityComment} from '@/lib/communityCloud'
import {saveCommunityComments,type CommunityComment,type CommunityModel} from '@/lib/community'

const message=(error:unknown)=>error instanceof Error?error.message:'Please try again.'
const date=(value:string)=>Number.isNaN(Date.parse(value))?'':new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})
export function CommunityComments({model,signedIn,onCount,onLocalChange}:{model:CommunityModel;signedIn:boolean;onCount:()=>void;onLocalChange:(model:CommunityModel)=>void}){
 const isLocal=model.creatorHandle==='@you'&&!model.public
 const [mode,setMode]=useState<'public'|'local'>(isLocal?'local':'public')
 const [comments,setComments]=useState<PublicCommunityComment[]>([]),[cursor,setCursor]=useState<string|null>(null)
 const draftKey=`printlab-community-draft:${model.id}`
 const [drafts,setDrafts]=useState<{public:string;local:string}>(()=>{try{const stored=JSON.parse(sessionStorage.getItem(draftKey)??'{}');return {public:typeof stored.public==='string'?stored.public.slice(0,2000):'',local:typeof stored.local==='string'?stored.local.slice(0,2000):''}}catch{return {public:'',local:''}}})
 const body=drafts[mode],setBody=(value:string)=>setDrafts(previous=>({...previous,[mode]:value}))
 useEffect(()=>{try{sessionStorage.setItem(draftKey,JSON.stringify(drafts))}catch{/* The visible draft remains editable. */}},[draftKey,drafts])
 const [author,setAuthor]=useState(()=>{try{return localStorage.getItem('printlab-community-alias')??''}catch{return ''}})
 const [reply,setReply]=useState<PublicCommunityComment|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
 const [deleting,setDeleting]=useState<string|null>(null)
 const alive=useRef(true),requestId=useRef(0),textarea=useRef<HTMLTextAreaElement>(null)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;requestId.current++}},[])
 const load=async(more=false)=>{
  const generation=++requestId.current;setLoading(true);setError('')
  try{const result=await cloudRequest<{comments:PublicCommunityComment[];nextCursor:string|null}>(`/community/${encodeURIComponent(model.id)}/comments${more&&cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`)
   if(!alive.current||generation!==requestId.current)return
   setComments(current=>[...new Map([...(more?current:[]),...result.comments].map(c=>[c.id,c])).values()]);setCursor(result.nextCursor)
  }catch(e){if(alive.current&&generation===requestId.current)setError(message(e))}finally{if(alive.current&&generation===requestId.current)setLoading(false)}
 }
 useEffect(()=>{if(!isLocal)void load();else setLoading(false)},[model.id])
 const submit=async()=>{
  if(!body.trim()||busy||(mode==='public'&&loading))return
  setBusy(true);setError('');setNotice('')
  try{
   if(mode==='local'){
    const comment:CommunityComment={id:crypto.randomUUID(),author:'You',avatar:'YO',body:body.trim(),likes:0,createdAt:new Date().toISOString()}
    const updated={...model,comments:[comment,...model.comments],reviewCount:model.reviewCount+1}
    saveCommunityComments(updated);onLocalChange(updated);setBody('');setNotice('Private note saved on this device.')
   }else{
    const result=await cloudRequest<{comment:PublicCommunityComment}>(`/community/${encodeURIComponent(model.id)}/comments`,{method:'POST',body:{body:body.trim(),author:author.trim(),...(reply?{parent:reply.id}:{})}})
    if(!alive.current)return
    try{localStorage.setItem('printlab-community-alias',author.trim())}catch{/* Posting succeeds even when preferences cannot be saved. */}
    setComments(current=>[...new Map([...current,result.comment].map(comment=>[comment.id,comment])).values()]);setBody('');setReply(null);setNotice('Your comment was posted publicly.');onCount()
   }
  }catch(e){if(alive.current)setError(message(e))}finally{if(alive.current)setBusy(false)}
 }
 const remove=async(id:string)=>{
  if(busy||loading)return
  setBusy(true);setError('')
  try{await cloudRequest(`/community/${encodeURIComponent(model.id)}/comments/${encodeURIComponent(id)}`,{method:'DELETE'});if(!alive.current)return;setDeleting(null);setReply(null);setComments(current=>current.map(comment=>comment.id===id?{...comment,deleted:true,body:'',author:'',canDelete:false}:comment));onCount();setNotice('Comment removed.')}
  catch(e){if(alive.current)setError(message(e))}finally{if(alive.current)setBusy(false)}
 }
 const render=(comment:PublicCommunityComment,isReply=false)=><article className={`cw-comment ${isReply?'cw-reply':''}`} key={comment.id}>
  <header><span className="cw-avatar">{comment.deleted?'–':comment.author.slice(0,2).toUpperCase()}</span><strong>{comment.deleted?'Deleted comment':comment.author}{comment.owned&&!comment.deleted?' (you)':''}</strong><time dateTime={comment.createdAt}>{date(comment.createdAt)}</time></header>
  <p>{comment.deleted?'This comment was removed.':comment.body}</p>
  {!comment.deleted&&<footer>{!isReply&&<button disabled={busy} onClick={()=>{setReply(comment);textarea.current?.focus()}}><MessageCircle size={14}/> Reply</button>}{comment.canDelete&&<button disabled={busy||loading} onClick={()=>setDeleting(comment.id)}><Trash2 size={14}/> Remove</button>}</footer>}
  {deleting===comment.id&&<div className="cw-inline-confirm"><span>Remove this comment? Replies will be kept.</span><button disabled={busy||loading} onClick={()=>void remove(comment.id)}>Remove comment</button><button onClick={()=>setDeleting(null)}>Cancel</button></div>}
  {!isReply&&comments.filter(c=>c.parent===comment.id).map(c=>render(c,true))}
 </article>
 return <section className="cw-discussion" aria-label="Design discussion">
  <div className="cw-section-heading"><div><h2>Conversation starts here</h2><p>{mode==='public'?'Ask a question, suggest an improvement, or share what you made.':'Notes saved only in this browser. They are never posted publicly.'}</p></div>{mode==='public'&&<button aria-label="Refresh comments" disabled={busy||loading} onClick={()=>void load()}><RefreshCw size={17}/></button>}</div>
  {!isLocal&&<div className="cw-segment"><button disabled={busy} aria-pressed={mode==='public'} onClick={()=>{setMode('public');setReply(null);setError('')}}>Public discussion</button><button disabled={busy} aria-pressed={mode==='local'} onClick={()=>{setMode('local');setReply(null);setError('')}}>My private notes ({model.comments.length})</button></div>}
  {notice&&<p role="status" className="cw-notice">{notice}</p>}{error&&<p role="alert" className="cw-error">{error} {mode==='public'&&<button onClick={()=>void load()}>Retry loading</button>} {mode==='public'&&error.includes('Sign in')&&<a href={signInPath()} target="_top">Sign in again</a>}</p>}
  <form className="cw-comment-form" onSubmit={event=>{event.preventDefault();void submit()}}>
   {mode==='public'&&<label>Public display name<input disabled={busy} value={author} minLength={2} maxLength={40} required onChange={e=>setAuthor(e.target.value)} placeholder="Choose a maker name" autoComplete="nickname"/></label>}
   {reply&&<p className="cw-reply-target">Replying to {reply.author}<button type="button" aria-label="Cancel reply" onClick={()=>setReply(null)}><X size={14}/></button></p>}
   <label>{mode==='public'?'Your comment':'Private note'}<textarea disabled={busy} ref={textarea} value={body} onChange={e=>setBody(e.target.value)} rows={3} maxLength={2000} required placeholder="What would you like to make or change?"/></label>
   <div className="cw-compose-footer"><small>{body.length}/2,000 · {mode==='public'?'Visible to everyone. Avoid sharing personal details.':'Only on this device.'}</small>{mode==='public'&&!signedIn?<a href={signInPath()} target="_top">Sign in with ChatGPT to post</a>:<button className="cw-primary" disabled={busy||!body.trim()||(mode==='public'&&(loading||author.trim().length<2))}><Send size={15}/>{busy?'Saving…':mode==='public'?'Post comment':'Save private note'}</button>}</div>
  </form>
  {mode==='local'?model.comments.length?model.comments.map(comment=><article className="cw-comment" key={comment.id}><header><strong>{comment.author}</strong><time>{date(comment.createdAt)}</time></header><p>{comment.body}</p>{comment.replies?.map(reply=><blockquote key={reply.id}><strong>{reply.author}</strong><p>{reply.body}</p></blockquote>)}</article>):<p className="cw-empty-small">Keep your measurements and ideas here.</p>:<>
   {loading&&<p role="status">Loading discussion…</p>}
   {!loading&&!error&&!comments.length&&<p className="cw-empty-small">No comments yet. Be the first to start a conversation.</p>}
   {comments.filter(c=>!c.parent).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).map(c=>render(c))}
   {comments.filter(c=>c.parent&&!comments.some(p=>p.id===c.parent)).map(c=>render(c,true))}
   {cursor&&<button disabled={loading||busy} onClick={()=>void load(true)}>Load more comments</button>}
  </>}
 </section>
}

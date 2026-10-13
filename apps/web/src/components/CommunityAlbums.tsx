import {useState} from 'react'
import {Bookmark,Check,FolderHeart,FolderPlus,Pencil,Plus,Trash2} from 'lucide-react'
import {bookmarkIds,type BookmarkCommand,type BookmarkLibrary} from '@/lib/communityAlbums'
import {WorkspaceDialog} from './WorkspaceDialog'

type Commit=(command:BookmarkCommand)=>BookmarkLibrary
export function CommunityAlbums({library,selected,onSelect,onChange}:{library:BookmarkLibrary;selected:string|null;onSelect:(id:string|null)=>void;onChange:Commit}){
 const [editing,setEditing]=useState<string|null|undefined>(),[name,setName]=useState(''),[error,setError]=useState(''),[deleting,setDeleting]=useState(false)
 const album=library.albums.find(a=>a.id===selected)
 const edit=(id:string|null)=>{setEditing(id);setName(library.albums.find(a=>a.id===id)?.name??'');setError('');setDeleting(false)}
 const submit=()=>{try{
  const id=editing??crypto.randomUUID()
  onChange({type:editing?'rename':'create',id,name});setEditing(undefined);if(!editing)onSelect(id)
 }catch(e){setError(e instanceof Error?e.message:'Could not save album.')}}
 return <section className="cw-albums" aria-label="Bookmark albums">
  <div className="cw-album-heading"><div><FolderHeart size={20}/><h2>Your albums</h2></div><button onClick={()=>edit(null)}><Plus size={16}/>New album</button></div>
  <div className="cw-album-list" role="group" aria-label="Browse albums">
   <button className="cw-album" aria-pressed={!selected} onClick={()=>onSelect(null)}><Bookmark size={20}/><span>All bookmarks<small>{library.bookmarks.length} saved</small></span></button>
   <button className="cw-album" aria-pressed={selected==='unfiled'} onClick={()=>onSelect('unfiled')}><FolderPlus size={20}/><span>Unfiled<small>{bookmarkIds(library,'unfiled').length} saved</small></span></button>
   {library.albums.map(a=><button key={a.id} className="cw-album" aria-pressed={selected===a.id} onClick={()=>onSelect(a.id)}><FolderHeart size={20}/><span>{a.name}<small>{a.modelIds.length} saved</small></span></button>)}
  </div>
  <div className="cw-album-caption"><p>{album?`${album.name} · ${album.modelIds.length} saved design${album.modelIds.length===1?'':'s'}`:selected==='unfiled'?'Saved designs that haven’t been added to an album.':'Keep your ideas together. A design can belong to more than one album.'}</p>{album&&<div><button onClick={()=>edit(album.id)}><Pencil size={14}/>Rename album</button><button onClick={()=>{setDeleting(true);setError('')}}><Trash2 size={14}/>Delete album</button></div>}</div>
  {editing!==undefined&&<WorkspaceDialog className="cw-album-dialog" title={editing?'Rename album':'New album'} description="Albums are private and saved on this device." onClose={()=>setEditing(undefined)}>
   <form onSubmit={e=>{e.preventDefault();submit()}}><label>Album name<input data-initial-focus value={name} maxLength={60} placeholder="Kitchen, weekend projects, gifts…" onChange={e=>setName(e.target.value)} required/></label>{error&&<p role="alert">{error}</p>}<div className="cw-album-actions"><button type="button" onClick={()=>setEditing(undefined)}>Cancel</button><button className="cw-primary" type="submit">{editing?'Save name':'Create album'}</button></div></form>
  </WorkspaceDialog>}
  {deleting&&album&&<WorkspaceDialog className="cw-album-dialog" title={`Delete ${album.name}?`} description="Your models will stay in All bookmarks and any other albums. Only this album will be removed." onClose={()=>setDeleting(false)}>{error&&<p role="alert">{error}</p>}<div className="cw-album-actions"><button data-initial-focus onClick={()=>setDeleting(false)}>Cancel</button><button onClick={()=>{try{onChange({type:'delete',id:album.id});setDeleting(false);onSelect(null)}catch(e){setError(e instanceof Error?e.message:'Could not delete album.')}}}>Delete album</button></div></WorkspaceDialog>}
 </section>
}

export function SaveToAlbum({modelId,title,library,onChange,onClose}:{modelId:string;title:string;library:BookmarkLibrary;onChange:Commit;onClose:()=>void}){
 const [chosen,setChosen]=useState(()=>library.albums.filter(a=>a.modelIds.includes(modelId)).map(a=>a.id))
 const [name,setName]=useState(''),[creating,setCreating]=useState(false),[error,setError]=useState('')
 return <WorkspaceDialog className="cw-album-dialog" title="Save to albums" description={`${title} · Choose one or more albums, or save in All bookmarks.`} onClose={onClose}>
  <div className="cw-album-choices" role="group" aria-label="Choose albums">{library.albums.map(a=><button key={a.id} aria-pressed={chosen.includes(a.id)} onClick={()=>setChosen(ids=>ids.includes(a.id)?ids.filter(id=>id!==a.id):[...ids,a.id])}><FolderHeart size={20}/><span>{a.name}</span>{chosen.includes(a.id)&&<Check size={18}/>}</button>)}</div>
  {!library.albums.length&&<p className="cw-empty-small">Make your first album to keep related ideas together.</p>}
  {creating?<form className="cw-album-create" onSubmit={e=>{e.preventDefault();try{const id=crypto.randomUUID();onChange({type:'create',id,name});setChosen(ids=>[...ids,id]);setName('');setCreating(false);setError('')}catch(e){setError(e instanceof Error?e.message:'Could not create album.')}}}><label>New album name<input autoFocus value={name} maxLength={60} onChange={e=>setName(e.target.value)} placeholder="e.g. Kitchen" required/></label><button type="submit">Create album</button><button type="button" onClick={()=>setCreating(false)}>Cancel</button></form>:<button className="cw-new-album" onClick={()=>setCreating(true)}><Plus size={16}/>New album</button>}
  {error&&<p role="alert">{error}</p>}
  <p className="cw-album-privacy">Private · Saved on this device</p>
  <div className="cw-album-actions"><button onClick={onClose}>Cancel</button><button className="cw-primary" onClick={()=>{try{onChange({type:'assign',modelId,albumIds:chosen});onClose()}catch(e){setError(e instanceof Error?e.message:'Could not save to albums.')}}}><Bookmark size={16}/>Save{chosen.length?` to ${chosen.length} album${chosen.length===1?'':'s'}`:' bookmark'}</button></div>
 </WorkspaceDialog>
}

import {useEffect,useMemo,useRef,useState} from 'react'
import {ArrowLeft,Bookmark,Box,Check,ChevronRight,Copy,Download,FolderPlus,Globe,Layers3,MessageCircle,Plus,RefreshCw,Repeat2,Search,SlidersHorizontal,Sparkles,Trash2,X} from 'lucide-react'
import {parseModelDocument,type ModelDocument} from '@formforge/model'
import {communityCategories,loadCommunityModels,applyLocalCommunityNotes,readCommunitySet,saveCommunitySet,readCommunityRoute,communityRouteHash,type CommunityModel,type CommunityRoute} from '@/lib/community'
import {communityTags,editableCommunitySeed,filterCommunityModels,isEditable} from '@/lib/communityDiscovery'
import {publicCommunityModel,type PublicCommunityModel} from '@/lib/communityCloud'
import {cloudRequest,signInPath} from '@/lib/cloud'
import {cachedProjectThumbnail,renderProjectThumbnails} from '@/lib/projectThumbnails'
import {AppNavigation} from './AppNavigation'
import {ThemeToggle,type AppearanceTheme} from './ThemeToggle'
import {WorkspaceDialog} from './WorkspaceDialog'
import {CommunityComments} from './CommunityComments'
import {CommunityPublish} from './CommunityPublish'
import {CommunityAlbums,SaveToAlbum} from './CommunityAlbums'
import {BOOKMARK_LIBRARY_KEY,bookmarkIds,emptyBookmarkLibrary,readBookmarkLibrary,updateBookmarkLibrary,type BookmarkCommand} from '@/lib/communityAlbums'
import './CommunityWorkshop.css'

interface CommunityProps {
 theme:AppearanceTheme;onToggleTheme:()=>void;document:ModelDocument;onOpenStudio:()=>void;onOpenProjects:()=>void
 onCreate:()=>void;onChooseStarter:()=>void;onRemix:(model:CommunityModel)=>void;onPublished:(model:CommunityModel)=>void
 openPublishRequest?:number;onPublishRequestHandled?:()=>void
}
const kindLabel=(model:CommunityModel)=>model.public?'Community design':model.document?model.creatorHandle==='@you'?'Your editable project':'Editable starter':'Concept illustration'
function Preview({model}:{model:CommunityModel}){
 const source=(model.document?cachedProjectThumbnail(model.document):undefined)??model.image
 return source?<img src={source} alt={`${model.title} ${isEditable(model)?'geometry preview':'concept illustration'}`} loading="lazy"/>:<div className="cw-preview-placeholder"><Box size={40}/><span>{isEditable(model)?'Editable geometry included':'Preview unavailable'}</span></div>
}
function Card({model,saved,onOpen,onSave,onAlbum,onTag}:{model:CommunityModel;saved:boolean;onOpen:()=>void;onSave:()=>void;onAlbum:()=>void;onTag:(tag:string)=>void}){
 return <article className={`cw-card ${!isEditable(model)?'cw-concept':''}`}><div className="cw-card-preview"><button aria-label={`View ${model.title}`} onClick={onOpen}><Preview model={model}/></button><span className="cw-kind">{kindLabel(model)}</span><button className="cw-save" aria-label={`${saved?'Remove bookmark for':'Bookmark'} ${model.title}`} aria-pressed={saved} onClick={onSave}><Bookmark size={17} fill={saved?'currentColor':'none'}/></button></div><div className="cw-card-copy"><small>{model.category}</small><h3><button onClick={onOpen}>{model.title}</button></h3><p>{model.description}</p><div className="cw-tags">{model.tags.slice(0,3).map(tag=><button key={tag} onClick={()=>onTag(tag)}>#{tag}</button>)}</div><div className="cw-card-album"><button onClick={onAlbum} aria-label={`Save ${model.title} to albums`}><FolderPlus size={15}/>Save to album</button></div><footer><span>by {model.creator}</span><button onClick={onOpen} aria-label={`Open ${model.title}`}><span>{isEditable(model)?'Make it yours':'Explore idea'}</span><ChevronRight size={15}/></button></footer></div></article>
}
export function Community({theme,onToggleTheme,document,onOpenStudio,onOpenProjects,onCreate,onChooseStarter,onRemix,onPublished,openPublishRequest=0,onPublishRequestHandled}:CommunityProps){
 const [local,setLocal]=useState(loadCommunityModels),[shared,setShared]=useState<CommunityModel[]>([])
 const [route,setRoute]=useState(()=>readCommunityRoute(window.location.hash)),routeRef=useRef(route)
 const [libraryState,setLibraryState]=useState(()=>{try{return {library:readBookmarkLibrary(),error:''}}catch(e){return {library:emptyBookmarkLibrary(),error:e instanceof Error?e.message:'Could not read bookmarks.'}}})
 const library=libraryState.library,saved=useMemo(()=>new Set(library.bookmarks),[library])
 const [history,setHistory]=useState(()=>readCommunitySet('formforge-history'))
 const [albumModel,setAlbumModel]=useState<CommunityModel|null>(null)
 const selectedAlbum=route.page==='collections'?route.albumId??null:null
 const libraryIds=useMemo(()=>bookmarkIds(library,selectedAlbum),[library,selectedAlbum])
 const changeLibrary=(command:BookmarkCommand)=>{const next=updateBookmarkLibrary(command);setLibraryState({library:next,error:''});return next}
 useEffect(()=>{const refresh=(event:StorageEvent)=>{if(event.key!==null&&event.key!==BOOKMARK_LIBRARY_KEY&&event.key!=='formforge-collected')return;try{setLibraryState({library:readBookmarkLibrary(),error:''})}catch(e){setLibraryState(previous=>({...previous,error:e instanceof Error?e.message:'Could not read bookmarks.'}))}};window.addEventListener('storage',refresh);return()=>window.removeEventListener('storage',refresh)},[])
 const [priority]=useState(()=>readCommunitySet('formforge-boosted'))
 const [signedIn,setSignedIn]=useState(false),[cloudError,setCloudError]=useState(''),[cloudLoading,setCloudLoading]=useState(true),[cursor,setCursor]=useState<string|null>(null)
 const [bundledCounts,setBundledCounts]=useState<Record<string,number>>({}),[libraryError,setLibraryError]=useState('')
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[publish,setPublish]=useState(false),[create,setCreate]=useState(false),[confirmDelete,setConfirmDelete]=useState(false)
 const [busy,setBusy]=useState(false),[detailLoading,setDetailLoading]=useState(false),[limit,setLimit]=useState(12),[tagQuery,setTagQuery]=useState('')
 const [,setThumbnailRevision]=useState(0),generation=useRef(0),mounted=useRef(true),fetchGeneration=useRef(0),scroll=useRef(0),content=useRef<HTMLElement>(null)
 const models=useMemo(()=>[...new Map([...editableCommunitySeed.map(applyLocalCommunityNotes),...local,...shared].map(model=>[model.id,{...model,commentCount:bundledCounts[model.id]??model.commentCount}])).values()],[shared,local,bundledCounts])
 const active=models.find(m=>m.id===route.modelId)
 const navigate=(patch:Partial<CommunityRoute>,replace=false)=>{
  const next={...routeRef.current,...patch};routeRef.current=next;setRoute(next)
  const hash=communityRouteHash(next);if(window.location.hash!==hash)window.history[replace?'replaceState':'pushState'](null,'',hash)
 }
 useEffect(()=>{
  mounted.current=true
  const restore=()=>{const next=readCommunityRoute(window.location.hash);routeRef.current=next;setRoute(next)}
  window.addEventListener('hashchange',restore);window.addEventListener('popstate',restore)
  return()=>{mounted.current=false;fetchGeneration.current++;generation.current++;window.removeEventListener('hashchange',restore);window.removeEventListener('popstate',restore)}
 },[])
 const loadShared=async(more=false)=>{
  const current=++fetchGeneration.current;setCloudLoading(true);setCloudError('')
  try{const result=await cloudRequest<{models:PublicCommunityModel[];nextCursor:string|null;bundledCounts?:Record<string,number>}>(`/community${more&&cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`)
   if(!mounted.current||current!==fetchGeneration.current)return
   setShared(previous=>[...new Map([...(more?previous:previous.filter(m=>m.id===routeRef.current.modelId||m.owned||saved.has(m.id)||history.has(m.id))),...result.models.map(model=>publicCommunityModel(model,previous.find(m=>m.id===model.id)?.document))].map(m=>[m.id,m])).values()]);setCursor(result.nextCursor);if(result.bundledCounts)setBundledCounts(result.bundledCounts)
  }catch(e){if(mounted.current&&current===fetchGeneration.current)setCloudError(e instanceof Error?e.message:'Community designs could not load.')}
  finally{if(mounted.current&&current===fetchGeneration.current)setCloudLoading(false)}
 }
 useEffect(()=>{void loadShared();void cloudRequest<{user:{email:string}|null}>('/session').then(result=>{if(mounted.current)setSignedIn(Boolean(result.user))}).catch(()=>{})},[])
 useEffect(()=>{
  if(route.page==='discover')return
  let cancelled=false;setLibraryError('')
  const load=async()=>{
   try{
    if(route.page==='profile'){
     if(!signedIn)return
     const result=await cloudRequest<{models:PublicCommunityModel[]}>('/community?mine=1')
     if(!cancelled)setShared(previous=>[...new Map([...previous,...result.models.map(model=>publicCommunityModel(model,previous.find(m=>m.id===model.id)?.document))].map(m=>[m.id,m])).values()])
    }else{
     const ids=(route.page==='collections'?libraryIds:[...history].reverse()).filter(id=>id.startsWith('shared-')).slice(0,limit)
     const loaded:CommunityModel[]=[];let failed=0
     for(let i=0;i<ids.length;i+=4){
      if(cancelled)return
      const results=await Promise.allSettled(ids.slice(i,i+4).map(id=>cloudRequest<{model:PublicCommunityModel;document:ModelDocument}>(`/community/${encodeURIComponent(id)}`)))
      for(const result of results){if(result.status==='fulfilled')loaded.push(publicCommunityModel(result.value.model,parseModelDocument(result.value.document)));else failed++}
     }
     if(!cancelled){setShared(previous=>[...new Map([...previous,...loaded].map(m=>[m.id,m])).values()]);if(failed)setLibraryError(`${failed} saved community design(s) could not be loaded. They may have been removed. Your saved links are retained.`)}
    }
   }catch(e){if(!cancelled)setLibraryError(e instanceof Error?e.message:'Could not load your shared library.')}
  }
  void load();return()=>{cancelled=true}
 },[route.page,signedIn,libraryIds.join(','),[...history].join(','),limit])
 useEffect(()=>{if(openPublishRequest){setPublish(true);onPublishRequestHandled?.()}},[openPublishRequest,onPublishRequestHandled])
 useEffect(()=>{
  setLimit(12)
 },[route.query,route.category,route.kind,route.tags.join(','),route.page,route.sort,selectedAlbum])
 useEffect(()=>{
  setError('');setConfirmDelete(false)
  if(content.current)content.current.scrollTop=route.modelId?0:scroll.current
  if(route.modelId)globalThis.document.querySelector<HTMLElement>('.cw-detail-title')?.focus({preventScroll:true})
  const id=route.modelId,current=++generation.current
  if(!id?.startsWith('shared-')){setDetailLoading(false);return}
  setDetailLoading(true)
  void cloudRequest<{model:PublicCommunityModel;document:ModelDocument}>(`/community/${encodeURIComponent(id)}`).then(result=>{
   if(!mounted.current||generation.current!==current)return
   const model=publicCommunityModel(result.model,parseModelDocument(result.document));setShared(previous=>[model,...previous.filter(m=>m.id!==id)])
  }).catch(e=>{if(mounted.current&&generation.current===current)setError(e instanceof Error?e.message:'Could not open this design.')}).finally(()=>{if(mounted.current&&generation.current===current)setDetailLoading(false)})
 },[route.modelId])
 const scoped=useMemo(()=>route.page==='collections'?models.filter(m=>libraryIds.includes(m.id)):route.page==='history'?[...history].reverse().flatMap(id=>models.filter(m=>m.id===id)):route.page==='profile'?models.filter(m=>m.creatorHandle==='@you'||m.owned):models,[models,route.page,libraryIds,history])
 const filtered=useMemo(()=>filterCommunityModels(scoped,route,priority),[scoped,route,priority])
 const tags=useMemo(()=>communityTags(scoped),[scoped])
 const visible=filtered.slice(0,limit)
 const previewDocuments=useMemo(()=>[...new Map((active?[active]:visible).flatMap(m=>m.document?[[m.document.id,m.document] as const]:[])).values()],[active,visible.map(m=>m.document?.id).join(',')])
 useEffect(()=>{const abort=new AbortController();void renderProjectThumbnails(previewDocuments,abort.signal,()=>setThumbnailRevision(n=>n+1));return()=>abort.abort()},[previewDocuments])
 const open=(model:CommunityModel)=>{
  if(!route.modelId)scroll.current=content.current?.scrollTop??0
  navigate({modelId:model.id,tab:'details'})
  const next=new Set(history);next.delete(model.id);next.add(model.id)
  try{setHistory(saveCommunitySet('formforge-history',next))}catch{setError('Could not save Recently viewed. Your projects are unchanged.')}
 }
 const collect=(model:CommunityModel)=>{
  try{const next=changeLibrary({type:'bookmark',modelId:model.id,saved:!saved.has(model.id)});setNotice(next.bookmarks.includes(model.id)?'Added to Bookmarks on this device.':'Removed from Bookmarks and albums.')}catch(e){setError(e instanceof Error?e.message:'Could not update bookmarks.')}
 }
 const tag=(value:string)=>navigate({modelId:null,tags:route.tags.includes(value)?route.tags.filter(t=>t!==value):[...route.tags,value].slice(0,10)})
 const clear=()=>navigate({query:'',category:'Trending',kind:'all',tags:[],modelId:null})
 const hasFilters=Boolean(route.query||!['Trending','New & Notable'].includes(route.category)||route.kind!=='all'||route.tags.length)
 const related=active?models.filter(m=>m.id!==active.id).sort((a,b)=>{
  const score=(m:CommunityModel)=>m.tags.filter(t=>active.tags.includes(t)).length+Number(m.category===active.category)*2+Number(isEditable(m))
  return score(b)-score(a)
 }).slice(0,3):[]
 const remixes=active?models.filter(m=>m.remixOf===active.id):[]
 const copyLink=async()=>{try{await navigator.clipboard.writeText(window.location.href);setNotice(active?.creatorHandle==='@you'?'Link copied. This local design is only available in this browser. Publish publicly to share it with others.':'Design link copied.')}catch{setNotice('Copy the address from your browser to share this design.')}}
 const download=()=>{if(!active?.document)return;const blob=new Blob([JSON.stringify(active.document,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=globalThis.document.createElement('a');a.href=url;a.download=`${active.title.replace(/[^a-z0-9_-]/gi,'-')}.forge.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Editable project downloaded. Open it in PrintLab to customize or export STL/3MF.')}
 const remove=async()=>{if(!active?.public||!active.owned)return;setBusy(true);try{await cloudRequest(`/community/${encodeURIComponent(active.id)}`,{method:'DELETE'});setShared(prev=>prev.filter(m=>m.id!==active.id));navigate({modelId:null});setNotice('Public design removed. Your local project is unchanged.')}catch(e){setError(e instanceof Error?e.message:'Could not remove design.')}finally{setBusy(false)}}
 const card=(model:CommunityModel)=><Card key={model.id} model={model} saved={saved.has(model.id)} onOpen={()=>open(model)} onSave={()=>collect(model)} onAlbum={()=>setAlbumModel(model)} onTag={tag}/>
 return <div className="community-workshop">
  <AppNavigation active="community" onOpenProjects={onOpenProjects} onOpenStudio={onOpenStudio}><a href="#templates">Templates</a><ThemeToggle theme={theme} onToggle={onToggleTheme}/></AppNavigation>
  <div className="cw-secondary-bar"><nav aria-label="Community navigation">{([{page:'discover',label:'Explore'},{page:'collections',label:'Bookmarks'},{page:'profile',label:'My shared designs'},{page:'history',label:'Recently viewed'}] as const).map(item=><button key={item.page} aria-current={route.page===item.page?'page':undefined} onClick={()=>navigate({page:item.page,modelId:null,albumId:null})}>{item.label}</button>)}</nav><button className="cw-primary" onClick={()=>setCreate(true)}><Plus size={17}/>Create</button></div>
  {(error||notice)&&<div className={`cw-feedback ${error?'cw-error':''}`} role={error?'alert':'status'}><span>{error||notice}</span><button aria-label="Dismiss message" onClick={()=>{setError('');setNotice('')}}><X size={17}/></button></div>}
  <main ref={content} className="cw-main">
   {libraryState.error&&<p className="cw-notice" role="alert">{libraryState.error}</p>}
   {route.modelId?active?<>
    <button className="cw-back" onClick={()=>navigate({modelId:null,tab:'details'})}><ArrowLeft size={17}/> Back to {route.page==='collections'?'Bookmarks':route.page==='profile'?'My shared designs':route.page==='history'?'Recently viewed':'Explore'}</button>
    <section className="cw-detail-hero"><div className="cw-detail-preview"><Preview model={active}/><span className="cw-kind">{kindLabel(active)}</span></div><div className="cw-detail-summary"><span className="cw-eyebrow">{active.category}</span><h1 tabIndex={-1} className="cw-detail-title">{active.title}</h1><p className="cw-byline"><span className="cw-avatar">{active.creatorAvatar}</span>Made by <strong>{active.creator}</strong></p><p>{active.description}</p><div className="cw-tags">{active.tags.map(t=><button key={t} onClick={()=>{navigate({modelId:null,tags:[t],page:'discover',query:'',category:'Trending',kind:'all'})}}>#{t}</button>)}</div>
    <div className="cw-detail-actions"><button className="cw-primary" disabled={detailLoading||(active.public&&!active.document)} onClick={()=>isEditable(active)?onRemix(active):onChooseStarter()}><Repeat2 size={18}/>{detailLoading?'Loading editable project…':isEditable(active)?'Remix in Studio':'Create from an editable starter'}</button><button aria-label={saved.has(active.id)?'Remove bookmark':'Bookmark design'} aria-pressed={saved.has(active.id)} onClick={()=>collect(active)}><Bookmark size={17}/>{saved.has(active.id)?'Bookmarked':'Bookmark design'}</button><button onClick={()=>setAlbumModel(active)}><FolderPlus size={17}/> Save to album</button><button onClick={()=>void copyLink()}><Copy size={16}/> Copy link</button>{active.document&&<button onClick={download}><Download size={17}/> Download editable project</button>}</div>
    <div className="cw-detail-facts">{isEditable(active)?<><span><Layers3 size={16}/>{active.document?`${active.document.nodes.length} editable features`:'Editable PrintLab source'}</span><span>{active.document?`${active.document.namedParameters.length} named parameters`:'Open to inspect parameters'}</span><span>{active.license}</span></>:<p>This picture is inspiration only. It has no geometry file; choose an editable starter to build your own version.</p>}</div>
    {active.remixOf&&<p>Remix of <button className="cw-text-link" onClick={()=>navigate({modelId:active.remixOf!,tab:'details'})}>{active.document?.communitySource?.title??'another design'}</button></p>}
    {active.owned&&active.public&&<button className="cw-text-link" onClick={()=>setConfirmDelete(true)}><Trash2 size={14}/> Remove public design</button>}
    {confirmDelete&&<div className="cw-inline-confirm"><p>Remove this public design and its discussion? Downloaded copies and other makers’ remixes remain.</p><button disabled={busy} onClick={()=>void remove()}>Remove design</button><button disabled={busy} onClick={()=>setConfirmDelete(false)}>Cancel</button></div>}
    </div></section>
    <section className="cw-detail-body"><div><nav className="cw-detail-tabs" aria-label="Design information">{(['details','comments','remixes'] as const).map(tab=><button key={tab} aria-current={route.tab===tab?'page':undefined} onClick={()=>navigate({tab})}>{tab==='details'?'About this design':tab==='comments'?'Comments & questions':`Remixes (${remixes.length})`}</button>)}</nav>
    {route.tab==='comments'?<CommunityComments key={active.id} model={active} signedIn={signedIn} onCount={()=>void loadShared()} onLocalChange={updated=>{if(updated.public)setShared(prev=>prev.map(m=>m.id===updated.id?updated:m));else setLocal(prev=>[updated,...prev.filter(m=>m.id!==updated.id)])}}/>:route.tab==='remixes'?<section className="cw-about"><h2>Make your own version</h2><p>{isEditable(active)?'Change dimensions, add details, and save your version. A remix is a new project; the original stays intact. Source credit travels with your copy.':'This is a concept illustration. Start with a real parametric model, then shape your own idea in Studio.'}</p><button className="cw-primary" disabled={detailLoading||(active.public&&!active.document)} onClick={()=>isEditable(active)?onRemix(active):onChooseStarter()}><Repeat2 size={17}/> {isEditable(active)?'Start a remix':'Choose an editable starter'}</button>{remixes.length?<div className="cw-grid cw-remix-grid">{remixes.map(card)}</div>:<p className="cw-empty-small">No remixes in the loaded designs yet. Yours could be the first.</p>}</section>:<section className="cw-about"><h2>{isEditable(active)?'A starting point for your next build':'An idea to build on'}</h2><p>{active.description}</p>{active.document&&<><h3>What you can change</h3><p>Open a remix in the existing 3D Studio. Select features, adjust dimensions, change named parameters, add shapes, and use undo/redo as you work.</p><div className="cw-parameter-list">{active.document.namedParameters.slice(0,12).map(parameter=><span key={parameter.id}>{parameter.name}</span>)}</div></>}<h3>Before you print</h3><p>Fit, strength and print success have not been verified. Review dimensions, clearances, walls and printer compatibility in Studio, then inspect the exported model in your slicer.</p>{isEditable(active)&&<p>License: <strong>{active.license}</strong>. Keep source attribution with remixes where required.</p>}<button onClick={()=>navigate({tab:'comments'})}><MessageCircle size={16}/> Ask a question about this design</button></section>}
    </div><aside className="cw-related"><h2>Keep exploring</h2>{related.map(m=><button key={m.id} onClick={()=>open(m)}><Preview model={m}/><span><strong>{m.title}</strong><small>{kindLabel(m)}</small></span><ChevronRight size={16}/></button>)}<button onClick={()=>setCreate(true)}><Plus size={20}/><span><strong>Have an idea of your own?</strong><small>Start a model or share your project</small></span></button></aside></section>
   </>:<div className="cw-empty"><Box size={40}/><h1>{detailLoading?'Opening design…':'Design not available'}</h1><p>{detailLoading?'Fetching its editable source.':'This may be a local-only design, a removed publication, or a link from another device.'}</p><button onClick={()=>navigate({modelId:null})}>Browse designs</button></div>:<>
    {!hasFilters&&route.page==='discover'&&<section className="cw-hero"><div><span className="cw-eyebrow"><Sparkles size={15}/> Little ideas. Endless possibilities.</span><h1>Find it. Remix it.<br/><em>Make it yours.</em></h1><p>Useful little things, playful experiments, and real editable designs. Your next “I made that!” starts here.</p><div><button className="cw-primary" onClick={()=>navigate({kind:'editable'})}><Repeat2 size={17}/> Find a model to remix</button><button onClick={()=>setCreate(true)}><Plus size={17}/> Start something new</button></div></div><div className="cw-hero-art" aria-hidden="true"><div className="cw-art-orbit"/><img src="/community/spiral-planter.png" alt=""/><span>Imagine it <Sparkles size={17}/></span><small>Concept illustration · explore editable starters below</small></div></section>}
    <section className="cw-browse"><div className="cw-section-heading"><div><span className="cw-eyebrow">{route.page==='discover'?'Made for curious minds':'Your Community activity'}</span><h1>{route.page==='collections'?'Bookmarks':route.page==='profile'?'My shared designs':route.page==='history'?'Recently viewed':'Explore Community'}</h1></div><div className="cw-browse-actions"><button onClick={()=>setPublish(true)}><Plus size={17}/> Share a project</button></div></div>
    {route.page==='collections'&&<p className="cw-library-description">Bookmarks are community designs saved for later. Organize them into albums, then remix a design in Studio to make it your own. Your bookmarks and albums stay private on this device.</p>}
    {route.page==='collections'&&<CommunityAlbums library={library} selected={selectedAlbum} onChange={changeLibrary} onSelect={albumId=>navigate({albumId,query:'',category:'Trending',kind:'all',tags:[]})}/>}
    {route.page==='collections'&&selectedAlbum&&selectedAlbum!=='unfiled'&&!library.albums.some(a=>a.id===selectedAlbum)&&<p role="status" className="cw-notice">This album is not available on this device. Choose All bookmarks or another album.</p>}
    {route.page==='profile'&&<p className="cw-library-description">Your local showcase and designs you published to Community. Private editable project files live in My projects.</p>}
    {route.page==='history'&&<p className="cw-library-description">Community designs you opened on this device. To revisit changes to a project, use Edit history in Studio.</p>}
    <div className="cw-search-row"><label className="cw-search"><Search size={19}/><input aria-label="Search community designs" placeholder="Search models, tags, ideas or makers…" value={route.query} onChange={e=>navigate({query:e.target.value},true)}/>{route.query&&<button aria-label="Clear search" onClick={()=>navigate({query:''},true)}><X size={16}/></button>}</label><label className="cw-sort">Sort by<select aria-label="Sort designs" value={route.sort} onChange={e=>navigate({sort:e.target.value as CommunityRoute['sort']})}><option value="Trending">Recommended</option><option value="Newest">Newest first</option><option value="Most downloaded">Name A–Z</option><option value="Most discussed">Most discussed</option></select></label></div>
    <div className="cw-category-row" aria-label="Design categories">{['Trending',...communityCategories.slice(2)].map(category=><button key={category} aria-pressed={route.category===category} onClick={()=>navigate({category})}>{category==='Trending'?'All categories':category}</button>)}</div>
    <div className="cw-browse-layout"><aside className="cw-filters">
      <div className="cw-filter-heading"><SlidersHorizontal size={16}/><strong>Find your kind of idea</strong></div>
      <details open><summary>Filter by tags <span>{route.tags.length?`${route.tags.length} selected`:''}</span></summary>
        <input className="cw-tag-search" aria-label="Find a tag" placeholder="Find a tag…" value={tagQuery} onChange={e=>setTagQuery(e.target.value)}/>
        <p>Tap tags to narrow your search. Matches all selected.</p>
        <div className="cw-tag-filter-list" role="group" aria-label="Filter by tags">
          {tags.filter(t=>t.tag.includes(tagQuery.toLowerCase())).map(t=><button type="button" className="cw-filter-chip" key={t.tag} aria-label={`Filter by tag ${t.tag}`} aria-pressed={route.tags.includes(t.tag)} title={`${t.count} design${t.count===1?'':'s'}`} disabled={route.tags.length>=10&&!route.tags.includes(t.tag)} onClick={()=>tag(t.tag)}><span>#{t.tag}</span><small aria-hidden="true">{t.count}</small></button>)}
          {!tags.some(t=>t.tag.includes(tagQuery.toLowerCase()))&&<p>No matching tags.</p>}
        </div>
      </details>
      <p className="cw-local-note">Bookmarks, albums, recently viewed designs and private notes stay on this device. Public designs and comments are shared.</p>
    </aside>
    <div className="cw-results"><div className="cw-results-heading"><span role="status">{filtered.length} matching design{filtered.length===1?'':'s'}{cursor?' loaded':''}</span>{hasFilters&&<button onClick={clear}>Clear all filters</button>}</div>{hasFilters&&<div className="cw-active-filters">{route.tags.map(t=><button key={t} onClick={()=>tag(t)} aria-label={`Remove tag ${t}`}>#{t}<X size={13}/></button>)}{route.kind!=='all'&&<button onClick={()=>navigate({kind:'all'})}>{route.kind==='editable'?'Ready to remix':'Concept inspiration'}<X size={13}/></button>}{!['Trending','New & Notable'].includes(route.category)&&<button onClick={()=>navigate({category:'Trending'})}>{route.category}<X size={13}/></button>}</div>}
    {libraryError&&<p role="status" className="cw-notice">{libraryError}</p>}{cloudError&&<div className="cw-cloud-notice"><span><Globe size={16}/> Shared designs are unavailable. You can still browse starters and your local showcase.</span><button disabled={cloudLoading} onClick={()=>void loadShared()}><RefreshCw size={14}/> Retry</button><details><summary>Connection details</summary><p>{cloudError}</p></details></div>}
    {cloudLoading&&<p role="status" className="cw-loading">Loading community designs…</p>}
    {visible.length?<div className="cw-grid">{visible.map(card)}</div>:<div className="cw-empty"><Search size={34}/><h2>{route.page==='collections'&&!hasFilters?(selectedAlbum?'No designs in this album yet':'Save your next idea here'):route.page==='profile'&&!hasFilters?'Your first design belongs here':'No designs match just yet'}</h2><p>{route.page==='collections'&&!hasFilters?'Explore the community and use Save to album to organize designs for later.':route.page==='profile'&&!hasFilters?'Create a model in Studio, then save it to your showcase or publish it for the community.':'Try removing a tag or broadening your search. Tags are matched together.'}</p><button onClick={hasFilters?clear:route.page==='collections'?()=>navigate({page:'discover',albumId:null}):()=>setCreate(true)}>{hasFilters?'Clear filters':route.page==='collections'?'Explore designs':'Create a design'}</button></div>}
    {filtered.length>limit&&<button className="cw-load-more" onClick={()=>setLimit(n=>n+12)}>Show more designs ({filtered.length-limit} remaining)</button>}{(route.page==='collections'?libraryIds.length:route.page==='history'?history.size:0)>limit&&<button className="cw-load-more" onClick={()=>setLimit(n=>n+12)}>Load more designs</button>}{cursor&&<button className="cw-load-more" disabled={cloudLoading} onClick={()=>void loadShared(true)}>Load more from the community</button>}
    </div></div></section>
   </>}
   <footer className="cw-footer"><span>Built for making, learning, and trying again.</span>{signedIn?<span><Check size={14}/> Signed in for community sharing</span>:<a href={signInPath()} target="_top">Sign in with ChatGPT to join in</a>}</footer>
  </main>
  {create&&<WorkspaceDialog className="cw-create-dialog" title="What will you make today?" description="Start fresh, customize an editable design, or share a project you already made." onClose={()=>setCreate(false)}><div className="cw-create-options"><button onClick={()=>{setCreate(false);onCreate()}}><Plus size={26}/><strong>Start from scratch</strong><span>A new empty project in the 3D Studio.</span></button><button onClick={()=>{setCreate(false);onChooseStarter()}}><Repeat2 size={26}/><strong>Make a starter your own</strong><span>Choose a real model and customize its dimensions.</span></button><button onClick={()=>{setCreate(false);setPublish(true)}}><Globe size={26}/><strong>Share your current project</strong><span>{document.name} · {document.nodes.length} editable features</span></button></div></WorkspaceDialog>}
  {albumModel&&<SaveToAlbum modelId={albumModel.id} title={albumModel.title} library={library} onChange={command=>{const next=changeLibrary(command);if(command.type==='assign')setNotice(command.albumIds.length?'Saved to your selected albums on this device.':'Saved in All bookmarks on this device.');return next}} onClose={()=>setAlbumModel(null)}/>}
  {publish&&<CommunityPublish document={document} existing={local.find(m=>m.creatorHandle==='@you'&&m.document?.id===document.id)} signedIn={signedIn} onClose={()=>setPublish(false)} onSaved={model=>{setPublish(false);if(model.public)setShared(previous=>[model,...previous.filter(m=>m.id!==model.id)]);else setLocal(loadCommunityModels());navigate({modelId:model.id,tab:'details'});setNotice(model.public?'Your design is now public. Other makers can view, comment and remix.':'Editable copy saved to your local showcase.');onPublished(model)}}/>}
 </div>
}

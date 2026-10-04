import {AppErrorBoundary} from './components/AppErrorBoundary'
import {TemplatePage} from './components/TemplatePage'
import {templateCatalog} from './lib/templateCatalog'
import {lazy,Suspense,useEffect,useState} from 'react'
import {PublicWebsite} from './components/PublicWebsite'
const App=lazy(()=>import('./App').then(m=>({default:m.App})))
const route=()=>window.location.hash.split('?')[0] ?? ''
const isPublic=(hash:string)=>!hash||hash==='#home'||hash==='#templates'
export function SiteRoot(){
 const template=templateCatalog.find(t=>window.location.pathname.replace(/\/$/,'')===`/templates/${t.id}`)
 const [hash,setHash]=useState(route),[opened,setOpened]=useState(()=>!isPublic(route()))
 useEffect(()=>{const change=()=>{const hash=route();setHash(hash);if(!isPublic(hash))setOpened(true)};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change)},[])
 useEffect(()=>{if(template&&isPublic(hash)){document.title=`${template.name} · Editable 3D printing template · FormForge`;return}if(isPublic(hash))document.title=hash==='#templates'?'Editable 3D printing templates · FormForge':'FormForge · Design useful parts for 3D printing'},[hash,template])
 return <>{isPublic(hash)&&(template?<TemplatePage template={template}/>:<PublicWebsite templatesOnly={hash==='#templates'}/>)}{opened&&<div className="cad-root" hidden={isPublic(hash)}><Suspense fallback={<div className="route-loading" role="status">Opening your workshop…</div>}><AppErrorBoundary><App active={!isPublic(hash)}/></AppErrorBoundary></Suspense></div>}</>
}

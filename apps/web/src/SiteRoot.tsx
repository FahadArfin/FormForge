import {AppErrorBoundary} from './components/AppErrorBoundary'
import {TemplatePage} from './components/TemplatePage'
import {templateCatalog} from './lib/templateCatalog'
import {lazy,Suspense,useEffect,useState} from 'react'
import {PublicWebsite} from './components/PublicWebsite'
const App=lazy(()=>import('./App').then(m=>({default:m.App})))
const route=()=>window.location.hash
const isPublic=(hash:string)=>!hash||hash.split('?')[0]==='#home'||hash.split('?')[0]==='#templates'
export function SiteRoot(){
 const [hash,setHash]=useState(route),[opened,setOpened]=useState(()=>!isPublic(route()))
 const templateId=hash.startsWith('#templates?')?new URLSearchParams(hash.split('?')[1]).get('template'):null
 const template=templateCatalog.find(t=>templateId===t.id||(!hash&&window.location.pathname.replace(/\/$/,'')===`/templates/${t.id}`))
 useEffect(()=>{const change=()=>{const hash=route();setHash(hash);if(!isPublic(hash))setOpened(true)};window.addEventListener('hashchange',change);window.addEventListener('popstate',change);return()=>{window.removeEventListener('hashchange',change);window.removeEventListener('popstate',change)}},[])
 useEffect(()=>{if(template&&isPublic(hash)){document.title=`${template.name} · Editable 3D printing template · PrintLab`;return}if(isPublic(hash))document.title=hash==='#templates'?'Editable 3D printing templates · PrintLab':'PrintLab · Design useful parts for 3D printing'},[hash,template])
 return <>{isPublic(hash)&&(template?<TemplatePage template={template}/>:<PublicWebsite templatesOnly={hash==='#templates'}/>)}{opened&&<div className="cad-root" hidden={isPublic(hash)}><Suspense fallback={<div className="route-loading" role="status">Opening My projects…</div>}><AppErrorBoundary><App active={!isPublic(hash)}/></AppErrorBoundary></Suspense></div>}</>
}

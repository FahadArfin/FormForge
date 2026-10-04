import {lazy,Suspense,useEffect,useState} from 'react'
import {PublicWebsite} from './components/PublicWebsite'
const App=lazy(()=>import('./App').then(m=>({default:m.App})))
const route=()=>window.location.hash.split('?')[0] ?? ''
const isPublic=(hash:string)=>!hash||hash==='#home'||hash==='#templates'
export function SiteRoot(){
 const [hash,setHash]=useState(route),[opened,setOpened]=useState(()=>!isPublic(route()))
 useEffect(()=>{const change=()=>{const hash=route();setHash(hash);if(!isPublic(hash))setOpened(true)};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change)},[])
 useEffect(()=>{if(isPublic(hash))document.title=hash==='#templates'?'Editable 3D printing templates · FormForge':'FormForge · Design useful parts for 3D printing'},[hash])
 return <>{isPublic(hash)&&<PublicWebsite templatesOnly={hash==='#templates'}/>}{opened&&<div className="cad-root" hidden={isPublic(hash)}><Suspense fallback={<div className="route-loading" role="status">Opening your workshop…</div>}><App active={!isPublic(hash)}/></Suspense></div>}</>
}

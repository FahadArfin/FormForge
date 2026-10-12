import type {ReactNode} from 'react'
import {Box, FolderOpen, Users} from 'lucide-react'
import './AppNavigation.css'
export type NavigationArea = 'community' | 'projects' | 'studio'
/** Area changes only reveal existing work. Creating/replacing a document is a separate guarded action. */
export function AppNavigation({active, children, onOpenProjects, onOpenCommunity, onOpenStudio, compact=false}: {
 active?: NavigationArea; children?: ReactNode; onOpenProjects?:()=>void; onOpenCommunity?:()=>void; onOpenStudio?:()=>void; compact?:boolean
}) {
 const destinations = [
  {id:'community',label:'Community',icon:Users,open:onOpenCommunity},
  {id:'projects',label:'My projects',icon:FolderOpen,open:onOpenProjects},
  {id:'studio',label:'Studio',icon:Box,open:onOpenStudio},
 ] as const
 return <header className={`app-navigation${compact?' app-navigation-compact':''}`}>
  <a className="app-navigation-brand public-brand" href="#home" aria-label="PrintLab home"><span className="brand-mark"><span/></span><strong>PrintLab</strong></a>
  <nav aria-label="Main navigation">{destinations.map(({id,label,icon:Icon,open})=><a key={id} href={`#${id}`} aria-current={active===id?'page':undefined} onClick={open?event=>{if(event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();open()}}:undefined}><Icon size={16} aria-hidden="true"/><span>{label}</span></a>)}</nav>
  {children&&<div className="app-navigation-utilities">{children}</div>}
 </header>
}

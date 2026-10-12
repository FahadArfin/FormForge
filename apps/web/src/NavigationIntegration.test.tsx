// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {createDocument,createNode} from '@formforge/model'
import {SiteRoot} from './SiteRoot'
// Preload lazy modules outside the timed setup hook; keep their real components.
import './App'
import './components/Community'
import {useEditor} from './store/editor'
import {db} from './lib/db'
vi.mock('./geometry/client',()=>({geometryClient:{evaluate:vi.fn(()=>new Promise(()=>{}))}}))
vi.mock('./components/Viewport',()=>({Viewport:()=> <canvas className="viewport-canvas" tabIndex={0}/>}))
vi.mock('./lib/projectThumbnails',()=>({cachedProjectThumbnail:()=>null,thumbnailKey:()=>'',renderProjectThumbnails:async()=>{}}))
vi.mock('./lib/cloud',()=>({cloudRequest:vi.fn(async()=>({models:[],nextCursor:null})),signInPath:()=>'/login'}))
let host:HTMLDivElement,root:Root
beforeEach(async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 window.matchMedia=vi.fn(()=>({matches:false,addEventListener(){},removeEventListener(){}})) as unknown as typeof window.matchMedia
 Element.prototype.scrollIntoView=vi.fn()
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
 HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
 localStorage.clear();await db.projects.clear();await db.recovery.clear()
 window.history.replaceState(null,'','/#studio')
 const before={...createDocument('Before edit'),nodes:[createNode('box')]}
 useEditor.setState({hydrated:true,document:{...before,name:'Active editable project'},undoStack:[before],redoStack:[],selectedNodeIds:[],selectedNodeId:null,saveStatus:'saved',saveError:null,geometryStatus:'idle',mesh:null,meshDocument:null})
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
 await act(async()=>root.render(<SiteRoot/>))
 await act(async()=>{await new Promise(r=>setTimeout(r,60))})
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks()})
async function follow(label:string){
 const link=[...host.querySelectorAll<HTMLAnchorElement>('a')].find(a=>(a.textContent===label||a.getAttribute('aria-label')===label)&&!a.closest('[hidden]'))!
 expect(link,`visible link ${label}`).toBeTruthy()
 await act(async()=>{link.click();await new Promise(r=>setTimeout(r,50))})
}
it('preserves the actual Studio tree, document and undo across all areas, public templates and browser history',async()=>{
 const current=useEditor.getState().document,undo=useEditor.getState().undoStack
 const studio=host.querySelector('.app-shell'),name=host.querySelector('input[aria-label="Project name"]')
 expect(name).not.toBeNull()
 await follow('Community');expect(host.querySelector('.community-workshop')).not.toBeNull()
 await follow('My projects');expect(host.querySelector('h1')?.textContent).toBe('My projects')
 expect(host.textContent).toContain('Resume in Studio')
 await follow('Studio')
 expect(host.querySelector('.app-shell')).toBe(studio)
 expect(host.querySelector('input[aria-label="Project name"]')).toBe(name)
 expect(useEditor.getState().document).toBe(current);expect(useEditor.getState().undoStack).toBe(undo)
 await follow('PrintLab home');await follow('Templates')
 await act(async()=>{host.querySelector<HTMLAnchorElement>('.template-open')!.click();await new Promise(r=>setTimeout(r,30))})
 expect(host.querySelector('.template-detail')).not.toBeNull()
 await follow('PrintLab home');expect(host.querySelector('.public-hero')).not.toBeNull()
 await follow('Studio');expect(host.querySelector('input[aria-label="Project name"]')).toBe(name)
 await act(async()=>{window.history.back();await new Promise(r=>setTimeout(r,50))})
 expect(host.querySelector('.public-hero')).not.toBeNull()
 await act(async()=>{window.history.forward();await new Promise(r=>setTimeout(r,50))})
 expect(host.querySelector('.app-shell')?.hasAttribute('hidden')).toBe(false)
 expect(useEditor.getState().document).toBe(current)
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Undo"]')!.click())
 expect(useEditor.getState().document.name).toBe('Before edit')
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Redo"]')!.click())
 expect(useEditor.getState().document).toBe(current)
})
it('keeps the active document and route when the Studio exit save fails, then retries safely',async()=>{
 const current=useEditor.getState().document
 const transaction=vi.spyOn(db,'transaction').mockRejectedValue(new Error('Storage unavailable'))
 await follow('My projects')
 expect(window.location.hash).toBe('#studio')
 expect(host.querySelector('dialog[open]')?.textContent).toContain('Your latest edits aren’t saved')
 expect(useEditor.getState().document).toBe(current)
 transaction.mockRestore()
 const retry=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Retry save and continue')!
 await act(async()=>retry.click())
 await vi.waitFor(async()=>{
  await act(async()=>{await new Promise(r=>setTimeout(r,0))})
  expect(window.location.hash).toBe('#projects')
 },{timeout:4000})
 expect(host.querySelector('dialog[open]')).toBeNull()
 expect(useEditor.getState().document).toBe(current)
 expect((await db.projects.get(current.id))?.document.name).toBe('Active editable project')
})

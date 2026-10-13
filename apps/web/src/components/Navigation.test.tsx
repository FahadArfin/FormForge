// @vitest-environment jsdom
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {createDocument} from '@formforge/model'
import {PublicWebsite} from './PublicWebsite'
import {TemplatePage} from './TemplatePage'
import {Community} from './Community'
import {BOOKMARK_LIBRARY_KEY,readBookmarkLibrary} from '@/lib/communityAlbums'
import {templateCatalog} from '@/lib/templateCatalog'
vi.mock('@/lib/cloud',()=>({cloudRequest:vi.fn(async()=>({models:[],nextCursor:null})),signInPath:()=>'/login'}))
vi.mock('@/lib/projectThumbnails',()=>({cachedProjectThumbnail:()=>null,renderProjectThumbnails:async()=>{}}))
let host:HTMLDivElement,root:Root
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});localStorage.clear();window.history.replaceState(null,'','/#home');host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks()})
const links=()=>[...host.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Main navigation"] a')]
it('offers the same three labeled destinations on home, template library and detail',async()=>{
 for(const surface of [<PublicWebsite/>,<PublicWebsite templatesOnly/>,<TemplatePage template={templateCatalog[0]!}/>]){
  await act(async()=>root.render(surface))
  expect(links().map(a=>[a.textContent,a.getAttribute('href')])).toEqual([['Community','#community'],['My projects','#projects'],['Studio','#studio']])
  expect(host.querySelector('a[aria-label="PrintLab home"]')?.getAttribute('href')).toBe('#home')
  expect(host.querySelector('nav[aria-label="Main navigation"] [aria-current]')).toBeNull()
 }
})
it('keeps old bookmark and recently viewed routes usable with clear labels and stored designs',async()=>{
 window.history.replaceState(null,'','/#community')
 await act(async()=>root.render(<Community theme="light" onToggleTheme={()=>{}} document={createDocument()} onOpenStudio={()=>{}} onOpenProjects={()=>{}} onCreate={()=>{}} onChooseStarter={()=>{}} onRemix={()=>{}} onPublished={()=>{}}/>))
 expect(links().map(a=>a.textContent)).toEqual(['Community','My projects','Studio'])
 expect(links()[0]?.getAttribute('aria-current')).toBe('page')
 const secondary=()=>[...host.querySelectorAll<HTMLButtonElement>('nav[aria-label="Community navigation"] button')]
 expect(secondary().map(b=>b.textContent)).toEqual(['Explore','Bookmarks','My shared designs','Recently viewed'])
 const first=host.querySelector<HTMLButtonElement>('.cw-card-open') ?? host.querySelector<HTMLButtonElement>('.cw-card button')!
 await act(async()=>first.click())
 expect(JSON.parse(localStorage.getItem('formforge-history')!)).toHaveLength(1)
 const bookmark=host.querySelector<HTMLButtonElement>('[aria-label="Bookmark design"]')!
 await act(async()=>bookmark.click())
 expect(readBookmarkLibrary().bookmarks).toHaveLength(1)
 await act(async()=>secondary()[1]!.click())
 expect(window.location.hash).toContain('page=collections')
 expect(host.querySelector('h1')?.textContent).toBe('Bookmarks')
 expect(host.textContent).toContain('community designs saved for later')
 expect(host.querySelectorAll('.cw-card')).toHaveLength(1)
 await act(async()=>secondary()[3]!.click())
 expect(window.location.hash).toContain('page=history')
 expect(host.querySelectorAll('.cw-card')).toHaveLength(1)
 await act(async()=>secondary()[2]!.click())
 expect(window.location.hash).toContain('page=profile')
 expect(host.querySelector('h1')?.textContent).toBe('My shared designs')
})

it('announces bookmark success and storage failure while preserving saved state, with dismissible feedback',async()=>{
 window.history.replaceState(null,'','/#community')
 await act(async()=>root.render(<Community theme="light" onToggleTheme={()=>{}} document={createDocument()} onOpenStudio={()=>{}} onOpenProjects={()=>{}} onCreate={()=>{}} onChooseStarter={()=>{}} onRemix={()=>{}} onPublished={()=>{}}/>))
 const bookmark=host.querySelector<HTMLButtonElement>('.cw-save')!
 await act(async()=>bookmark.click())
 expect(host.querySelector('.cw-feedback[role="status"]')?.textContent??'').toContain('Added to Bookmarks on this device.')
 const persisted=localStorage.getItem(BOOKMARK_LIBRARY_KEY)
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Dismiss message"]')!.click())
 expect(host.querySelector('.cw-feedback')).toBeNull()
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError')})
 await act(async()=>bookmark.click())
 expect(host.querySelector('.cw-feedback[role="alert"]')?.textContent??'').toContain('Browser storage is full or unavailable. Your bookmarks and albums were not changed.')
 expect(localStorage.getItem(BOOKMARK_LIBRARY_KEY)).toBe(persisted)
 expect(bookmark.getAttribute('aria-pressed')).toBe('true')
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Dismiss message"]')!.click())
 expect(host.querySelector('.cw-feedback')).toBeNull()
})

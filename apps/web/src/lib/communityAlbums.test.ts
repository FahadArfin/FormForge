// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {BOOKMARK_LIBRARY_KEY,readBookmarkLibrary,updateBookmarkLibrary,bookmarkIds} from './communityAlbums'
beforeEach(()=>localStorage.clear())
afterEach(()=>vi.restoreAllMocks())
it('migrates existing bookmarks on the first edit without modifying the legacy backup',()=>{
 localStorage.setItem('formforge-collected','["starter-tray","shared-old"]')
 expect(readBookmarkLibrary().bookmarks).toEqual(['starter-tray','shared-old'])
 updateBookmarkLibrary({type:'create',id:'kitchen',name:'  Kitchen  '})
 expect(readBookmarkLibrary()).toMatchObject({version:1,bookmarks:['starter-tray','shared-old'],albums:[{id:'kitchen',name:'Kitchen',modelIds:[]}]})
 expect(localStorage.getItem('formforge-collected')).toBe('["starter-tray","shared-old"]')
})
it('supports multiple albums, renaming, unfiled browsing and deletion without losing bookmarks',()=>{
 updateBookmarkLibrary({type:'create',id:'kitchen',name:'Kitchen'})
 updateBookmarkLibrary({type:'create',id:'gifts',name:'Gifts'})
 updateBookmarkLibrary({type:'assign',modelId:'starter-tray',albumIds:['kitchen','gifts']})
 updateBookmarkLibrary({type:'bookmark',modelId:'shared-later',saved:true})
 let library=updateBookmarkLibrary({type:'rename',id:'kitchen',name:'Kitchen prints'})
 expect(bookmarkIds(library,'kitchen')).toEqual(['starter-tray'])
 expect(bookmarkIds(library,'unfiled')).toEqual(['shared-later'])
 library=updateBookmarkLibrary({type:'delete',id:'kitchen'})
 expect(library.bookmarks).toEqual(['starter-tray','shared-later'])
 expect(library.albums[0]?.modelIds).toEqual(['starter-tray'])
 library=updateBookmarkLibrary({type:'bookmark',modelId:'starter-tray',saved:false})
 expect(library.albums[0]?.modelIds).toEqual([])
 expect(library.bookmarks).toEqual(['shared-later'])
})
it('rejects empty, duplicate and oversized names and unknown album references',()=>{
 updateBookmarkLibrary({type:'create',id:'a',name:'Kitchen'})
 for(const name of [' ','KITCHEN','x'.repeat(61)])expect(()=>updateBookmarkLibrary({type:'create',id:'b',name})).toThrow()
 expect(()=>updateBookmarkLibrary({type:'assign',modelId:'tray',albumIds:['missing']})).toThrow()
 expect(readBookmarkLibrary().bookmarks).toEqual([])
})
it('commits membership and bookmarks atomically and leaves data intact on quota failure',()=>{
 updateBookmarkLibrary({type:'create',id:'a',name:'Kitchen'})
 const previous=localStorage.getItem(BOOKMARK_LIBRARY_KEY)
 vi.spyOn(Storage.prototype,'setItem').mockImplementationOnce(()=>{throw new DOMException('Full','QuotaExceededError')})
 expect(()=>updateBookmarkLibrary({type:'assign',modelId:'tray',albumIds:['a']})).toThrow()
 expect(localStorage.getItem(BOOKMARK_LIBRARY_KEY)).toBe(previous)
})
it('reads the latest library for each operation and never overwrites malformed or future data',()=>{
 updateBookmarkLibrary({type:'create',id:'a',name:'Kitchen'})
 updateBookmarkLibrary({type:'create',id:'b',name:'Garden'})
 expect(readBookmarkLibrary().albums).toHaveLength(2)
 for(const raw of ['{broken','{"version":2,"bookmarks":[],"albums":[]}','{"version":1,"bookmarks":[],"albums":[{"id":"bad"}]}']){
  localStorage.setItem(BOOKMARK_LIBRARY_KEY,raw)
  expect(()=>updateBookmarkLibrary({type:'bookmark',modelId:'tray',saved:true})).toThrow()
  expect(localStorage.getItem(BOOKMARK_LIBRARY_KEY)).toBe(raw)
 }
})

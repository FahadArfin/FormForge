// One atomic record keeps bookmark membership and albums consistent. The legacy
// bookmark array is read until the first edit and retained as a migration backup.
export const BOOKMARK_LIBRARY_KEY='formforge-bookmark-library-v1'
export interface BookmarkAlbum {id:string;name:string;modelIds:string[]}
export interface BookmarkLibrary {version:1;bookmarks:string[];albums:BookmarkAlbum[]}
export type BookmarkCommand=
 | {type:'create';id:string;name:string}
 | {type:'rename';id:string;name:string}
 | {type:'delete';id:string}
 | {type:'bookmark';modelId:string;saved:boolean}
 | {type:'assign';modelId:string;albumIds:string[]}
export const emptyBookmarkLibrary=():BookmarkLibrary=>({version:1,bookmarks:[],albums:[]})
const validId=(id:unknown):id is string=>typeof id==='string'&&id.length>0&&id.length<=256
const ids=(value:unknown):value is string[]=>Array.isArray(value)&&value.length<=10000&&value.every(validId)&&new Set(value).size===value.length
function validate(value:unknown):asserts value is BookmarkLibrary{
 const v=value as BookmarkLibrary|null
 if(!v||v.version!==1||!ids(v.bookmarks)||!Array.isArray(v.albums)||v.albums.length>100||v.albums.some(a=>!a||!validId(a.id)||a.id==='unfiled'||typeof a.name!=='string'||!a.name.trim()||a.name.length>60||!ids(a.modelIds)||a.modelIds.some(id=>!v.bookmarks.includes(id)))||new Set(v.albums.map(a=>a.id)).size!==v.albums.length)throw new Error('Your saved albums could not be read. Existing data has been kept unchanged.')
}
export function readBookmarkLibrary():BookmarkLibrary{
 const raw=localStorage.getItem(BOOKMARK_LIBRARY_KEY)
 if(raw!==null){let value:unknown;try{value=JSON.parse(raw)}catch{throw new Error('Your saved albums could not be read. Existing data has been kept unchanged.')};validate(value);return value}
 const legacy=localStorage.getItem('formforge-collected')
 if(!legacy)return emptyBookmarkLibrary()
 const value:unknown=JSON.parse(legacy)
 if(!Array.isArray(value))throw new Error('Your bookmarks could not be read. Existing data has been kept unchanged.')
 const library={...emptyBookmarkLibrary(),bookmarks:[...new Set(value.filter(validId))]}
 validate(library);return library
}
export function bookmarkIds(library:BookmarkLibrary,albumId?:string|null):string[]{
 if(!albumId)return library.bookmarks
 if(albumId==='unfiled'){const filed=new Set(library.albums.flatMap(a=>a.modelIds));return library.bookmarks.filter(id=>!filed.has(id))}
 return library.albums.find(a=>a.id===albumId)?.modelIds??[]
}
export function updateBookmarkLibrary(command:BookmarkCommand):BookmarkLibrary{
 const library=readBookmarkLibrary()
 if(command.type==='create'||command.type==='rename'){
  const name=command.name.trim()
  if(!name||name.length>60)throw new Error('Give your album a name between 1 and 60 characters.')
  if(library.albums.some(a=>a.id!==command.id&&a.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error('An album with this name already exists.')
  if(command.type==='create'){
   if(library.albums.length>=100)throw new Error('You can create up to 100 albums.')
   if(!validId(command.id)||command.id==='unfiled'||library.albums.some(a=>a.id===command.id))throw new Error('This album already exists or has an invalid ID.')
   library.albums.push({id:command.id,name,modelIds:[]})
  }else{const album=library.albums.find(a=>a.id===command.id);if(!album)throw new Error('This album no longer exists.');album.name=name}
 }else if(command.type==='delete'){
  library.albums=library.albums.filter(a=>a.id!==command.id)
 }else{
  if(!validId(command.modelId))throw new Error('This design has an invalid ID.')
  if(command.type==='assign'&&command.albumIds.some(id=>!library.albums.some(a=>a.id===id)))throw new Error('An album no longer exists. Close this window and try again.')
  const save=command.type==='assign'||command.saved
  library.bookmarks=library.bookmarks.filter(id=>id!==command.modelId)
  if(save)library.bookmarks.push(command.modelId)
  for(const album of library.albums){
   if(command.type==='assign'||!save)album.modelIds=album.modelIds.filter(id=>id!==command.modelId)
   if(command.type==='assign'&&command.albumIds.includes(album.id))album.modelIds.push(command.modelId)
  }
 }
 validate(library)
 try{localStorage.setItem(BOOKMARK_LIBRARY_KEY,JSON.stringify(library))}catch{throw new Error('Browser storage is full or unavailable. Your bookmarks and albums were not changed.')}
 return library
}

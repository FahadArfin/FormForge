import type {ModelDocument} from '@formforge/model'
export type SavedCloudLink={projectId:string;localId:string;revision:number;documentKey?:string}
export function documentFingerprint(doc:ModelDocument){
 const {id,revision,createdAt,updatedAt,...content}=doc;void id;void revision;void createdAt;void updatedAt
 let h=2166136261;const json=JSON.stringify(content);for(let i=0;i<json.length;i++)h=Math.imul(h^json.charCodeAt(i),16777619)
 return `${json.length}:${h>>>0}`
}
const key='formforge.cloud-links.v1'
export function readCloudLink(id:string):SavedCloudLink|null{try{return JSON.parse(localStorage.getItem(key)??'{}')[id]??null}catch{return null}}
export function rememberCloudLink(link:SavedCloudLink|null,localId:string){try{const all=JSON.parse(localStorage.getItem(key)??'{}');delete all[link?.localId??localId];if(link)all[link.localId]=link;localStorage.setItem(key,JSON.stringify(Object.fromEntries(Object.entries(all).slice(-100))))}catch{}}

export function invalidateCloudLinks(projectId:string,revisions?:number[]){
 try{const all:Record<string,SavedCloudLink>=JSON.parse(localStorage.getItem(key)??'{}');for(const [id,link] of Object.entries(all))if(link.projectId===projectId&&(!revisions||revisions.includes(link.revision)))delete all[id];localStorage.setItem(key,JSON.stringify(all));window.dispatchEvent(new Event('formforge:cloud-links-changed'))}catch{}
}

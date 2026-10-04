import { strToU8, zip } from 'fflate'
export const PACKAGE_LIMIT = 64 * 1024 * 1024
export function checkCancelled(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('Export cancelled. No archive was downloaded.','AbortError')}
export function csv(rows:unknown[][]){return rows.map(row=>row.map(value=>{let text=String(value??'');if(/^\s*[=+@\-]|^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'}).join(',')).join('\r\n')}
export async function zipPackage(files:Record<string,Uint8Array>,signal?:AbortSignal):Promise<Blob>{
 checkCancelled(signal)
 if(Object.values(files).reduce((n,b)=>n+b.byteLength,0)>PACKAGE_LIMIT)throw new Error('This package exceeds 64 MiB. Export fewer variants or simpler parts.')
 return new Promise((resolve,reject)=>{
  let terminate:()=>void=()=>undefined
  const cancel=()=>{terminate();reject(new DOMException('Export cancelled. No archive was downloaded.','AbortError'))}
  signal?.addEventListener('abort',cancel,{once:true})
  terminate=zip(files,{level:0},(error,data)=>{signal?.removeEventListener('abort',cancel);if(error)reject(error);else if(signal?.aborted)cancel();else resolve(new Blob([data as Uint8Array<ArrayBuffer>],{type:'application/zip'}))})
 })
}
export const textFile=(value:string)=>strToU8(value)

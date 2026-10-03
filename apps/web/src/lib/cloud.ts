export interface CloudProject {id:string;name:string;revision:number;updated:number;role:'owner'|'reviewer';sharing:boolean}
export interface CloudComment {id:string;revision:number;author:string;body:string;parent:string|null;resolved:number;created:number}
export async function cloudRequest<T>(path:string,options:{method?:string;body?:unknown;signal?:AbortSignal}={}):Promise<T>{
  const response=await fetch(`/api/cloud${path}`,{method:options.method??'GET',credentials:'same-origin',cache:'no-store',signal:options.signal??AbortSignal.timeout(20000),headers:options.body===undefined?undefined:{'Content-Type':'application/json'},body:options.body===undefined?undefined:JSON.stringify(options.body)})
  if(!response.headers.get('Content-Type')?.includes('application/json'))throw new Error('Cloud accounts are available on the published FormForge site. Your local work is safe.')
  const data=await response.json();if(path==='/session'&&response.status===404)throw new Error('Cloud accounts are available on the published FormForge site. Your local work is safe.');if(!response.ok)throw new Error(data.error||'Cloud request failed. Please retry.');return data as T
}
export const signInPath=()=>`/signin-with-chatgpt?return_to=${encodeURIComponent('/'+window.location.hash)}`

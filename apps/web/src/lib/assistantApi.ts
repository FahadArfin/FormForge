import {resolveDocumentParameterBindings} from './modelParameters'
import type {ModelDocument,DesignPlan} from '@formforge/model'
export type AssistantProvider='webmcp'|'chatgpt'|'local'
export interface AssistantModel {id:string;label:string}
export interface AssistantStatus {
 available:boolean;csrfToken:string;
 providers:{chatgpt:{enabled:boolean;connected:boolean;account?:{id:string;label:string};accounts:{id:string;label:string;connected:boolean}[];models:AssistantModel[];credentialStorage?:string;error?:string};local:{enabled:boolean;models:AssistantModel[]}}
}
export const isLocalAssistantHost=(hostname:string)=>['localhost','127.0.0.1','[::1]'].includes(hostname)
export async function assistantApi<T>(path:string,options:{body?:unknown;csrfToken?:string;signal?:AbortSignal}={}):Promise<T>{
 const response=await fetch('/api/assistant'+path,{method:options.body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:options.signal??AbortSignal.timeout(120000),headers:options.body===undefined?undefined:{'Content-Type':'application/json','X-PrintLab-CSRF':options.csrfToken??''},body:options.body===undefined?undefined:JSON.stringify(options.body)})
 if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Start the local PrintLab API to connect an account or installed model. Site tools remain available.')
 const result=await response.json()
 if(!response.ok)throw Error(typeof result.error==='string'?result.error:'Assistant request failed. The design is unchanged.')
 return result as T
}
export function assistantDocument(document:ModelDocument){
 const resolved=resolveDocumentParameterBindings(document);if(Object.keys(resolved.errors).length)throw Error('Resolve parameter errors before sending the design to an assistant.');document=resolved.document
 const nodes=document.nodes.filter(n=>n.kind!=='mesh'&&!n.mesh)
 if(nodes.length>128||document.namedParameters.length>128)throw Error('Direct chat supports up to 128 parametric features and parameters. Use Site tools for larger designs.')
 // Operation history can contain old user instructions. Send the current parametric definition only.
 return {nodes,namedParameters:document.namedParameters.map(parameter=>({...parameter,value:resolved.evaluation?.get(parameter.name)?.value??parameter.value})),engineering:document.engineering?{...document.engineering,history:[]}:undefined}
}
export function validatedAuthorizationUrl(value:string){const url=new URL(value);if(url.origin!=='https://auth.openai.com'||url.pathname!=='/api/accounts/authorize'||url.username||url.password||url.hash)throw Error('The local API returned an invalid sign-in destination.');if(url.searchParams.has('id_token_hint'))throw Error('Sign-in URLs must not expose retained tokens.');return url.href}
export interface AssistantChatResult {message:string;plan?:DesignPlan}

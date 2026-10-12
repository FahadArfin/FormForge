import type {FastifyInstance,FastifyRequest} from 'fastify'
import {randomBytes,timingSafeEqual} from 'node:crypto'
import {z} from 'zod'
import {modelDocumentSchema,modelNodeSchema} from '@formforge/model'
import {ChatGPTClient,isLoopbackAddress,isLoopbackHost} from './chatgpt.js'
import {AssistantError,assistantAnswerSchema,assistantInstructions,boundedJson} from './assistantTransport.js'
import {loadEngineeringConfig,type EngineeringConfig} from './engineering.js'

export interface AssistantConfig{chatgptEnabled:boolean;uiOrigin:string;apiPort:number;timeoutMs:number}
export function loadAssistantConfig(env:NodeJS.ProcessEnv):AssistantConfig{
 const ui=new URL(env.ENGINEERING_UI_ORIGIN??'http://localhost:5173')
 if(!isLoopbackHost(ui.hostname)||!['http:','https:'].includes(ui.protocol)||ui.href!==ui.origin+'/'||ui.username||ui.password)throw new Error('Configure an exact loopback browser origin.')
 const apiPort=Number(env.API_PORT??8787),timeoutMs=Number(env.ENGINEERING_CHAT_TIMEOUT_MS??45000)
 if(!Number.isInteger(apiPort)||apiPort<1||apiPort>65535||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw new Error('Invalid local assistant configuration.')
 return {chatgptEnabled:env.ENGINEERING_CHATGPT_ENABLED==='true',uiOrigin:ui.origin,apiPort,timeoutMs}
}
const chatSchema=z.object({
 provider:z.enum(['chatgpt','local']),model:z.string().trim().min(1).max(128),prompt:z.string().trim().min(1).max(8000),
 history:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().max(4000)}).strict()).max(12),
 selectedIds:z.array(z.string().min(1).max(128)).max(128).optional(),
 document:z.object({nodes:z.array(modelNodeSchema).max(128).refine(nodes=>nodes.every(node=>node.kind!=='mesh'&&!node.mesh)),namedParameters:modelDocumentSchema.shape.namedParameters.refine(values=>values.length<=128),engineering:modelDocumentSchema.shape.engineering}).strict(),
}).strict().refine(value=>!value.selectedIds||value.selectedIds.every(id=>value.document.nodes.some(node=>node.id===id)))
const accountSchema=z.object({accountId:z.string().min(1).max(200).optional()}).strict()
function trusted(request:FastifyRequest,config:AssistantConfig){
 if(!isLoopbackAddress(request.raw.socket.remoteAddress))return false // Never trust forwarded IPs.
 try{
  const host=new URL(`http://${request.headers.host??''}`),ui=new URL(config.uiOrigin)
  if(!isLoopbackHost(host.hostname)||host.username||host.password||host.pathname!=='/'||host.search||host.hash)return false
  if(Number(host.port||80)!==config.apiPort&&host.host!==ui.host)return false
  const origin=request.headers.origin
  if(origin!==undefined)return origin===config.uiOrigin&&request.headers['sec-fetch-site']!=='cross-site'
  // Browsers omit Origin for same-origin GETs through a local dev proxy.
  return request.method==='GET'&&request.headers['sec-fetch-site']==='same-origin'&&host.host===ui.host
 }catch{return false}
}
function matches(left:unknown,right:string){if(typeof left!=='string')return false;const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b)}

export function registerAssistantRoutes(app:FastifyInstance,{config,client=new ChatGPTClient({timeoutMs:config.timeoutMs}),local=loadEngineeringConfig({})}:{config:AssistantConfig;client?:ChatGPTClient;local?:EngineeringConfig}){
 const csrfToken=randomBytes(32).toString('base64url'),recentChat:number[]=[],recentAuth:number[]=[]
 let active:AbortController|undefined,initializationFailed=false
 function limit(recent:number[]){const cutoff=Date.now()-60000;while(recent.length&&recent[0]!<cutoff)recent.shift();if(recent.length>=6)throw new AssistantError(429,'The assistant request limit was reached. Try again shortly.');recent.push(Date.now())}
 if(config.chatgptEnabled)app.addHook('onReady',async()=>{try{await client.initialize()}catch{initializationFailed=true;app.log.warn('The local ChatGPT account registry could not be loaded; assistant access is disabled.')}})
 app.addHook('onClose',async()=>{active?.abort();await client.close()})
 void app.register(async routes=>{
  routes.addHook('onRequest',async(request,reply)=>{
   reply.header('Cache-Control','no-store').header('Vary','Origin').header('X-Content-Type-Options','nosniff')
   // The surrounding API enables broad CORS for unrelated routes. It grants no authority here.
   if(!trusted(request,config)){reply.removeHeader('Access-Control-Allow-Origin');return reply.code(403).send({error:'The assistant is available only from the configured local PrintLab browser.'})}
   if(request.method!=='GET'&&!matches(request.headers['x-printlab-csrf'],csrfToken))return reply.code(403).send({error:'Refresh the local assistant connection before making changes.'})
   if(initializationFailed)return reply.code(503).send({error:'The local ChatGPT account registry could not be loaded. Check the local API configuration.'})
  })
  routes.setErrorHandler((error,_request,reply)=>{
   const status=error instanceof AssistantError?error.status:(error as {statusCode?:number}).statusCode===413?413:502
   reply.code(status).send({error:error instanceof AssistantError?error.message:status===413?'The assistant request is too large.':'The assistant could not complete this request. No changes were applied.'})
  })
  routes.get('/api/assistant/status',async()=>({available:true,csrfToken,providers:{chatgpt:{enabled:config.chatgptEnabled,...client.status()},local:{enabled:local.enabled,models:local.enabled?[{id:local.model,label:local.model}]:[]}}}))
  routes.get('/api/assistant/models',async()=>{
   if(!config.chatgptEnabled)throw new AssistantError(503,'Local ChatGPT sign-in is not enabled in this API.')
   return {models:await client.models()}
  })
  routes.post('/api/assistant/chatgpt/connect',{bodyLimit:1024},async request=>{
   if(!config.chatgptEnabled)throw new AssistantError(503,'Enable ENGINEERING_CHATGPT_ENABLED in the local API to connect ChatGPT.')
   const parsed=accountSchema.safeParse(request.body??{});if(!parsed.success)throw new AssistantError(400,'Choose a saved account or add a new one.')
   limit(recentAuth);return client.connect(parsed.data.accountId)
  })
  routes.post('/api/assistant/chatgpt/disconnect',{bodyLimit:1024},async request=>{
   const parsed=accountSchema.safeParse(request.body??{});if(!parsed.success)throw new AssistantError(400,'Choose a valid ChatGPT account.')
   active?.abort();return client.disconnect(parsed.data.accountId)
  })
  routes.post('/api/assistant/chat',{bodyLimit:256*1024},async(request,reply)=>{
   const parsed=chatSchema.safeParse(request.body);if(!parsed.success)throw new AssistantError(400,'Send a bounded conversation, valid selected features and at most 128 parametric features.')
   const {provider,model,prompt,history,document,selectedIds}=parsed.data
   if(provider==='chatgpt'&&!config.chatgptEnabled)throw new AssistantError(503,'Local ChatGPT sign-in is not enabled.')
   if(provider==='local'&&!local.enabled)throw new AssistantError(503,'The optional local model is not configured.')
   if(provider==='local'&&model!==local.model)throw new AssistantError(400,'Choose the configured local model.')
   if(active)throw new AssistantError(429,'The assistant is already working on a request.')
   limit(recentChat)
   const controller=new AbortController();active=controller
   const timeout=setTimeout(()=>controller.abort(),config.timeoutMs)
   const disconnected=()=>{if(!reply.raw.writableEnded)controller.abort()}
   reply.raw.on('close',disconnected)
   try{
    const context={...document,...(selectedIds?{selectedIds}:{})}
    if(provider==='chatgpt')return await client.chat(model,prompt,history,context,controller.signal)
    const response=await fetch(local.url,{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json',...(local.apiKey?{Authorization:`Bearer ${local.apiKey}`}:{})},body:JSON.stringify({model:local.model,stream:false,temperature:.1,max_tokens:8192,response_format:{type:'json_object'},messages:[{role:'system',content:assistantInstructions},...history,{role:'user',content:JSON.stringify({prompt,document:context})}]})})
    const envelope=z.object({choices:z.array(z.object({message:z.object({content:z.string().max(256*1024)})})).min(1).max(8)}).parse(await boundedJson(response,local.maxResponseBytes))
    return assistantAnswerSchema.parse(JSON.parse(envelope.choices[0]!.message.content))
   }catch(error){
    if(controller.signal.aborted)return reply.code(504).send({error:'The assistant request timed out or was cancelled. No changes were applied.'})
    throw error
   }finally{clearTimeout(timeout);reply.raw.off('close',disconnected);if(active===controller)active=undefined}
  })
 },{logLevel:'silent'})
}

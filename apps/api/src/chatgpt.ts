import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {mkdir,readFile,writeFile,rename,unlink,stat} from 'node:fs/promises'
import {dirname,join} from 'node:path'
import {homedir} from 'node:os'
import {createLocalJWKSet,jwtVerify,type JSONWebKeySet} from 'jose'
import {z} from 'zod'
import {AssistantError,boundedJson,completedResponse,assistantInstructions,type AssistantAnswer} from './assistantTransport.js'

const resource='https://api.openai.com/v1'
const scope='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const opaque=()=>randomBytes(32).toString('base64url')
const equal=(a:string,b:string)=>{const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right)}
export const isLoopbackAddress=(address:string|undefined)=>!!address&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address.toLowerCase())
export const isLoopbackHost=(hostname:string)=>['127.0.0.1','localhost','[::1]','::1'].includes(hostname.toLowerCase())
export interface ChatGPTEndpoints{issuer:string;discovery:string;authorize:string;token:string;models:string;responses:string}
const officialEndpoints:ChatGPTEndpoints={issuer:'https://auth.openai.com',discovery:'https://auth.openai.com/.well-known/openid-configuration',authorize:'https://auth.openai.com/api/accounts/authorize',token:'https://auth.openai.com/api/accounts/oauth/token',models:resource+'/models',responses:resource+'/responses'}
export interface AssistantModel{id:string;label:string}
type Tokens={access:string;refresh:string;id:string;expiresAt:number;scopes:string[]}
type Account={id:string;label:string;subject:string;clientId:string;tokens?:Tokens;models:AssistantModel[];modelsAt:number;refreshing?:Promise<Tokens>;generation:number}
type Pending={state:string;nonce:string;verifier:string;redirectUri:string;clientId?:string;accountId?:string;expiresAt:number;generation:number}
const tokenSchema=z.object({access_token:z.string().min(1).max(32000).regex(/^[\x21-\x7e]+$/),refresh_token:z.string().min(1).max(32000),id_token:z.string().min(1).max(32000).optional(),token_type:z.literal('Bearer'),expires_in:z.number().int().positive().max(365*86400),scope:z.string().max(4000)})
const clientIdSchema=z.string().regex(/^oaiapp_[A-Za-z0-9_-]{1,200}$/)

/** Tokens deliberately live in memory only, never in a browser or plaintext file. */
export class ChatGPTClient{
 private readonly endpoints:ChatGPTEndpoints
 private readonly hostIdPath:string
 private readonly timeoutMs:number
 private hostId?:string
 private initialized?:Promise<void>
 private saveQueue:Promise<void>=Promise.resolve()
 private listener?:Server
 private listenerStarting?:Promise<string>
 private callbackUri?:string
 private pending?:Pending
 private expiryTimer?:NodeJS.Timeout
 private readonly accounts=new Map<string,Account>()
 private activeId?:string
 private generation=0
 private error?:string
 private metadata?:{jwks_uri:string;revocation_endpoint?:string}
 private jwks?:{keys:JSONWebKeySet;at:number}
 private readonly controllers=new Set<AbortController>()
 constructor(options:{hostIdPath?:string;timeoutMs?:number;endpoints?:ChatGPTEndpoints}={}){
  // Endpoint injection is code-only for mock tests, never request or environment controlled.
  this.endpoints=options.endpoints??officialEndpoints;this.timeoutMs=options.timeoutMs??45000
  this.hostIdPath=options.hostIdPath??join(homedir(),'.printlab','chatgpt-host-id')
 }
 async initialize(){
  this.initialized??=(async()=>{
   const path=join(dirname(this.hostIdPath),'chatgpt-accounts.json')
   try{
    if((await stat(path)).size>65536)throw new Error('Account registry too large')
    const registry=z.object({version:z.literal(1),accounts:z.array(z.object({id:z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),label:z.string().min(1).max(300),subject:z.string().min(1).max(1000),clientId:clientIdSchema}).strict()).max(8)}).strict().parse(JSON.parse(await readFile(path,'utf8')))
    if(new Set(registry.accounts.map(account=>account.id)).size!==registry.accounts.length)throw new Error('Duplicate account registrations')
    for(const account of registry.accounts)this.accounts.set(account.id,{...account,models:[],modelsAt:0,generation:0})
   }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  })()
  return this.initialized
 }
 private async saveRegistrations(accounts:Account[]){
  const path=join(dirname(this.hostIdPath),'chatgpt-accounts.json')
  const data=JSON.stringify({version:1,accounts:accounts.map(({id,label,subject,clientId})=>({id,label,subject,clientId}))})
  const save=this.saveQueue.then(async()=>{
   await mkdir(dirname(path),{recursive:true,mode:0o700})
   const temporary=path+'.'+randomUUID()+'.tmp'
   try{await writeFile(temporary,data,{flag:'wx',mode:0o600});await rename(temporary,path)}finally{await unlink(temporary).catch(()=>{})}
  })
  this.saveQueue=save.catch(()=>{})
  await save
 }
 status(){
  const active=this.activeId?this.accounts.get(this.activeId):undefined
  return {connected:!!active?.tokens,connecting:!!this.pending,credentialStorage:'session-only' as const,accounts:[...this.accounts.values()].map(account=>({id:account.id,label:account.label,connected:!!account.tokens})),...(active?{account:{id:active.id,label:active.label}}:{}),models:active?.tokens?active.models:[],...(this.error?{error:this.error}:{})}
 }
 private async host(){
  if(this.hostId)return this.hostId
  await mkdir(dirname(this.hostIdPath),{recursive:true,mode:0o700})
  try{this.hostId=(await readFile(this.hostIdPath,'utf8')).trim()}catch(error){
   if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error
   const id='urn:uuid:'+randomUUID()
   try{await writeFile(this.hostIdPath,id,{flag:'wx',mode:0o600});this.hostId=id}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;this.hostId=(await readFile(this.hostIdPath,'utf8')).trim()}
  }
  if(!/^urn:uuid:[0-9a-f-]{36}$/i.test(this.hostId))throw new Error('Invalid host configuration')
  return this.hostId
 }
 private async bounded<T>(work:(signal:AbortSignal)=>Promise<T>,signal?:AbortSignal):Promise<T>{
  const controller=new AbortController();this.controllers.add(controller)
  const timer=setTimeout(()=>controller.abort(),this.timeoutMs),cancel=()=>controller.abort()
  if(signal?.aborted)controller.abort();signal?.addEventListener('abort',cancel,{once:true})
  try{return await work(controller.signal)}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);this.controllers.delete(controller)}
 }
 private async discovery(signal:AbortSignal){
  if(this.metadata)return this.metadata
  const parsed=z.object({issuer:z.string(),authorization_endpoint:z.string(),token_endpoint:z.string(),jwks_uri:z.string(),revocation_endpoint:z.string().optional()}).parse(await boundedJson(await fetch(this.endpoints.discovery,{signal,redirect:'error'})))
  if(parsed.issuer!==this.endpoints.issuer||parsed.authorization_endpoint!==this.endpoints.authorize||parsed.token_endpoint!==this.endpoints.token)throw new Error('Invalid discovery')
  for(const value of [parsed.jwks_uri,parsed.revocation_endpoint].filter((value):value is string=>!!value)){
   const url=new URL(value);if(url.origin!==new URL(this.endpoints.issuer).origin||url.username||url.password||url.hash)throw new Error('Untrusted discovery endpoint')
  }
  this.metadata=parsed;return parsed
 }
 private async identity(idToken:string,clientId:string,signal:AbortSignal,nonce?:string){
  const metadata=await this.discovery(signal)
  const header=z.object({kid:z.string().max(200),alg:z.enum(['RS256','ES256'])}).parse(JSON.parse(Buffer.from(idToken.split('.')[0]??'','base64url').toString()))
  if(!this.jwks||Date.now()-this.jwks.at>300000||!this.jwks.keys.keys.some(key=>key.kid===header.kid)){
   const value=z.object({keys:z.array(z.record(z.string(),z.unknown())).min(1).max(32)}).parse(await boundedJson(await fetch(metadata.jwks_uri,{signal,redirect:'error'})))
   this.jwks={keys:value as JSONWebKeySet,at:Date.now()}
  }
  const {payload}=await jwtVerify(idToken,createLocalJWKSet(this.jwks.keys),{issuer:this.endpoints.issuer,audience:clientId,algorithms:['RS256','ES256'],requiredClaims:['sub','exp','iat'],clockTolerance:5})
  if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>1000||typeof payload.iat!=='number'||payload.iat>Date.now()/1000+5)throw new Error('Invalid identity')
  if(Array.isArray(payload.aud)&&payload.aud.length>1&&payload.azp!==clientId)throw new Error('Invalid authorized party')
  if(nonce!==undefined&&(typeof payload.nonce!=='string'||!equal(nonce,payload.nonce)))throw new Error('Invalid nonce')
  return payload
 }
 private async tokens(form:URLSearchParams,signal:AbortSignal){
  const value=tokenSchema.parse(await boundedJson(await fetch(this.endpoints.token,{method:'POST',signal,redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:form})))
  const scopes=value.scope.split(/\s+/)
  if(!scopes.includes('chatgpt.tokens.use.direct')||!scopes.includes('resource.invoke'))throw new Error('Missing plan permission')
  return {access:value.access_token,refresh:value.refresh_token,id:value.id_token??'',expiresAt:Date.now()+value.expires_in*1000,scopes}
 }
 private async startListener(){
  if(this.callbackUri)return this.callbackUri
  if(this.listenerStarting)return this.listenerStarting
  this.listenerStarting=new Promise<string>((resolve,reject)=>{
   const server=createServer((request,response)=>{
    // Dedicated callback server deliberately has no URL or request logger.
    response.setHeader('Cache-Control','no-store');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Content-Type','text/plain; charset=utf-8')
    const safeReply=(status:number,message:string)=>{if(!response.destroyed){response.statusCode=status;response.end(message)}}
    if(request.method!=='GET'||!isLoopbackAddress(request.socket.remoteAddress)||request.headers.host!==new URL(this.callbackUri!).host||(request.url?.length??0)>12000)return safeReply(400,'Sign-in could not be verified. Return to PrintLab and try again.')
    let url:URL;try{url=new URL(request.url??'',this.callbackUri)}catch{return safeReply(400,'Invalid callback.')}
    if(url.pathname!=='/auth/callback')return safeReply(404,'Not found.')
    void this.callback(url).then(()=>safeReply(200,'ChatGPT connected. Return to PrintLab. Credentials last only until the local API stops.'),()=>safeReply(400,'Sign-in could not be verified. Return to PrintLab and start a fresh connection.'))
   })
   server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=32
   server.once('error',reject);server.listen(0,'127.0.0.1',()=>{this.listener=server;this.callbackUri=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/auth/callback`;resolve(this.callbackUri)})
  })
  try{return await this.listenerStarting}finally{this.listenerStarting=undefined}
 }
 async connect(accountId?:string){
  const generation=++this.generation
  await this.initialize()
  if(generation!==this.generation)throw new AssistantError(409,'A newer connection attempt replaced this one.')
  if(accountId&&!this.accounts.has(accountId))throw new AssistantError(400,'Choose a known ChatGPT account or add a new one.')
  if(this.accounts.size>=8&&!accountId)throw new AssistantError(429,'Eight ChatGPT account registrations are saved. Choose one of the saved accounts.')
  const account=accountId?this.accounts.get(accountId):undefined
  const redirectUri=await this.startListener(),hostId=await this.host()
  if(generation!==this.generation)throw new AssistantError(409,'A newer connection attempt replaced this one.')
  const pending:Pending={state:opaque(),nonce:opaque(),verifier:opaque(),redirectUri,expiresAt:Date.now()+600000,generation:this.generation,...(account?{accountId:account.id,clientId:account.clientId}:{})}
  this.pending=pending;this.error=undefined;clearTimeout(this.expiryTimer)
  this.expiryTimer=setTimeout(()=>{if(this.pending===pending){this.pending=undefined;this.error='Sign-in expired. Continue with ChatGPT again.'}},600000);this.expiryTimer.unref()
  const url=new URL(this.endpoints.authorize)
  url.search=new URLSearchParams({client_id:account?.clientId??'dynamic_agent_client',...(account?{}:{agent_name_hint:'PrintLab'}),ext_agent_host_id:hostId,response_type:'code',redirect_uri:redirectUri,scope,resource,state:pending.state,nonce:pending.nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(pending.verifier).digest('base64url')}).toString()
  // Hints are intentionally omitted: no ID token is ever handed to browser JS.
  return {url:url.href}
 }
 private async callback(url:URL){
  const pending=this.pending,state=url.searchParams.get('state')??''
  if(!pending||!equal(pending.state,state))throw new Error('Unknown transaction')
  this.pending=undefined;clearTimeout(this.expiryTimer) // consume before any awaits, including provider failures
  try{
   if(pending.expiresAt<=Date.now()||pending.generation!==this.generation)throw new Error('Expired transaction')
   for(const name of ['state','code','client_id','error'])if(url.searchParams.getAll(name).length>1)throw new Error('Duplicate callback parameter')
   if(url.searchParams.has('error'))throw new Error('Authorization denied')
   const code=url.searchParams.get('code');if(!code||code.length>4096)throw new Error('Missing code')
   const supplied=url.searchParams.get('client_id'),clientId=clientIdSchema.parse(supplied??pending.clientId)
   if(pending.clientId&&clientId!==pending.clientId)throw new Error('Client changed')
   await this.bounded(async signal=>{
    const tokens=await this.tokens(new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code,code_verifier:pending.verifier,redirect_uri:pending.redirectUri,resource}),signal)
    if(!tokens.id)throw new Error('Missing identity')
    const identity=await this.identity(tokens.id,clientId,signal,pending.nonce)
    const original=pending.accountId?this.accounts.get(pending.accountId):undefined
    if(original&&(identity.sub!==original.subject||clientId!==original.clientId))throw new Error('Account identity changed')
    if(pending.generation!==this.generation)throw new Error('Connection cancelled')
    const existing=original??[...this.accounts.values()].find(value=>value.subject===identity.sub&&value.clientId===clientId)
    const id=existing?.id??opaque(),number=[...this.accounts.keys()].indexOf(id)+1||this.accounts.size+1
    const email=typeof identity.email==='string'&&identity.email.length<=254?identity.email:'ChatGPT account'
    const account:Account={id,label:existing?.label??`${email} · ${number}`,subject:identity.sub!,clientId,tokens,models:[],modelsAt:0,generation:(existing?.generation??0)+1}
    await this.saveRegistrations([...this.accounts.values()].filter(value=>value.id!==id).concat(account))
    if(pending.generation!==this.generation)throw new Error('Connection cancelled')
    if(existing){existing.generation++;existing.tokens=undefined;existing.models=[]}
    this.accounts.set(id,account);this.activeId=id;this.error=undefined
   })
   try{if(pending.generation===this.generation)await this.models()}catch{if(pending.generation===this.generation)this.error='Connected, but the model catalog could not load. Refresh models or reconnect.'}
  }catch{if(pending.generation===this.generation)this.error='Sign-in failed validation or plan-use permission was not granted. Continue with ChatGPT again.';throw new Error('Sign-in failed')}
 }
 private active(){const account=this.activeId?this.accounts.get(this.activeId):undefined;if(!account?.tokens)throw new AssistantError(401,'Continue with ChatGPT before sending a request.');return account}
 private async freshTokens(account:Account,signal:AbortSignal):Promise<Tokens>{
  const current=account.tokens;if(!current)throw new AssistantError(401,'Continue with ChatGPT again.')
  if(current.expiresAt>Date.now()+60000)return current
  if(account.refreshing)return account.refreshing
  const generation=account.generation
  account.refreshing=(async()=>{
   try{
    const tokens=await this.tokens(new URLSearchParams({grant_type:'refresh_token',client_id:account.clientId,refresh_token:current.refresh,resource}),signal)
    if(tokens.id){const identity=await this.identity(tokens.id,account.clientId,signal);if(identity.sub!==account.subject)throw new Error('Identity changed')}else tokens.id=current.id
    if(account.generation!==generation||!account.tokens)throw new Error('Disconnected')
    account.tokens=tokens;return tokens
   }catch{if(account.generation===generation){account.tokens=undefined;account.models=[];this.error='Your ChatGPT session needs a fresh sign-in.'}throw new AssistantError(401,'Continue with ChatGPT again to renew the connection.')}
  })()
  try{return await account.refreshing}finally{account.refreshing=undefined}
 }
 async models(signal?:AbortSignal):Promise<AssistantModel[]>{
  const account=this.active(),generation=account.generation
  return this.bounded(async boundedSignal=>{
   const tokens=await this.freshTokens(account,boundedSignal)
   const response=await fetch(this.endpoints.models,{signal:boundedSignal,redirect:'error',headers:{Authorization:`Bearer ${tokens.access}`}})
   const catalog=z.object({models:z.array(z.object({slug:z.string().min(1).max(128),display_name:z.string().min(1).max(200),visibility:z.string()})).max(512)}).parse(await boundedJson(response))
   if(account.generation!==generation||!account.tokens)throw new AssistantError(401,'The account was disconnected.')
   account.models=catalog.models.filter(model=>model.visibility==='list').map(model=>({id:model.slug,label:model.display_name}));account.modelsAt=Date.now();this.error=undefined
   return account.models
  },signal)
 }
 async chat(model:string,prompt:string,history:Array<{role:'user'|'assistant';content:string}>,document:unknown,signal:AbortSignal):Promise<AssistantAnswer>{
  const account=this.active(),generation=account.generation
  if(Date.now()-account.modelsAt>60000)await this.models(signal)
  if(!account.models.some(item=>item.id===model))throw new AssistantError(400,'Choose a model from this ChatGPT account’s current catalog.')
  return this.bounded(async boundedSignal=>{
   const tokens=await this.freshTokens(account,boundedSignal)
   const response=await fetch(this.endpoints.responses,{method:'POST',redirect:'error',signal:boundedSignal,headers:{Authorization:`Bearer ${tokens.access}`,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,stream:true,max_output_tokens:8192,instructions:assistantInstructions,input:[...history,{role:'user',content:JSON.stringify({prompt,document})}]})})
   const result=await completedResponse(response)
   if(account.generation!==generation||!account.tokens||this.activeId!==account.id)throw new AssistantError(409,'The selected account changed during the response. Send the request again.')
   return result
  },signal)
 }
 async disconnect(accountId?:string){
  const account=accountId?this.accounts.get(accountId):this.activeId?this.accounts.get(this.activeId):undefined
  if(accountId&&!account)throw new AssistantError(400,'Unknown ChatGPT account.')
  this.generation++;this.pending=undefined;clearTimeout(this.expiryTimer);for(const controller of this.controllers)controller.abort()
  const tokens=account?.tokens;if(account){account.generation++;account.tokens=undefined;account.models=[];if(account.id===this.activeId)this.activeId=undefined}
  let confirmed=!tokens
  if(tokens&&account){
   // Credentials are removed locally before network activity; revocation gets a bounded retry.
   for(let attempt=0;attempt<2&&!confirmed;attempt++){
    try{confirmed=await this.bounded(async signal=>{const metadata=await this.discovery(signal);if(!metadata.revocation_endpoint)return false;const response=await fetch(metadata.revocation_endpoint,{method:'POST',signal,redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:tokens.refresh,token_type_hint:'refresh_token',client_id:account.clientId})});await response.body?.cancel();return response.status===200})}catch{confirmed=false}
    if(!confirmed&&attempt===0)await new Promise(resolve=>setTimeout(resolve,100))
   }
  }
  this.error=undefined
  return {remoteRevocationConfirmed:confirmed,message:confirmed?'Signed out. Local credentials were cleared.':'Signed out locally. Remote revocation was not confirmed; disconnect PrintLab in ChatGPT Settings.'}
 }
 async close(){
  this.generation++;this.pending=undefined;clearTimeout(this.expiryTimer);for(const controller of this.controllers)controller.abort();this.accounts.clear();await this.saveQueue
  const server=this.listener;if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
 }
}

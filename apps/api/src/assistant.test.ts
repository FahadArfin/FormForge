import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import {completedResponse} from './assistantTransport.js'
import {generateKeyPair, exportJWK, SignJWT} from 'jose'
import {createServer,request as httpRequest, type IncomingMessage, type ServerResponse} from 'node:http'
import {mkdtemp, rm,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {registerAssistantRoutes, loadAssistantConfig} from './assistant.js'
import {ChatGPTClient, type ChatGPTEndpoints} from './chatgpt.js'

const plan={version:1,title:'Measured plan',requirements:[],questions:['What is the mounting spacing?'],assumptions:[],expectedChecks:[],operations:[]}
const answer={message:'What mounting spacing should I use?',plan}
const payload={provider:'chatgpt',model:'listed-model',prompt:'Make a shelf',history:[],document:{nodes:[],namedParameters:[]}}
const headers={host:'localhost:8787',origin:'http://localhost:5173'}
async function fixture(){
 const keys=await generateKeyPair('RS256'),jwk={...await exportJWK(keys.publicKey),kid:'test-key',alg:'RS256',use:'sig'}
 const directory=await mkdtemp(join(tmpdir(),'printlab-auth-test-'))
 let auth:URL|undefined, mode='ok',tokenCalls=0,inferenceCalls=0,observed:any,form:URLSearchParams|undefined
 let base='',responseClosed=0,logs='';let releaseToken:()=>void=()=>{}
 const server=createServer(async(req:IncomingMessage,res:ServerResponse)=>{
  try{
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=Buffer.concat(chunks).toString()
   res.setHeader('Content-Type','application/json')
   if(req.url==='/discovery')return res.end(JSON.stringify({issuer:base,authorization_endpoint:base+'/authorize',token_endpoint:base+'/token',jwks_uri:base+'/jwks',revocation_endpoint:base+'/revoke'}))
   if(req.url==='/jwks')return res.end(JSON.stringify({keys:[jwk]}))
   if(req.url==='/token'){
    tokenCalls++;form=new URLSearchParams(body)
    const claims:any={nonce:mode==='nonce'?'wrong':auth!.searchParams.get('nonce'),email:'maker@example.test'}
    if(form.get('code')==='delayed-code')await new Promise<void>(resolve=>{releaseToken=resolve})
    const signing=mode==='signature'?await generateKeyPair('RS256'):keys
    const idToken=await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(mode==='issuer'?'https://wrong.example':base).setAudience(mode==='audience'?'wrong-client':'oaiapp_test').setSubject(mode==='subject'?'other-subject':'maker-subject').setIssuedAt().setExpirationTime(mode==='expired'?0:'1h').sign(signing.privateKey)
    return res.end(JSON.stringify({access_token:'private-access-token',refresh_token:'private-refresh-token',id_token:idToken,token_type:'Bearer',expires_in:mode==='renew'?1:3600,scope:mode==='scope'?'openid':'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'}))
   }
   if(req.url==='/models')return res.end(JSON.stringify({models:[{slug:'listed-model',display_name:'Listed model',visibility:'list'},{slug:'hidden-model',display_name:'Hidden model',visibility:'hidden'}]}))
   if(req.url==='/responses'){
    inferenceCalls++;res.once('close',()=>{responseClosed++});observed=JSON.parse(body);assert.equal(req.headers.authorization,'Bearer private-access-token')
    res.setHeader('Content-Type','text/event-stream')
    if(mode==='oversized')return res.end('data: '+ 'x'.repeat(1100000)+'\n\n')
    res.write('data: '+JSON.stringify({type:'response.output_text.delta',delta:JSON.stringify(mode==='invalid-plan'?{...answer,plan:{...plan,operations:[{type:'execute',code:'private-provider-text'}]}}:answer)})+'\n\n')
    if(mode==='stall')return
    if(mode!=='truncated')res.write('data: '+JSON.stringify({type:mode==='failed'?'response.failed':mode==='incomplete'?'response.incomplete':'response.completed',response:{status:mode==='failed'?'failed':'completed'}})+'\n\n')
    return res.end()
   }
   if(req.url==='/revoke')return res.end()
   res.writeHead(404);res.end()
  }catch{res.writeHead(500);res.end()}
 })
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`
 const endpoints:ChatGPTEndpoints={issuer:base,discovery:base+'/discovery',authorize:base+'/authorize',token:base+'/token',models:base+'/models',responses:base+'/responses'}
 const client=new ChatGPTClient({hostIdPath:join(directory,'host-id'),timeoutMs:3000,endpoints})
 const app=Fastify({trustProxy:true,logger:{stream:{write:(value:string)=>{logs+=value}}}});await app.register(cors,{origin:true});registerAssistantRoutes(app,{config:{...loadAssistantConfig({ENGINEERING_CHATGPT_ENABLED:'true'}),timeoutMs:3000},client});await app.ready()
 const status=await app.inject({method:'GET',url:'/api/assistant/status',headers});const csrf=status.json().csrfToken
 async function connect(accountId?:string){const result=await app.inject({method:'POST',url:'/api/assistant/chatgpt/connect',headers:{...headers,'x-printlab-csrf':csrf},payload:accountId?{accountId}:{}});assert.equal(result.statusCode,200,result.body);auth=new URL(result.json().url);return auth}
 async function callback(state?:string,extra:Record<string,string>={}){const url=new URL(auth!.searchParams.get('redirect_uri')!);url.search=new URLSearchParams({state:state??auth!.searchParams.get('state')!,code:'private-callback-code',client_id:'oaiapp_test',...extra}).toString();return fetch(url,{redirect:'manual'})}
 return {app,client,csrf,connect,callback,directory,endpoints,releaseToken:()=>releaseToken(),get responseClosed(){return responseClosed},get logs(){return logs},get auth(){return auth!},set mode(value:string){mode=value},get tokenCalls(){return tokenCalls},get inferenceCalls(){return inferenceCalls},get observed(){return observed},get form(){return form!},close:async()=>{await app.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true})}}
}

test('assistant is opt-in and exact local UI configuration is required',()=>{
 assert.equal(loadAssistantConfig({}).chatgptEnabled,false)
 assert.throws(()=>loadAssistantConfig({ENGINEERING_UI_ORIGIN:'https://remote.example'}))
 assert.throws(()=>loadAssistantConfig({ENGINEERING_UI_ORIGIN:'http://localhost:5173/path'}))
})
test('assistant rejects untrusted Origin, Host, raw socket and missing CSRF before provider calls',async()=>{
 const f=await fixture();try{
  for(const h of [{...headers,origin:'http://localhost:9999'},{...headers,host:'evil.example'},{...headers,origin:'null'},{host:headers.host}])assert.equal((await f.app.inject({method:'GET',url:'/api/assistant/status',headers:h})).statusCode,403)
  assert.equal((await f.app.inject({method:'GET',url:'/api/assistant/status',headers:{...headers,'x-forwarded-for':'127.0.0.1'},remoteAddress:'203.0.113.1'})).statusCode,403)
  assert.equal((await f.app.inject({method:'POST',url:'/api/assistant/chatgpt/connect',headers,payload:{}})).statusCode,403)
  assert.equal(f.tokenCalls,0)
 }finally{await f.close()}
})
test('OAuth uses one-time state, PKCE, actual issued client and validates private credentials',async()=>{
 const f=await fixture();try{
  const auth=await f.connect();assert.equal(auth.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(auth.searchParams.get('agent_name_hint'),'PrintLab');assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.equal(new URL(auth.searchParams.get('redirect_uri')!).hostname,'127.0.0.1')
  assert.equal((await f.callback('wrong-state')).status,400);assert.equal(f.tokenCalls,0)
  assert.equal((await f.callback()).status,200);assert.equal(f.form.get('client_id'),'oaiapp_test');assert.equal(f.form.get('redirect_uri'),auth.searchParams.get('redirect_uri'));assert.ok(f.form.get('code_verifier'));assert.equal(f.form.has('client_secret'),false)
  assert.equal((await f.callback()).status,400);assert.equal(f.tokenCalls,1)
  const status=await f.app.inject({method:'GET',url:'/api/assistant/status',headers});assert.equal(status.json().providers.chatgpt.connected,true);assert.deepEqual(status.json().providers.chatgpt.models,[{id:'listed-model',label:'Listed model'}]);assert.equal(status.json().providers.chatgpt.credentialStorage,'session-only');assert.ok(!/private-|id_token|refresh_token|access_token/.test(status.body))
 }finally{await f.close()}
})
test('OAuth rejects invalid nonce, signature, audience, issuer, expiry and missing inference scope',async()=>{
 for(const mode of ['nonce','signature','audience','issuer','expired','scope']){
  const f=await fixture();try{f.mode=mode;await f.connect();assert.equal((await f.callback()).status,400,mode);assert.equal((await f.app.inject({method:'GET',url:'/api/assistant/status',headers})).json().providers.chatgpt.connected,false);assert.equal((await f.callback()).status,400);assert.equal(f.tokenCalls,1)}finally{await f.close()}
 }
})
test('reauthorization keeps the active account intact until matching identity is validated',async()=>{
 const f=await fixture();try{
  await f.connect();await f.callback();const before=(await f.app.inject({method:'GET',url:'/api/assistant/status',headers})).json();const id=before.providers.chatgpt.account.id,hostId=f.auth.searchParams.get('ext_agent_host_id')
  const auth=await f.connect(id);assert.equal(auth.searchParams.get('client_id'),'oaiapp_test');assert.equal(auth.searchParams.has('agent_name_hint'),false);assert.equal(auth.searchParams.has('id_token_hint'),false);assert.equal(auth.searchParams.get('ext_agent_host_id'),hostId)
  f.mode='subject';assert.equal((await f.callback()).status,400);const after=(await f.app.inject({method:'GET',url:'/api/assistant/status',headers})).json();assert.equal(after.providers.chatgpt.account.id,id);assert.equal(after.providers.chatgpt.connected,true)
 }finally{await f.close()}
})
test('Responses accepts only account catalog models and returns validated plans after completion',async()=>{
 const f=await fixture();try{
  await f.connect();await f.callback()
  const chatHeaders={...headers,'x-printlab-csrf':f.csrf}
  assert.equal((await f.app.inject({method:'POST',url:'/api/assistant/chat',headers:chatHeaders,payload:{...payload,model:'hidden-model'}})).statusCode,400);assert.equal(f.inferenceCalls,0)
  const result=await f.app.inject({method:'POST',url:'/api/assistant/chat',headers:chatHeaders,payload});assert.equal(result.statusCode,200,result.body);assert.deepEqual(result.json(),answer);assert.equal(f.observed.store,false);assert.equal(f.observed.stream,true);assert.equal(f.observed.model,'listed-model');assert.ok(!result.body.includes('private-'))
 }finally{await f.close()}
})
test('Responses rejects failed, incomplete, interrupted, oversized, invalid and stalled output',async()=>{
 for(const mode of ['failed','incomplete','truncated','oversized','invalid-plan','stall']){
  const f=await fixture();try{await f.connect();await f.callback();f.mode=mode;const result=await f.app.inject({method:'POST',url:'/api/assistant/chat',headers:{...headers,'x-printlab-csrf':f.csrf},payload});assert.equal(result.statusCode,mode==='stall'?504:502,mode+result.body);assert.ok(!result.body.includes('private-provider'))}finally{await f.close()}
 }
})
test('disconnect revokes and clears tokens, retaining only account mapping for later sign-in',async()=>{
 const f=await fixture();try{
  await f.connect();await f.callback();const result=await f.app.inject({method:'POST',url:'/api/assistant/chatgpt/disconnect',headers:{...headers,'x-printlab-csrf':f.csrf},payload:{}});assert.equal(result.statusCode,200);assert.equal(result.json().remoteRevocationConfirmed,true)
  const status=(await f.app.inject({method:'GET',url:'/api/assistant/status',headers})).json();assert.equal(status.providers.chatgpt.connected,false);assert.equal(status.providers.chatgpt.accounts.length,1);assert.equal(status.providers.chatgpt.accounts[0].connected,false)
 }finally{await f.close()}
})


test('same-origin dev proxy GET works without Origin, while untrusted CORS cannot disclose CSRF',async()=>{
 const f=await fixture();try{
  const own=await f.app.inject({method:'GET',url:'/api/assistant/status',headers:{host:'localhost:5173','sec-fetch-site':'same-origin'}});assert.equal(own.statusCode,200)
  const other=await f.app.inject({method:'GET',url:'/api/assistant/status',headers:{...headers,origin:'http://localhost:9999'}});assert.equal(other.statusCode,403);assert.equal(other.headers['access-control-allow-origin'],undefined);assert.ok(!other.body.includes(f.csrf))
  const wrong=await f.app.inject({method:'POST',url:'/api/assistant/chatgpt/connect',headers:{...headers,'x-printlab-csrf':'wrong'},payload:{}});assert.equal(wrong.statusCode,403)
 }finally{await f.close()}
})
test('callback denies forged Host, denial, missing registration client and duplicate parameters without exchange',async()=>{
 const f=await fixture();try{
  await f.connect();const callbackUrl=new URL(f.auth.searchParams.get('redirect_uri')!);callbackUrl.search=new URLSearchParams({state:f.auth.searchParams.get('state')!,code:'private-callback-code',client_id:'oaiapp_test'}).toString()
  const forgedStatus=await new Promise<number|undefined>((resolve,reject)=>{httpRequest(callbackUrl,{headers:{Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode)}).on('error',reject).end()});assert.equal(forgedStatus,400);assert.equal(f.tokenCalls,0)
  assert.equal((await f.callback(undefined,{error:'access_denied'})).status,400);assert.equal(f.tokenCalls,0)
  await f.connect();assert.equal((await f.callback(undefined,{client_id:''})).status,400);assert.equal(f.tokenCalls,0)
  await f.connect();const duplicate=new URL(f.auth.searchParams.get('redirect_uri')!);duplicate.search=new URLSearchParams({state:f.auth.searchParams.get('state')!,code:'private-callback-code',client_id:'oaiapp_test'}).toString();duplicate.searchParams.append('state','wrong');assert.equal((await fetch(duplicate)).status,400);assert.equal(f.tokenCalls,0)
 }finally{await f.close()}
})
test('returning sign-in rejects replacement client IDs without replacing an active session',async()=>{
 const f=await fixture();try{
  await f.connect();await f.callback();const id=(await f.app.inject({method:'GET',url:'/api/assistant/status',headers})).json().providers.chatgpt.account.id
  await f.connect(id);assert.equal((await f.callback(undefined,{client_id:'oaiapp_changed'})).status,400);assert.equal(f.tokenCalls,1)
  const status=(await f.app.inject({method:'GET',url:'/api/assistant/status',headers})).json();assert.equal(status.providers.chatgpt.connected,true);assert.equal(status.providers.chatgpt.account.id,id)
 }finally{await f.close()}
})
test('host ID persists independently of session-only tokens and logs contain no credentials or callback code',async()=>{
 const f=await fixture();let other:ChatGPTClient|undefined
 try{
  await f.connect();await f.callback();const hostId=f.auth.searchParams.get('ext_agent_host_id')
  other=new ChatGPTClient({hostIdPath:join(f.directory,'host-id'),timeoutMs:3000,endpoints:f.endpoints});const auth=new URL((await other.connect()).url);assert.equal(auth.searchParams.get('ext_agent_host_id'),hostId);assert.equal(other.status().connected,false);assert.equal(other.status().accounts.length,1);assert.equal(other.status().accounts[0]?.connected,false)
  const registry=await readFile(join(f.directory,'chatgpt-accounts.json'),'utf8');assert.ok(!/private-|access_token|refresh_token|id_token/.test(registry));assert.equal(JSON.parse(registry).accounts[0].clientId,'oaiapp_test')
  const returning=new URL((await other.connect(other.status().accounts[0]!.id)).url);assert.equal(returning.searchParams.get('client_id'),'oaiapp_test')
  assert.ok(!/private-callback-code|private-access-token|private-refresh-token|code_verifier|id_token/.test(f.logs))
 }finally{await other?.close();await f.close()}
})
test('serializes renewable-session refresh and fails closed when inference scope disappears',async()=>{
 const f=await fixture();try{
  f.mode='renew';await f.connect();assert.equal((await f.callback()).status,200)
  const before=f.tokenCalls;await Promise.all([f.client.models(),f.client.models()]);assert.equal(f.tokenCalls,before+1);assert.equal(f.form.get('grant_type'),'refresh_token');assert.equal(f.form.get('refresh_token'),'private-refresh-token');assert.equal(f.form.has('scope'),false)
  f.mode='scope';const result=await f.app.inject({method:'POST',url:'/api/assistant/chat',headers:{...headers,'x-printlab-csrf':f.csrf},payload});assert.equal(result.statusCode,401);assert.equal(f.client.status().connected,false)
 }finally{await f.close()}
})
test('enforces conversation bounds, request size and six-attempt auth limit',async()=>{
 const f=await fixture();try{
  const protectedHeaders={...headers,'x-printlab-csrf':f.csrf}
  for(const body of [{...payload,history:Array.from({length:13},()=>({role:'user',content:'hello'}))},{...payload,selectedIds:['missing']},{...payload,url:'https://evil.example'},{...payload,prompt:'x'.repeat(8001)}]){
   assert.equal((await f.app.inject({method:'POST',url:'/api/assistant/chat',headers:protectedHeaders,payload:body})).statusCode,400)
  }
  assert.equal((await f.app.inject({method:'POST',url:'/api/assistant/chat',headers:protectedHeaders,payload:{...payload,prompt:'x'.repeat(300000)}})).statusCode,413)
  for(let count=0;count<6;count++)await f.connect()
  assert.equal((await f.app.inject({method:'POST',url:'/api/assistant/chatgpt/connect',headers:protectedHeaders,payload:{}})).statusCode,429)
 }finally{await f.close()}
})
test('disconnect aborts in-flight inference and prevents a late success',async()=>{
 const f=await fixture();try{
  await f.connect();await f.callback();f.mode='stall'
  const result=Promise.resolve(f.app.inject({method:'POST',url:'/api/assistant/chat',headers:{...headers,'x-printlab-csrf':f.csrf},payload}))
  while(!f.inferenceCalls)await new Promise(resolve=>setTimeout(resolve,5))
  assert.equal((await f.app.inject({method:'POST',url:'/api/assistant/chat',headers:{...headers,'x-printlab-csrf':f.csrf},payload})).statusCode,429)
  await f.app.inject({method:'POST',url:'/api/assistant/chatgpt/disconnect',headers:{...headers,'x-printlab-csrf':f.csrf},payload:{}})
  assert.equal((await result).statusCode,504);assert.equal(f.client.status().connected,false)
 }finally{await f.close()}
})
test('browser cancellation closes upstream inference',async()=>{
 const f=await fixture();try{
  await f.connect();await f.callback();f.mode='stall';const address=await f.app.listen({port:0,host:'127.0.0.1'})
  const request=httpRequest(address+'/api/assistant/chat',{method:'POST',headers:{...headers,'x-printlab-csrf':f.csrf,'content-type':'application/json'}},response=>response.resume());request.on('error',()=>{});request.end(JSON.stringify(payload))
  for(let attempt=0;attempt<2000&&!f.inferenceCalls;attempt++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.inferenceCalls,1);request.destroy()
  for(let attempt=0;attempt<200&&!f.responseClosed;attempt++)await new Promise(resolve=>setTimeout(resolve,5))
  assert.equal(f.responseClosed,1)
 }finally{await f.close()}
})
test('SSE supports CRLF chunk boundaries and completed output without deltas, but never DONE alone',async()=>{
 const output={type:'response.completed',response:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({message:'Tell me the intended dimensions.'})}]}]}}
 const data='event: response.completed\r\ndata: '+JSON.stringify(output)+'\r\n\r\n',bytes=new TextEncoder().encode(data)
 const body=new ReadableStream<Uint8Array>({start(controller){for(let index=0;index<bytes.length;index+=7)controller.enqueue(bytes.slice(index,index+7));controller.close()}})
 assert.deepEqual(await completedResponse(new Response(body,{headers:{'content-type':'text/event-stream'}})),{message:'Tell me the intended dimensions.'})
 await assert.rejects(completedResponse(new Response('data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}})),/disconnected/)
})


test('newer OAuth connection wins over overlapping callbacks and older errors cannot replace its status',async()=>{
 const f=await fixture();try{
  await f.connect();const first=f.callback(undefined,{code:'delayed-code'})
  for(let attempt=0;attempt<2000&&!f.tokenCalls;attempt++)await new Promise(resolve=>setTimeout(resolve,2));assert.equal(f.tokenCalls,1)
  await f.connect();assert.equal((await f.callback()).status,200);const before=f.client.status()
  f.releaseToken();assert.equal((await first).status,400);const after=f.client.status();assert.equal(after.account?.id,before.account?.id);assert.equal(after.error,undefined);assert.equal(after.accounts.length,1)
  const results=await Promise.allSettled([f.client.connect(),f.client.connect()]);assert.equal(results.filter(value=>value.status==='fulfilled').length,1);assert.equal(results.filter(value=>value.status==='rejected').length,1)
 }finally{f.releaseToken();await f.close()}
})

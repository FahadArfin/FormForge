import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import {createServer} from 'node:http'
import {registerEngineeringRoutes,loadEngineeringConfig,type EngineeringConfig} from './engineering.js'
const plan={version:1,title:'Measured plan',requirements:[],questions:['What is the mounting spacing?'],assumptions:[],expectedChecks:[],operations:[]}
const payload={prompt:'Make a rack shelf',document:{nodes:[],namedParameters:[]}}
const headers={host:'localhost:8787',origin:'http://localhost:5173'}
async function provider(handler:(req:import('node:http').IncomingMessage,res:import('node:http').ServerResponse)=>void){
 const server=createServer(handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as import('node:net').AddressInfo
 return {url:`http://127.0.0.1:${address.port}/v1/chat/completions`,close:()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve())})}
}
const config=(url:string):EngineeringConfig=>({enabled:true,url,model:'local-test',timeoutMs:1000,maxResponseBytes:262144})
async function appFor(settings:EngineeringConfig){const app=Fastify();registerEngineeringRoutes(app,{config:settings});await app.ready();return app}
test('configuration is disabled by default and only accepts explicit loopback endpoints',()=>{
 assert.equal(loadEngineeringConfig({}).enabled,false)
 assert.throws(()=>loadEngineeringConfig({ENGINEERING_LOCAL_ENABLED:'true',ENGINEERING_LOCAL_URL:'https://example.com/v1/chat/completions',ENGINEERING_LOCAL_MODEL:'test'}),/loopback/i)
 assert.throws(()=>loadEngineeringConfig({ENGINEERING_LOCAL_ENABLED:'true',ENGINEERING_LOCAL_URL:'http://localhost:9999/v1/chat/completions?secret=x',ENGINEERING_LOCAL_MODEL:'test'}))
 assert.equal(loadEngineeringConfig({ENGINEERING_LOCAL_ENABLED:'true',ENGINEERING_LOCAL_URL:'http://127.0.0.1:11434/v1/chat/completions',ENGINEERING_LOCAL_MODEL:'test'}).model,'test')
})
test('returns a validated plan via the configured endpoint and keeps the server key private',async()=>{
 let observed:any,auth:string|undefined
 const service=await provider(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);observed=JSON.parse(Buffer.concat(chunks).toString());auth=req.headers.authorization;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(plan)}}]}))})
 const app=await appFor({...config(service.url),apiKey:'test-server-secret'})
 try{const result=await app.inject({method:'POST',url:'/api/engineering/plan',headers,payload,remoteAddress:'127.0.0.1'});assert.equal(result.statusCode,200);assert.deepEqual(result.json(),{plan});assert.equal(auth,'Bearer test-server-secret');assert.equal(observed.model,'local-test');assert.equal(observed.stream,false);assert.equal(observed.messages[1].content,JSON.stringify(payload));assert.ok(!result.body.includes('test-server-secret'))}finally{await app.close();await service.close()}
})
test('rejects remote clients, nonlocal origins, rebinding hosts and request-chosen endpoints before calling provider',async()=>{
 let calls=0;const service=await provider((_,res)=>{calls++;res.end('{}')});const app=await appFor(config(service.url))
 try{
  for(const input of [{remoteAddress:'203.0.113.10',headers:{...headers,'x-forwarded-for':'127.0.0.1'}},{remoteAddress:'127.0.0.1',headers:{...headers,origin:'https://evil.example'}},{remoteAddress:'127.0.0.1',headers:{...headers,origin:'null'}},{remoteAddress:'127.0.0.1',headers:{...headers,host:'evil.example'}},{remoteAddress:'127.0.0.1',headers:{...headers,'sec-fetch-site':'cross-site'}}]){
   const result=await app.inject({method:'POST',url:'/api/engineering/plan',payload,...input});assert.equal(result.statusCode,403)
  }
  const result=await app.inject({method:'POST',url:'/api/engineering/plan',headers,payload:{...payload,url:'http://other-host/'}});assert.equal(result.statusCode,400);assert.equal(calls,0)
 }finally{await app.close();await service.close()}
})
test('rejects arbitrary model operations and oversized provider streams',async()=>{
 for(const [content,maxResponseBytes] of [[JSON.stringify({choices:[{message:{content:JSON.stringify({...plan,operations:[{type:'execute',code:'alert(1)'}]})}}]}),262144],['x'.repeat(4096),1024]] as const){
  const service=await provider((_,res)=>{res.write(content.slice(0,100));res.end(content.slice(100))});const app=await appFor({...config(service.url),maxResponseBytes})
  try{const result=await app.inject({method:'POST',url:'/api/engineering/plan',headers,payload});assert.equal(result.statusCode,502);assert.ok(!result.body.includes('alert(1)'))}finally{await app.close();await service.close()}
 }
})
test('times out stalled providers without exposing provider details',async()=>{
 const service=await provider(()=>{}),app=await appFor({...config(service.url),timeoutMs:20})
 try{const result=await app.inject({method:'POST',url:'/api/engineering/plan',headers,payload});assert.equal(result.statusCode,504);assert.ok(!result.body.includes(service.url))}finally{await app.close();await service.close()}
})
test('caps client bodies and leaves optional local mode unavailable unless configured',async()=>{
 const app=await appFor({...config('http://127.0.0.1:11434/v1/chat/completions'),enabled:false})
 try{assert.equal((await app.inject({method:'POST',url:'/api/engineering/plan',headers,payload})).statusCode,503);assert.equal((await app.inject({method:'POST',url:'/api/engineering/plan',headers,payload:{...payload,prompt:'x'.repeat(300000)}})).statusCode,413)}finally{await app.close()}
})
test('does not follow provider redirects and times out a stalled response body',async()=>{
 let calls=0
 for(const mode of ['redirect','body-stall']){
  const service=await provider((_,res)=>{calls++;if(mode==='redirect'){res.writeHead(302,{Location:'/unexpected'});res.end()}else{res.writeHead(200,{'Content-Type':'application/json'});res.write('{')}}),app=await appFor({...config(service.url),timeoutMs:25})
  try{const response=await app.inject({method:'POST',url:'/api/engineering/plan',headers,payload});assert.equal(response.statusCode,mode==='redirect'?502:504)}finally{await app.close();await service.close()}
 }
 assert.equal(calls,2)
})
test('allows only one active local-model request',async()=>{
 let complete:()=>void=()=>{},entered:()=>void=()=>{}
 const started=new Promise<void>(resolve=>{entered=resolve})
 const service=await provider((_,res)=>{complete=()=>res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(plan)}}]}));entered()}),app=await appFor(config(service.url))
 try{
  const first=app.inject({method:'POST',url:'/api/engineering/plan',headers,payload});const firstPromise=Promise.resolve(first)
  await started
  assert.equal((await app.inject({method:'POST',url:'/api/engineering/plan',headers,payload})).statusCode,429)
  complete();assert.equal((await firstPromise).statusCode,200)
 }finally{await app.close();await service.close()}
})

import {afterEach,beforeEach,expect,it} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {createDocument,createNode} from '@formforge/model'
import {cloudApi,type Env,type Statement} from '../../../cloud/src/api'

let sqlite:DatabaseSync,env:Env,objects:Map<string,string>,failDelete:boolean
let afterProjectRead:(()=>void)|undefined
beforeEach(()=>{
 sqlite=new DatabaseSync(':memory:')
 const dir=fileURLToPath(new URL('../../../../drizzle/',import.meta.url))
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(dir+name,'utf8'))
 class Query implements Statement {
  values:unknown[]=[]
  constructor(public sql:string){}
  bind(...values:unknown[]){this.values=values;return this}
  async first<T>(){const result=sqlite.prepare(this.sql).get(...this.values as (string|number|null)[]) as T|undefined;if(this.sql.startsWith('SELECT p.* FROM cloud_projects p WHERE p.id=')){const hook=afterProjectRead;afterProjectRead=undefined;hook?.()}return result??null}
  async all<T>(){return {results:sqlite.prepare(this.sql).all(...this.values as (string|number|null)[]) as T[]}}
  async run(){return {meta:{changes:Number(sqlite.prepare(this.sql).run(...this.values as (string|number|null)[]).changes)}}}
 }
 objects=new Map();failDelete=false;afterProjectRead=undefined
 env={DB:{prepare:sql=>new Query(sql),async batch(queries){sqlite.exec('BEGIN');try{const results=queries.map(statement=>{const query=statement as Query;return {meta:{changes:Number(sqlite.prepare(query.sql).run(...query.values as (string|number|null)[]).changes)}}});sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}},BUCKET:{async put(key,data){objects.set(key,data)},async get(key){const value=objects.get(key);return value===undefined?null:{text:async()=>value}},async delete(keys){if(failDelete)throw new Error('storage unavailable');for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key)}}}
})
afterEach(()=>sqlite.close())
async function call(path:string,method='GET',body?:unknown,user:string|null='owner',origin='https://formforge.test'){
 const headers:Record<string,string>={'Origin':origin,'Content-Type':'application/json'}
 if(user){headers['oai-authenticated-user-id']=user;headers['oai-authenticated-user-email']=`${user}@example.test`}
 return cloudApi(new Request(`https://formforge.test/api/cloud${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env)
}

function payload(extra:Record<string,unknown>={}){const document=createDocument();document.nodes=[createNode('box')];return {title:'Useful bracket',description:'Editable bracket',category:'Tools',tags:['bracket'],license:'CC0',creator:'Maker',document,confirmPublic:true,...extra}}
async function publish(extra:Record<string,unknown>={},user='owner'){const r=await call('/community','POST',payload(extra),user);expect(r.status).toBe(201);return (await r.json()).model}
async function comment(id:string,extra:Record<string,unknown>={},user='reviewer'){const r=await call(`/community/${id}/comments`,'POST',{body:'Useful design',author:'Printer',...extra},user);expect(r.status).toBe(201);return (await r.json()).comment}
it('publishes only explicit copies and never exposes private identity or documents in listings',async()=>{
 const p=await publish();const list=await call('/community','GET',undefined,null);expect(list.status).toBe(200);expect(list.headers.get('Cache-Control')).toContain('no-store');const data=await list.json();expect(data.models).toHaveLength(1);expect(data.models[0]).toMatchObject({id:p.id,owned:false,creator:'Maker',commentCount:0});expect(data.models[0].document).toBeUndefined();expect(JSON.stringify(data)).not.toContain('owner');expect(JSON.stringify(data)).not.toContain('@example.test');const detail=await (await call(`/community/${p.id}`,'GET',undefined,null)).json();expect(detail.document.nodes).toHaveLength(1)
})
it('requires identity, same origin, explicit permission, valid metadata and geometry',async()=>{
 expect((await call('/community','POST',payload(),null)).status).toBe(401);expect((await call('/community','POST',payload(),'owner','https://evil.test')).status).toBe(403)
 for(const invalid of [{confirmPublic:false},{document:{}},{document:{...createDocument(),nodes:[]}},{license:'copyright'},{creator:'x'},{tags:['x'.repeat(41)]},{image:'https://evil.test/pixel'}])expect((await call('/community','POST',payload(invalid))).status).toBe(400)
})
it('rejects unknown designs and unsupported endpoints or methods',async()=>{
 expect((await call('/community/nonsense','GET',undefined,null)).status).toBe(404);expect((await call('/community/desk-dock/wrong','GET',undefined,null)).status).toBe(404);expect((await call('/community','PATCH',{})).status).toBe(405);expect((await call('/community/desk-dock/comments','PUT',{})).status).toBe(405)
})
it('allows author or design owner deletion while preserving threaded replies and real counts',async()=>{
 const p=await publish();const a=await comment(p.id);const b=await comment(p.id,{parent:a.id},'third');expect((await call(`/community/${p.id}/comments/${a.id}`,'DELETE',undefined,'stranger')).status).toBe(403);expect((await call(`/community/${p.id}/comments/${a.id}`,'DELETE')).status).toBe(200);const rows=(await (await call(`/community/${p.id}/comments`,'GET',undefined,null)).json()).comments;expect(rows).toHaveLength(2);expect(rows.find((c:{id:string})=>c.id===a.id)).toMatchObject({body:'',author:'',deleted:true});expect(rows.find((c:{id:string})=>c.id===b.id).parent).toBe(a.id);expect((await (await call(`/community/${p.id}`)).json()).model.commentCount).toBe(1);expect((await call(`/community/${p.id}/comments`,'POST',{body:'Late',author:'Maker',parent:a.id})).status).toBe(400)
})
it('rejects nested and cross-design replies and enforces bundled ownership',async()=>{
 const a=await comment('desk-dock');const b=await comment('desk-dock',{parent:a.id});expect((await call('/community/sea-turtle/comments','POST',{body:'Wrong',author:'Maker',parent:a.id})).status).toBe(400);expect((await call('/community/desk-dock/comments','POST',{body:'Nested',author:'Maker',parent:b.id})).status).toBe(400);expect((await call(`/community/desk-dock/comments/${a.id}`,'DELETE')).status).toBe(403);expect((await call(`/community/desk-dock/comments/${a.id}`,'DELETE',undefined,'reviewer')).status).toBe(200)
})
it('deletes a publication and its comments atomically only for the owner',async()=>{
 const p=await publish();await comment(p.id);expect((await call(`/community/${p.id}`,'DELETE',undefined,'reviewer')).status).toBe(403);expect((await call(`/community/${p.id}`,'DELETE')).status).toBe(200);expect((await call(`/community/${p.id}`,'GET',undefined,null)).status).toBe(404);expect((await call(`/community/${p.id}/comments`,'GET',undefined,null)).status).toBe(404)
})
it('requires valid remix sources and preserves share-alike licensing',async()=>{
 const source=await publish({license:'CC BY-SA 4.0'});expect((await call('/community','POST',payload({remixOf:source.id}))).status).toBe(400);await publish({remixOf:source.id,license:'CC BY-SA 4.0'});expect((await call('/community','POST',payload({remixOf:'arbitrary'}))).status).toBe(400)
})
it('bounds comment rate and request streams with generic storage failures',async()=>{
 for(let i=0;i<10;i++)await comment('desk-dock');expect((await call('/community/desk-dock/comments','POST',{body:'Limit',author:'Maker'},'reviewer')).status).toBe(429);expect((await call('/community','POST',payload({description:'a'.repeat(1_100_000)}))).status).toBe(413);env.DB.prepare=()=>{throw new Error('private credential')};const response=await call('/community','GET',undefined,null);expect(response.status).toBe(503);expect(await response.text()).not.toContain('credential')
})

it('removes private test evidence and engineering history but keeps editable shelf parameters',async()=>{
 const document=payload().document;document.printTests=[{id:'p',protocol:'fit',date:'2026-10-12',printer:'Private printer',material:'PLA',nozzle:.4,layerHeight:.2,expected:10,measured:10,tolerance:.1,geometryKey:'key',notes:'Private test notes',photoDataUrl:'data:image/png;base64,aGVsbG8='}];document.engineering={version:1,history:[{title:'Private instruction',appliedAt:'today',operations:[],assumptions:['secret']}]};const p=await publish({document});const detail=await (await call(`/community/${p.id}`,'GET',undefined,null)).json();expect(detail.document.printTests).toBeUndefined();expect(detail.document.engineering.history).toEqual([]);expect(JSON.stringify(detail)).not.toContain('Private');expect(detail.document.nodes).toHaveLength(1)
})
it('enforces design count and bytes atomically across concurrent publications',async()=>{
 for(let i=0;i<19;i++){await publish();sqlite.exec('DELETE FROM community_writes')}
 const results=await Promise.all([call('/community','POST',payload()),call('/community','POST',payload())]);expect(results.map(r=>r.status).sort()).toEqual([201,429]);expect((await (await call('/community')).json()).models).toHaveLength(20)
 sqlite.exec('DELETE FROM community_models; DELETE FROM community_writes');await publish();sqlite.exec('UPDATE community_models SET bytes=9999999; DELETE FROM community_writes');expect((await call('/community','POST',payload())).status).toBe(429)
})
it('paginates public models without duplicates when created timestamps tie',async()=>{
 for(let i=0;i<43;i++)await publish({},`publisher-${i}`)
 sqlite.exec('UPDATE community_models SET created=1');const first=await (await call('/community','GET',undefined,null)).json();expect(first.models).toHaveLength(40);expect(first.nextCursor).toBeTruthy();const next=await (await call(`/community?cursor=${first.nextCursor}`,'GET',undefined,null)).json();expect(next.models).toHaveLength(3);expect(next.nextCursor).toBeNull();expect(new Set([...first.models,...next.models].map(m=>m.id)).size).toBe(43);expect((await call('/community?cursor=malformed')).status).toBe(400)
})
it('paginates flat comments with parent references and excludes identity in all views',async()=>{
 const first=await comment('desk-dock');for(let i=0;i<52;i++)await comment('desk-dock',i===51?{parent:first.id}:{},`author-${i}`)
 sqlite.exec('UPDATE community_comments SET created=9999999999999 WHERE parent IS NOT NULL');const page=await (await call('/community/desk-dock/comments','GET',undefined,null)).json();expect(page.comments).toHaveLength(50);expect(page.nextCursor).toBeTruthy();const next=await (await call(`/community/desk-dock/comments?cursor=${page.nextCursor}`,'GET',undefined,null)).json();expect(next.comments).toHaveLength(3);expect(next.comments.some((c:{parent:string})=>c.parent===first.id)).toBe(true);expect(next.nextCursor).toBeNull();expect(JSON.stringify([...page.comments,...next.comments])).not.toContain('@example.test');expect(JSON.stringify(page)).not.toContain('reviewer');expect((await call(`/community/sea-turtle/comments?cursor=${page.nextCursor}`)).status).toBe(400)
})
it('enforces reply, per-design and per-account comment quotas including tombstones',async()=>{
 const thread=await comment('desk-dock');for(let i=0;i<20;i++)await comment('desk-dock',{parent:thread.id},`reply-${i}`);expect((await call('/community/desk-dock/comments','POST',{body:'Extra',author:'Maker',parent:thread.id})).status).toBe(429)
 const insert=sqlite.prepare('INSERT INTO community_comments(id,model,owner,author,body,parent,created,deleted) VALUES (?,?,?,?,?,NULL,0,1)');for(let i=0;i<1000;i++)insert.run(`seed-${i}`,i<500?'sea-turtle':'hex-wall','full-account','','');expect((await call('/community/sea-turtle/comments','POST',{body:'Extra',author:'Maker'})).status).toBe(429);expect((await call('/community/spiral-planter/comments','POST',{body:'Extra',author:'Maker'},'full-account')).status).toBe(429)
})
it('rejects malformed geometry and oversized or disguised thumbnails',async()=>{
 const document=payload().document;document.nodes[0]!.transform.position.x=Infinity;expect((await call('/community','POST',payload({document}))).status).toBe(400)
 for(const image of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,aGVsbG8=','data:image/png;base64,'+'a'.repeat(250000)])expect((await call('/community','POST',payload({image}))).status).toBe(400)
 await publish({image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='})
})
it('uses and validates document attribution rather than trusting caller remix claims',async()=>{
 const source=await publish({license:'CC BY-SA 4.0'});const document=payload().document;document.communitySource={modelId:source.id,title:source.title,creator:source.creator,license:source.license};expect((await call('/community','POST',payload({document}))).status).toBe(400);expect((await call('/community','POST',payload({document,remixOf:'desk-dock',license:source.license}))).status).toBe(400);const remix=await publish({document,license:source.license});expect(remix.remixOf).toBe(source.id);document.communitySource.creator='Wrong';expect((await call('/community','POST',payload({document,license:source.license}))).status).toBe(400)
})
it('rechecks publication existence and parent liveness inside comment writes',async()=>{
 const p=await publish(),prepare=env.DB.prepare
 env.DB.prepare=sql=>{const statement=prepare(sql);const first=statement.first.bind(statement);statement.first=async<T>()=>{const result=await first<T>();if(sql.includes('FROM community_models m WHERE m.id='))sqlite.prepare('DELETE FROM community_models WHERE id=?').run(p.id);return result};return statement}
 expect((await call(`/community/${p.id}/comments`,'POST',{body:'Race',author:'Maker'})).status).toBe(429);expect(sqlite.prepare('SELECT COUNT(*) AS n FROM community_comments').get()?.n).toBe(0)
 env.DB.prepare=prepare;const parent=await comment('desk-dock')
 env.DB.prepare=sql=>{const statement=prepare(sql);const first=statement.first.bind(statement);statement.first=async<T>()=>{const result=await first<T>();if(sql.startsWith('SELECT id FROM community_comments'))sqlite.prepare('UPDATE community_comments SET deleted=1 WHERE id=?').run(parent.id);return result};return statement}
 expect((await call('/community/desk-dock/comments','POST',{body:'Race',author:'Maker',parent:parent.id})).status).toBe(429);expect(sqlite.prepare('SELECT COUNT(*) AS n FROM community_comments').get()?.n).toBe(1)
})
it('retains server-authored source attribution in downloadable remix documents',async()=>{
 const source=await publish({license:'CC BY 4.0'});const remix=await publish({remixOf:source.id,license:'CC BY 4.0'});await call(`/community/${source.id}`,'DELETE');const detail=await (await call(`/community/${remix.id}`)).json();expect(detail.document.communitySource).toEqual({modelId:source.id,title:source.title,creator:source.creator,license:source.license})
})
it('allows editable CC0 starters as remix sources but rejects unlicensed concept illustrations',async()=>{
 const remix=await publish({remixOf:'starter-bracket'});const detail=await (await call(`/community/${remix.id}`)).json();expect(detail.document.communitySource).toEqual({modelId:'starter-bracket',title:'Mounting bracket',creator:'PrintLab',license:'CC0'});expect((await call('/community','POST',payload({remixOf:'desk-dock'}))).status).toBe(400)
})
it('allows explicitly attributed local remixes without inventing a verified public parent',async()=>{
 const document=payload().document;document.communitySource={modelId:'user-local-copy',title:'My local bracket',creator:'You',license:'CC BY-SA 4.0'}
 expect((await call('/community','POST',payload({document}))).status).toBe(400)
 const p=await publish({document,remixOf:'user-local-copy',license:'CC BY-SA 4.0'});expect(p.remixOf).toBeUndefined();const detail=await (await call(`/community/${p.id}`)).json();expect(detail.document.communitySource).toEqual(document.communitySource)
 expect((await call('/community','POST',payload({remixOf:'user-bare-copy'}))).status).toBe(400)
 document.communitySource.license='Standard Digital File License';const unsupported=await call('/community','POST',payload({document}));expect(unsupported.status).toBe(400);expect((await unsupported.json()).error).toContain('source license')
})

it('rejects incomplete mesh triples, missing mesh payloads and out-of-range indices before storing a publication',async()=>{
 const positions=[0,0,0,1,0,0,0,1,0]
 for(const mesh of [undefined,{positions,indices:[0,1,99]},{positions:[0,0],indices:[0,1,2]},{positions,indices:[0,1]},{positions:[],indices:[]},{positions,indices:[0,1,2.5]},{positions:[0,0,NaN,1,0,0,0,1,0],indices:[0,1,2]},{positions,indices:[0,1,2],mask:[0,1]}]){
  const document=payload().document;document.nodes=[{...createNode('mesh'),mesh}];expect((await call('/community','POST',payload({document}))).status).toBe(400)
 }
 expect((await (await call('/community')).json()).models).toHaveLength(0)
 const document=payload().document;document.nodes=[{...createNode('mesh'),mesh:{positions,indices:[0,1,2],mask:[0,0,1]}}];await publish({document})
})
it('accepts only selectable categories and client-compatible Unicode tags',async()=>{
 for(const extra of [{category:'Workshop'},{category:'Trending'},{category:'New & Notable'},{tags:Array.from({length:11},(_,i)=>`tag-${i}`)},{tags:['too long']},{tags:['x'.repeat(33)]},{tags:['emoji-😀']},{tags:['bad/slash']}])expect((await call('/community','POST',payload(extra))).status).toBe(400)
 const p=await publish({category:'Replacement Parts',tags:['工具','MÜNCHEN','part-2','工具']});expect(p.tags).toEqual(['工具','münchen','part-2'])
})
it('returns all of the authenticated owners publications independently of the public first page',async()=>{
 expect((await call('/community?mine=1','GET',undefined,null)).status).toBe(401)
 const own=[];for(let i=0;i<20;i++){own.push(await publish());sqlite.exec('DELETE FROM community_writes')}
 for(let i=0;i<41;i++)await publish({},`other-owner-${i}`)
 const response=await call('/community?mine=1'),data=await response.json();expect(response.headers.get('Cache-Control')).toContain('no-store');expect(data.models).toHaveLength(20);expect(data.models.every((m:{owned:boolean})=>m.owned)).toBe(true);expect(new Set(data.models.map((m:{id:string})=>m.id))).toEqual(new Set(own.map(m=>m.id)));expect(data.nextCursor).toBeNull()
 const other=await (await call('/community?mine=1','GET',undefined,'other-owner-0')).json();expect(other.models).toHaveLength(1);expect((await call(`/community?mine=1&cursor=${other.models[0].id}`)).status).toBe(400)
})
it('returns live bundled comment counts including zeroes without leaking private or arbitrary model records',async()=>{
 await comment('desk-dock');const deleted=await comment('desk-dock');await call(`/community/desk-dock/comments/${deleted.id}`,'DELETE',undefined,'reviewer');await comment('starter-bracket');const shared=await publish();await comment(shared.id)
 sqlite.prepare('INSERT INTO community_comments(id,model,owner,author,body,parent,created,deleted) VALUES (?,?,?,?,?,NULL,0,0)').run('private-orphan','unknown-project','hidden-account','Secret','Hidden')
 const data=await (await call('/community','GET',undefined,null)).json();expect(data.bundledCounts['desk-dock']).toBe(1);expect(data.bundledCounts['starter-bracket']).toBe(1);expect(data.bundledCounts['sea-turtle']).toBe(0);expect(Object.keys(data.bundledCounts)).toHaveLength(12);expect(data.bundledCounts[shared.id]).toBeUndefined();expect(data.bundledCounts['unknown-project']).toBeUndefined();expect(data.models[0].commentCount).toBe(1);expect(JSON.stringify(data)).not.toContain('hidden-account')
})

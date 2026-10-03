import {afterEach,beforeEach,expect,it} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {createDocument} from '@formforge/model'
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
async function project(){const r=await call('/projects','POST',{document:createDocument()});expect(r.status).toBe(201);return (await r.json()).project as {id:string;revision:number}}
async function join(id:string){const shared=await (await call(`/projects/${id}/share`,'POST',{})).json();const token=shared.url.split('review=')[1];expect((await call('/join','POST',{token},'reviewer')).status).toBe(200);return token}

it('requires a signed-in account and same-origin writes; ignores claimed ownership',async()=>{
 expect((await call('/projects','POST',{owner:'owner',document:createDocument()},null)).status).toBe(401)
 expect((await call('/projects','POST',{document:createDocument()},'owner','https://evil.test')).status).toBe(403)
 const p=await project();expect((await call(`/projects/${p.id}/document`,'GET',undefined,'stranger')).status).toBe(404)
 expect((await call('/session','GET',undefined,null)).headers.get('Cache-Control')).toContain('no-store')
})
it('retains immutable snapshots and rejects stale revisions without orphaning a new object',async()=>{
 const p=await project(),doc=createDocument();doc.name='Updated bracket'
 expect((await call(`/projects/${p.id}/document`,'PUT',{expectedRevision:1,document:doc})).status).toBe(200)
 expect((await call(`/projects/${p.id}/document`,'PUT',{expectedRevision:1,document:doc})).status).toBe(409)
 const original=await (await call(`/projects/${p.id}/document?revision=1`)).json();expect(original.snapshotRevision).toBe(1);expect(original.document.name).not.toBe(doc.name)
 expect(objects.size).toBe(2)
})
it('lets reviewers comment and reply but not overwrite; revocation removes access',async()=>{
 const p=await project();await join(p.id)
 expect((await call(`/projects/${p.id}/document`,'GET',undefined,'reviewer')).status).toBe(200)
 expect((await call(`/projects/${p.id}/document`,'PUT',{expectedRevision:1,document:createDocument()},'reviewer')).status).toBe(403)
 expect((await call(`/projects/${p.id}/comments`,'POST',{revision:1,body:'Increase this clearance.'},'reviewer')).status).toBe(201)
 const comments=await (await call(`/projects/${p.id}/comments`)).json();const id=comments.comments[0].id
 expect((await call(`/projects/${p.id}/comments`,'POST',{revision:1,body:'Will print a coupon.',parent:id})).status).toBe(201)
 expect((await call(`/projects/${p.id}/comments`,'PATCH',{id,resolved:true})).status).toBe(200)
 expect((await call(`/projects/${p.id}/share`,'DELETE')).status).toBe(200)
 expect((await call(`/projects/${p.id}/comments`,'GET',undefined,'reviewer')).status).toBe(404)
 expect((await call(`/projects/${p.id}/comments`,'POST',{revision:1,body:'Late'},'reviewer')).status).toBe(404)
})
it('rechecks revocation inside a resolve write after the initial access read',async()=>{
 const p=await project();await join(p.id);await call(`/projects/${p.id}/comments`,'POST',{revision:1,body:'Check wall'},'reviewer')
 const id=(await (await call(`/projects/${p.id}/comments`)).json()).comments[0].id
 afterProjectRead=()=>{sqlite.prepare('UPDATE cloud_projects SET share_hash=NULL WHERE id=?').run(p.id)}
 expect((await call(`/projects/${p.id}/comments`,'PATCH',{id,resolved:true},'reviewer')).status).toBe(403)
 expect(sqlite.prepare('SELECT resolved FROM cloud_comments WHERE id=?').get(id)?.resolved).toBe(0)
})
it('expires and rotates review grants without exposing token hashes',async()=>{
 const p=await project(),token=await join(p.id)
 const list=await (await call('/projects','GET',undefined,'reviewer')).json();expect(list.projects).toHaveLength(1);expect(JSON.stringify(list)).not.toContain('share_hash')
 await call(`/projects/${p.id}/share`,'POST',{})
 expect((await call('/join','POST',{token},'reviewer')).status).toBe(404)
 expect((await (await call('/projects','GET',undefined,'reviewer')).json()).projects).toHaveLength(0)
 const second=await join(p.id);sqlite.prepare('UPDATE cloud_projects SET share_expires=0 WHERE id=?').run(p.id)
 expect((await call('/join','POST',{token:second},'reviewer')).status).toBe(404)
})
it('keeps a retryable deletion record when blob deletion fails',async()=>{
 const p=await project();await call(`/projects/${p.id}/document`,'PUT',{expectedRevision:1,document:createDocument()});failDelete=true
 expect((await call(`/projects/${p.id}`,'DELETE')).status).toBe(503)
 expect((await call(`/projects/${p.id}/document`)).status).toBe(404)
 const pending=await (await call('/projects')).json();expect(pending.pendingDeletions[0].id).toBe(p.id);expect(objects.size).toBe(2)
 failDelete=false;expect((await call(`/projects/${p.id}`,'DELETE')).status).toBe(200);expect(objects.size).toBe(0)
 expect(sqlite.prepare('SELECT COUNT(*) AS n FROM cloud_deletions').get()?.n).toBe(0)
})
it('bounds comments, documents, and privacy statistics',async()=>{
 const p=await project()
 expect((await call(`/projects/${p.id}/comments`,'POST',{revision:1,body:'a'.repeat(2001)})).status).toBe(400)
 expect((await call('/projects','POST',{document:{}})).status).toBe(400)
 expect((await call('/preferences','PUT',{completed:['first-part'],analytics:false,counts:{'first-part':19}})).status).toBe(200)
 const prefs=await (await call('/preferences')).json();expect(prefs.counts).toEqual({})
 expect((await call('/preferences','PUT',{completed:['unknown'],analytics:true,counts:{}})).status).toBe(400)
})

it('allows only one simultaneous update of the same cloud revision',async()=>{
 const p=await project(),a=createDocument(),b=createDocument();a.name='A';b.name='B'
 const results=await Promise.all([call(`/projects/${p.id}/document`,'PUT',{expectedRevision:1,document:a}),call(`/projects/${p.id}/document`,'PUT',{expectedRevision:1,document:b})])
 expect(results.map(r=>r.status).sort()).toEqual([200,409]);expect(objects.size).toBe(2)
 expect((await (await call(`/projects/${p.id}/versions`)).json()).versions).toHaveLength(2)
})

it('tracks and retries cleanup of a rejected upload when blob deletion fails',async()=>{
 const p=await project()
 for(let revision=1;revision<20;revision++)expect((await call(`/projects/${p.id}/document`,'PUT',{expectedRevision:revision,document:createDocument()})).status).toBe(200)
 failDelete=true
 expect((await call(`/projects/${p.id}/document`,'PUT',{expectedRevision:20,document:createDocument()})).status).toBe(503)
 expect(objects.size).toBe(21)
 const pending=(await (await call('/projects')).json()).pendingDeletions
 expect(pending).toHaveLength(1)
 failDelete=false;expect((await call(`/projects/${pending[0].id}`,'DELETE')).status).toBe(200)
 expect(objects.size).toBe(20);expect((await call(`/projects/${p.id}/document`)).status).toBe(200)
})

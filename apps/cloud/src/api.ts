import { parseModelDocument } from '../../../packages/model/src/index'

export interface Statement {
  bind(...values:unknown[]):Statement
  first<T=Record<string,unknown>>():Promise<T|null>
  all<T=Record<string,unknown>>():Promise<{results:T[]}>
  run():Promise<{meta:{changes:number}}>
}
export interface Env {
  DB:{prepare(sql:string):Statement;batch(statements:Statement[]):Promise<{meta:{changes:number}}[]>}
  BUCKET:{put(key:string,value:string):Promise<unknown>;get(key:string):Promise<{text():Promise<string>}|null>;delete(key:string|string[]):Promise<unknown>}
}
type Project={id:string;owner:string;name:string;revision:number;blob:string;updated:number;share_hash:string|null;share_expires:number|null}
class HttpError extends Error {constructor(public status:number,message:string){super(message)}}
function reject(status:number,message:string):never{throw new HttpError(status,message)}
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'}})
const MAX_DOCUMENT=4_000_000,MAX_ACCOUNT=50_000_000
const uid=()=>crypto.randomUUID()
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')
async function body(request:Request,limit=MAX_DOCUMENT+2048):Promise<Record<string,unknown>>{
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))reject(415,'Send JSON data.')
  if(Number(request.headers.get('Content-Length')??0)>limit)reject(413,'This request is too large.')
  const reader=request.body?.getReader();if(!reader)reject(400,'Missing request data.')
  const chunks:Uint8Array[]=[];let size=0
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();reject(413,'This request is too large.')}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  try{const value:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value as Record<string,unknown>}catch{reject(400,'Invalid JSON data.')}
}
function documentPayload(value:unknown){
  try{const doc=parseModelDocument(value);if(doc.nodes.length>2000||doc.namedParameters.length>500||doc.name.length>120)throw 0;const json=JSON.stringify(doc);const bytes=new TextEncoder().encode(json).length;if(bytes>MAX_DOCUMENT)reject(413,'Cloud projects can contain up to 4 MB. Export a local backup for larger models.');return {doc,json,bytes}}
  catch(error){if(error instanceof HttpError)throw error;reject(400,'This is not a supported editable FormForge project.')}
}
const publicProject=(p:Project,user:string)=>({id:p.id,name:p.name,revision:p.revision,updated:p.updated,role:p.owner===user?'owner':'reviewer',sharing:!!p.share_hash&&Number(p.share_expires)>Date.now()})
const requireRevision=(value:unknown)=>{if(!Number.isSafeInteger(value)||Number(value)<1)reject(400,'A valid cloud revision is required.');return Number(value)}

export async function cloudApi(request:Request,env:Env):Promise<Response>{
  try{
    const url=new URL(request.url),path=url.pathname.replace(/\/$/,''),method=request.method
    if(!env.DB||!env.BUCKET)return reply({error:'Cloud storage is unavailable. Your local project is safe.'},503)
    // Identity comes only from the Sites dispatcher, never request JSON or a query parameter.
    const user=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email')
    if(path==='/api/cloud/session'&&method==='GET')return reply({user:user&&email?{email}:null})
    if(!user||!email)reject(401,'Sign in with ChatGPT to use cloud projects and reviews.')
    if(!['GET','HEAD'].includes(method)&&request.headers.get('Origin')!==url.origin)reject(403,'This request must come from FormForge.')
    const db=env.DB,q=(sql:string,...values:unknown[])=>db.prepare(sql).bind(...values)
    const reserveUpload=async(blob:string,name:string,bytes:number)=>{
      const reservation=`upload-${uid()}`
      const result=await q(`INSERT INTO cloud_deletions(project,owner,name,blobs,bytes,ready) SELECT ?,?,?,?,?,0 WHERE (SELECT COUNT(*) FROM cloud_deletions WHERE owner=?)<50 AND (SELECT COALESCE(SUM(v.bytes),0) FROM cloud_versions v JOIN cloud_projects p ON p.id=v.project WHERE p.owner=?)+(SELECT COALESCE(SUM(bytes),0) FROM cloud_deletions WHERE owner=?)+?<=?`,reservation,user,`Unfinished snapshot: ${name}`,JSON.stringify([blob]),bytes,user,user,user,bytes,MAX_ACCOUNT).run()
      if(!result.meta.changes)reject(429,'Cloud storage or pending-operation limit reached. Complete pending file deletions or remove an older project.')
      return reservation
    }
    const cleanupUpload=async(reservation:string,blob:string)=>{
      // Switching the reservation to cleanup atomically prevents any late finalization.
      const marked=await q('UPDATE cloud_deletions SET ready=1 WHERE project=? AND owner=? AND ready=0',reservation,user).run()
      if(!marked.meta.changes)return // A successful version transaction already owns these bytes.
      await env.BUCKET.delete(blob)
      await q('DELETE FROM cloud_deletions WHERE project=? AND owner=?',reservation,user).run()
    }
    const accessible=async(id:string,ownerOnly=false)=>{
      const p=await q(`SELECT p.* FROM cloud_projects p WHERE p.id=? AND (p.owner=? OR EXISTS (SELECT 1 FROM cloud_members m WHERE m.project=p.id AND m.user=? AND m.grant=p.share_hash AND p.share_expires>?))`,id,user,user,Date.now()).first<Project>()
      if(!p)reject(404,'Project is unavailable or its review link has expired.');if(ownerOnly&&p.owner!==user)reject(403,'Only the owner can change this project.');return p
    }
    if(path==='/api/cloud/preferences'){
      if(method==='GET'){const row=await q('SELECT payload FROM cloud_preferences WHERE user=?',user).first<{payload:string}>();return reply(row?JSON.parse(row.payload):{completed:[],analytics:false,counts:{}})}
      if(method==='PUT'){
        const b=await body(request,8192),allowed=['first-part','surface-label','fit-and-check','share-review']
        if(!Array.isArray(b.completed)||b.completed.length>4||b.completed.some(v=>typeof v!=='string'||!allowed.includes(v))||typeof b.analytics!=='boolean'||!b.counts||typeof b.counts!=='object'||Array.isArray(b.counts))reject(400,'Invalid learning preferences.')
        const counts=Object.fromEntries(Object.entries(b.counts).filter(([key])=>allowed.includes(key)).map(([key,value])=>[key,Math.max(0,Math.min(100000,Number.isSafeInteger(value)?Number(value):0))]))
        const payload=JSON.stringify({completed:[...new Set(b.completed)],analytics:b.analytics,counts:b.analytics?counts:{}})
        await q('INSERT INTO cloud_preferences(user,payload,updated) VALUES (?,?,?) ON CONFLICT(user) DO UPDATE SET payload=excluded.payload,updated=excluded.updated',user,payload,Date.now()).run();return reply({saved:true})
      }
    }
    if(path==='/api/cloud/projects'){
      if(method==='GET'){const rows=await q(`SELECT p.* FROM cloud_projects p WHERE p.owner=? OR EXISTS (SELECT 1 FROM cloud_members m WHERE m.project=p.id AND m.user=? AND m.grant=p.share_hash AND p.share_expires>?) ORDER BY p.updated DESC LIMIT 100`,user,user,Date.now()).all<Project>();return reply({projects:rows.results.map(p=>publicProject(p,user)),pendingDeletions:(await q('SELECT project AS id,name FROM cloud_deletions WHERE owner=? AND ready=1 LIMIT 50',user).all()).results})}
      if(method==='POST'){
        const b=await body(request),{doc,json,bytes}=documentPayload(b.document),id=uid(),blob=`projects/${id}/${uid()}.json`,now=Date.now()
        const reservation=await reserveUpload(blob,doc.name,bytes)
        let results:{meta:{changes:number}}[]
        try{await env.BUCKET.put(blob,json);results=await db.batch([
          q(`INSERT INTO cloud_projects(id,owner,name,revision,blob,updated) SELECT ?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM cloud_projects WHERE owner=?)<50 AND EXISTS(SELECT 1 FROM cloud_deletions WHERE project=? AND owner=? AND ready=0)`,id,user,doc.name,blob,now,user,reservation,user),
          q('INSERT INTO cloud_versions(project,revision,blob,bytes,created) SELECT id,1,blob,?,? FROM cloud_projects WHERE id=?',bytes,now,id),
          q('DELETE FROM cloud_deletions WHERE project=? AND EXISTS(SELECT 1 FROM cloud_versions WHERE blob=?)',reservation,blob),
        ])}catch(error){await cleanupUpload(reservation,blob);throw error}
        if(!results[0]?.meta.changes){await cleanupUpload(reservation,blob);reject(429,'Cloud limit reached: 50 projects or 50 MB per account. Download and delete an older cloud project.')}
        return reply({project:{id,name:doc.name,revision:1,updated:now,role:'owner',sharing:false}},201)
      }
    }
    if(path==='/api/cloud/join'&&method==='POST'){
      const b=await body(request,1024);if(typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token))reject(400,'Invalid review link.')
      const hash=await digest(b.token),p=await q('SELECT * FROM cloud_projects WHERE share_hash=? AND share_expires>?',hash,Date.now()).first<Project>();if(!p)reject(404,'This review link has expired or been revoked.')
      if(p.owner!==user){const result=await q(`INSERT INTO cloud_members(project,user,grant) SELECT id,?,share_hash FROM cloud_projects WHERE id=? AND share_hash=? AND share_expires>? AND (SELECT COUNT(*) FROM cloud_members WHERE user=?)<100 ON CONFLICT(project,user) DO UPDATE SET grant=excluded.grant`,user,p.id,hash,Date.now(),user).run();if(!result.meta.changes)reject(429,'Review could not be joined. Refresh the link or remove older memberships.')}
      return reply({project:publicProject(p,user)})
    }
    const match=path.match(/^\/api\/cloud\/projects\/([a-zA-Z0-9-]{1,80})(?:\/(document|versions|share|comments))?$/)
    if(!match)reject(404,'Cloud endpoint not found.')
    const id=match[1]!,action=match[2]
    const deleteBlobs=async()=>{
      const pending=await q('SELECT blobs FROM cloud_deletions WHERE project=? AND owner=? AND ready=1',id,user).first<{blobs:string}>()
      if(!pending)return false
      const keys=JSON.parse(pending.blobs) as string[]
      if(keys.length)await env.BUCKET.delete(keys)
      await q('DELETE FROM cloud_deletions WHERE project=? AND owner=?',id,user).run()
      return true
    }
    if(!action&&method==='DELETE'&&await deleteBlobs())return reply({deleted:true})
    const p=await accessible(id,['PUT','DELETE'].includes(method)||action==='share')
    if(!action&&method==='DELETE'){
      // Capture every committed version and remove visibility atomically. Keep keys until R2 confirms deletion.
      await db.batch([
        q("INSERT INTO cloud_deletions(project,owner,name,blobs,bytes) SELECT id,owner,name,(SELECT json_group_array(blob) FROM cloud_versions WHERE project=?),(SELECT COALESCE(SUM(bytes),0) FROM cloud_versions WHERE project=?) FROM cloud_projects WHERE id=? AND owner=? ON CONFLICT(project) DO NOTHING",id,id,id,user),
        q('DELETE FROM cloud_comments WHERE project=?',id),q('DELETE FROM cloud_members WHERE project=?',id),q('DELETE FROM cloud_versions WHERE project=?',id),q('DELETE FROM cloud_projects WHERE id=? AND owner=?',id,user),
      ])
      await deleteBlobs();return reply({deleted:true})
    }
    if(action==='versions'&&method==='GET'){return reply({versions:(await q('SELECT revision,created,bytes FROM cloud_versions WHERE project=? ORDER BY revision DESC LIMIT 20',id).all()).results})}
    if(action==='document'){
      if(method==='GET'){
        const revision=url.searchParams.has('revision')?requireRevision(Number(url.searchParams.get('revision'))):p.revision
        const version=await q('SELECT blob FROM cloud_versions WHERE project=? AND revision=?',id,revision).first<{blob:string}>();if(!version)reject(404,'Snapshot not found.')
        const object=await env.BUCKET.get(version.blob);if(!object)reject(503,'The snapshot is temporarily unavailable. Please retry.')
        return reply({project:publicProject(p,user),snapshotRevision:revision,document:JSON.parse(await object.text())})
      }
      if(method==='PUT'){
        const b=await body(request),expected=requireRevision(b.expectedRevision);if(expected!==p.revision)reject(409,'A newer cloud snapshot exists. Reload it before saving again.')
        const {doc,json,bytes}=documentPayload(b.document),blob=`projects/${id}/${uid()}.json`,now=Date.now()
        const reservation=await reserveUpload(blob,doc.name,bytes)
        let results:{meta:{changes:number}}[]
        try{await env.BUCKET.put(blob,json);results=await db.batch([
          q(`UPDATE cloud_projects SET name=?,revision=revision+1,blob=?,updated=? WHERE id=? AND owner=? AND revision=? AND (SELECT COUNT(*) FROM cloud_versions WHERE project=?)<20 AND EXISTS(SELECT 1 FROM cloud_deletions WHERE project=? AND owner=? AND ready=0)`,doc.name,blob,now,id,user,expected,id,reservation,user),
          q('INSERT INTO cloud_versions(project,revision,blob,bytes,created) SELECT id,revision,blob,?,? FROM cloud_projects WHERE id=? AND blob=?',bytes,now,id,blob),
          q('DELETE FROM cloud_deletions WHERE project=? AND EXISTS(SELECT 1 FROM cloud_versions WHERE blob=?)',reservation,blob),
        ])}catch(error){await cleanupUpload(reservation,blob);throw error}
        if(!results[0]?.meta.changes){await cleanupUpload(reservation,blob);reject(409,'Save was not applied: a newer snapshot exists, 20 snapshots are retained, or the 50 MB account limit was reached. Reload or save a new cloud copy.')}
        return reply({project:publicProject({...p,name:doc.name,revision:expected+1,updated:now,blob},user)})
      }
    }
    if(action==='share'){
      if(method==='POST'){
        await body(request,1024)
        const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),expires=Date.now()+7*86400000
        await db.batch([q('UPDATE cloud_projects SET share_hash=?,share_expires=? WHERE id=? AND owner=?',await digest(token),expires,id,user),q('DELETE FROM cloud_members WHERE project=?',id)])
        return reply({url:`${url.origin}/#projects?review=${token}`,expires})
      }
      if(method==='DELETE'){await db.batch([q('UPDATE cloud_projects SET share_hash=NULL,share_expires=NULL WHERE id=? AND owner=?',id,user),q('DELETE FROM cloud_members WHERE project=?',id)]);return reply({revoked:true})}
    }
    if(action==='comments'){
      if(method==='GET'){const rows=await q('SELECT id,revision,author,body,parent,resolved,created FROM cloud_comments WHERE project=? ORDER BY created,id LIMIT 500',id).all<Record<string,unknown>>();return reply({comments:rows.results.map(c=>({...c,author:c.author===user?'You':c.author===p.owner?'Owner':'Reviewer'}))})}
      if(method==='POST'){
        const b=await body(request,8192),revision=requireRevision(b.revision)
        if(typeof b.body!=='string'||!b.body.trim()||b.body.length>2000)reject(400,'Write a comment of 1–2,000 characters.')
        if(!await q('SELECT revision FROM cloud_versions WHERE project=? AND revision=?',id,revision).first())reject(404,'Snapshot not found.')
        if(b.parent!==undefined&&b.parent!==null){if(typeof b.parent!=='string'||!await q('SELECT id FROM cloud_comments WHERE id=? AND project=? AND revision=? AND parent IS NULL',b.parent,id,revision).first())reject(400,'Reply to a top-level comment on the same snapshot.')}
        // Repeat access and quota checks in the write, so revocation races cannot append comments.
        const result=await q(`INSERT INTO cloud_comments(id,project,revision,author,body,parent,resolved,created) SELECT ?,?,?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM cloud_projects p WHERE p.id=? AND (p.owner=? OR EXISTS(SELECT 1 FROM cloud_members m WHERE m.project=p.id AND m.user=? AND m.grant=p.share_hash AND p.share_expires>?))) AND (SELECT COUNT(*) FROM cloud_comments WHERE project=?)<500 AND (SELECT COUNT(*) FROM cloud_comments WHERE author=? AND created>?)<30`,uid(),id,revision,user,b.body.trim(),b.parent??null,Date.now(),id,user,user,Date.now(),id,user,Date.now()-60000).run()
        if(!result.meta.changes)reject(429,'Comment was not saved. The link may be revoked, or the comment limit has been reached. Wait a minute and retry.')
        return reply({saved:true},201)
      }
      if(method==='PATCH'){
        const b=await body(request,1024);if(typeof b.id!=='string'||typeof b.resolved!=='boolean')reject(400,'Invalid comment update.')
        const result=await q('UPDATE cloud_comments SET resolved=? WHERE id=? AND project=? AND parent IS NULL AND (author=? OR ?=?) AND EXISTS(SELECT 1 FROM cloud_projects p WHERE p.id=? AND (p.owner=? OR EXISTS(SELECT 1 FROM cloud_members m WHERE m.project=p.id AND m.user=? AND m.grant=p.share_hash AND p.share_expires>?)))',b.resolved?1:0,b.id,id,user,p.owner,user,id,user,user,Date.now()).run();if(!result.meta.changes)reject(403,'Only the thread author or project owner can resolve it.');return reply({saved:true})
      }
    }
    reject(405,'This action is not supported.')
  }catch(error){if(error instanceof HttpError)return reply({error:error.message},error.status);console.error('Cloud operation failed',error instanceof Error?error.name:'unknown');return reply({error:'Cloud storage is temporarily unavailable. Your local work is safe; please retry.'},503)}
}

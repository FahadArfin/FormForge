import {parseModelDocument} from '../../../packages/model/src/index'
import {encodeSnapshot,decodeSnapshot} from './snapshotCodec'
import type {Env} from './api'

type ModelRow={id:string;owner:string;title:string;description:string;category:string;tags:string;license:string;creator:string;created:number;remix_of:string|null;image:string|null;document:string;commentCount:number}
type CommentRow={id:string;model:string;owner:string;author:string;body:string;parent:string|null;created:number;deleted:number}
const bundled=new Set(['desk-dock','sea-turtle','hex-wall','spiral-planter',...['enclosure','bracket','adapter','snapfit','coupon','washer','tray','cable-guide'].map(id=>`starter-${id}`)])
const starterTitles:Record<string,string>={'starter-enclosure':'Electronics enclosure','starter-bracket':'Mounting bracket','starter-adapter':'Hollow adapter','starter-snapfit':'Snap-fit test pair','starter-coupon':'Hole & pin fit coupon','starter-washer':'Washer / spacer','starter-tray':'Small parts tray','starter-cable-guide':'Cable pass-through plate'}
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const sharedPattern=new RegExp(`^shared-${uuid}$`),commentPattern=new RegExp(`^comment-${uuid}$`)
const licenses=['CC0','CC BY 4.0','CC BY-SA 4.0']
class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
function fail(status:number,message:string):never{throw new HttpError(status,message)}
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}})
const size=(value:string)=>new TextEncoder().encode(value).length
function text(value:unknown,label:string,min:number,max:number){if(typeof value!=='string'||value.trim().length<min||value.length>max)fail(400,`Invalid ${label}.`);return value.trim()}
async function body(request:Request,limit:number){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'Send JSON data.')
 if(Number(request.headers.get('Content-Length')??0)>limit)fail(413,'This request is too large.')
 const reader=request.body?.getReader();if(!reader)fail(400,'Missing request data.')
 const chunks:Uint8Array[]=[];let length=0
 while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();fail(413,'This request is too large.')}chunks.push(value)}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 try{const parsed:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw 0;return parsed as Record<string,unknown>}catch{fail(400,'Invalid JSON data.')}
}
function documentPayload(value:unknown){
 try{
  const document=parseModelDocument(value)
  if(!document.nodes.length||document.nodes.length>2000||document.namedParameters.length>500||document.name.length>120)fail(400,'Publish a supported, nonempty editable model.')
  // Test evidence and engineering history may contain personal notes and photos.
  delete document.printTests
  if(document.engineering)document.engineering={...document.engineering,history:[]}
  const encoded=encodeSnapshot(JSON.stringify(document));if(size(encoded)>750_000)fail(413,'Public models can contain up to 750 KB of encoded document data.')
  return {document,encoded}
 }catch(error){if(error instanceof HttpError)throw error;fail(400,'Publish a supported, nonempty editable model.')}
}
function thumbnail(value:unknown){
 if(value===undefined||value===null)return null
 if(typeof value!=='string'||size(value)>250_000)fail(400,'Use a PNG, JPEG or WebP thumbnail under 250 KB.')
 const match=value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!match)fail(400,'Invalid thumbnail.')
 let decoded:string;try{decoded=atob(match[2]!)}catch{fail(400,'Invalid thumbnail.')}
 const valid=match[1]==='png'?decoded.startsWith('\x89PNG\r\n\x1a\n'):match[1]==='jpeg'?decoded.startsWith('\xff\xd8\xff'):decoded.startsWith('RIFF')&&decoded.slice(8,12)==='WEBP'
 if(!valid)fail(400,'Invalid thumbnail.');return value
}
function publicModel(row:ModelRow,user:string|null){return {id:row.id,title:row.title,description:row.description,category:row.category,tags:JSON.parse(row.tags),license:row.license,creator:row.creator,createdAt:new Date(row.created).toISOString(),...(row.remix_of?{remixOf:row.remix_of}:{}),...(row.image?{image:row.image}:{}),owned:!!user&&row.owner===user,commentCount:row.commentCount??0}}
function publicComment(row:CommentRow,user:string|null,modelOwner:string|null){return {id:row.id,parent:row.parent,author:row.deleted?'':row.author,body:row.deleted?'':row.body,createdAt:new Date(row.created).toISOString(),owned:!!user&&row.owner===user,canDelete:!row.deleted&&!!user&&(row.owner===user||modelOwner===user),deleted:!!row.deleted}}
const modelFields='m.id,m.owner,m.title,m.description,m.category,m.tags,m.license,m.creator,m.created,m.remix_of,m.image,(SELECT COUNT(*) FROM community_comments c WHERE c.model=m.id AND c.deleted=0) AS commentCount'
export async function communityApi(request:Request,env:Env):Promise<Response>{
 try{
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,''),method=request.method
  const route=path.match(/^\/api\/cloud\/community(?:\/([^/]+)(?:\/(comments)(?:\/([^/]+))?)?)?$/)
  if(!route)fail(404,'Community endpoint not found.')
  const id=route[1],comments=route[2],commentId=route[3]
  if(id&&!bundled.has(id)&&!sharedPattern.test(id)||commentId&&!commentPattern.test(commentId))fail(404,'Community item not found.')
  const supported=commentId?['DELETE']:comments?['GET','POST']:id?['GET','DELETE']:['GET','POST']
  if(!supported.includes(method))fail(405,'Method not allowed.')
  const identity=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email'),user=identity&&email?identity:null
  if(method!=='GET'){if(!user)fail(401,'Sign in with ChatGPT to publish or comment.');if(request.headers.get('Origin')!==url.origin)fail(403,'This request must come from this site.')}
  if(!env.DB)fail(503,'Community storage is temporarily unavailable.')
  const db=env.DB,q=(sql:string,...values:unknown[])=>db.prepare(sql).bind(...values)
  const cursor=url.searchParams.get('cursor')
  if(cursor&&!(comments?commentPattern:sharedPattern).test(cursor))fail(400,'Invalid page cursor.')
  const rate='(SELECT COUNT(*) FROM community_writes WHERE owner=? AND created>?)<10'
  const recordWrite=(writeId:string,table:string,now:number)=>[q(`INSERT INTO community_writes(id,owner,created) SELECT id,owner,? FROM ${table} WHERE id=?`,now,writeId),q('DELETE FROM community_writes WHERE created<?',now-86400000)]
  if(!id&&method==='GET'){
   const anchor=cursor?await q('SELECT created,id FROM community_models WHERE id=?',cursor).first<{created:number;id:string}>():null
   if(cursor&&!anchor)fail(400,'Page cursor has expired. Refresh the gallery.')
   const rows=(await q(`SELECT ${modelFields} FROM community_models m ${anchor?'WHERE (m.created,m.id)<(?,?)':''} ORDER BY m.created DESC,m.id DESC LIMIT 41`,...(anchor?[anchor.created,anchor.id]:[])).all<ModelRow>()).results
   const page=rows.slice(0,40);return reply({models:page.map(row=>publicModel(row,user)),nextCursor:rows.length>40?page.at(-1)!.id:null})
  }
  if(!id&&method==='POST'){
   const b=await body(request,1_050_000);if(b.confirmPublic!==true)fail(400,'Explicit public publishing permission is required.')
   const title=text(b.title,'title',1,120),description=text(b.description,'description',0,2000),category=text(b.category,'category',1,60),creator=text(b.creator,'creator alias',2,40),license=text(b.license,'license',1,40)
   if(!licenses.includes(license)||!Array.isArray(b.tags)||b.tags.length>12)fail(400,'Invalid license or tags.')
   const tags=[...new Set(b.tags.map(tag=>text(tag,'tag',1,40).toLowerCase()))],image=thumbnail(b.image),{document}=documentPayload(b.document)
   const provenance=(document as typeof document & {communitySource?:{modelId:string;title:string;creator:string;license:string}}).communitySource
   if(provenance&&b.remixOf!==undefined&&b.remixOf!==provenance.modelId)fail(400,'The remix source must match document attribution.')
   const localSource=provenance&&/^user-[a-zA-Z0-9-]{1,100}$/.test(provenance.modelId)
   if(localSource){
    if(!licenses.includes(provenance.license))fail(400,'This local source license is unsupported. Obtain permission under CC0, CC BY 4.0 or CC BY-SA 4.0 before publishing.')
    if(provenance.license==='CC BY-SA 4.0'&&license!==provenance.license)fail(400,'This remix must retain the CC BY-SA 4.0 source license.')
   }
   // Local attribution is supplied by the publisher; it is not a verified public parent.
   const remixOf=localSource?null:b.remixOf??provenance?.modelId??null
   if(remixOf!==null){
    if(typeof remixOf!=='string'||!bundled.has(remixOf)&&!sharedPattern.test(remixOf))fail(400,'Invalid remix source.')
    if(bundled.has(remixOf)&&!starterTitles[remixOf])fail(400,'Concept illustrations have no editable model license.')
    const source=starterTitles[remixOf]?{title:starterTitles[remixOf],creator:'PrintLab',license:'CC0'}:await q('SELECT title,creator,license FROM community_models WHERE id=?',remixOf).first<{title?:string;creator?:string;license:string}>()
    if(!source)fail(400,'Remix source is unavailable.')
    if(source.license==='CC BY-SA 4.0'&&license!==source.license)fail(400,'This remix must retain the CC BY-SA 4.0 license.')
    if(provenance&&(provenance.license!==source.license||'title' in source&&(provenance.title!==source.title||provenance.creator!==source.creator)))fail(400,'Document attribution does not match the source.')
    if('title' in source&&source.title&&source.creator)document.communitySource={modelId:remixOf,title:source.title,creator:source.creator,license:source.license}
   }
   const encoded=encodeSnapshot(JSON.stringify(document));if(size(encoded)>750_000)fail(413,'Public models can contain up to 750 KB of encoded document data.')
   const newId=`shared-${crypto.randomUUID()}`,now=Date.now(),bytes=size(encoded)+size(image??'')
   const result=await db.batch([q(`INSERT INTO community_models(id,owner,title,description,category,tags,license,creator,created,remix_of,image,document,bytes) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM community_models WHERE owner=?)<20 AND (SELECT COALESCE(SUM(bytes),0) FROM community_models WHERE owner=?)+?<=10000000 AND ${rate} AND (? IS NULL OR ?=1 OR EXISTS(SELECT 1 FROM community_models WHERE id=?))`,newId,user,title,description,category,JSON.stringify(tags),license,creator,now,remixOf,image,encoded,bytes,user,user,bytes,user,now-60000,remixOf,bundled.has(String(remixOf))?1:0,remixOf),...recordWrite(newId,'community_models',now)])
   if(!result[0]?.meta.changes)fail(429,'Publication limit reached or source removed. Wait a minute or remove an older publication (20 designs / 10 MB per account).')
   return reply({model:publicModel({id:newId,owner:user!,title,description,category,tags:JSON.stringify(tags),license,creator,created:now,remix_of:remixOf as string|null,image,document:encoded,commentCount:0},user)},201)
  }
  const model=bundled.has(id!)?null:await q(`SELECT ${modelFields}${method==='GET'&&!comments?',m.document':''} FROM community_models m WHERE m.id=?`,id).first<ModelRow>()
  if(!model&&!bundled.has(id!))fail(404,'Community design not found.')
  if(!comments){
   if(!model)fail(404,'Bundled designs are available in the app gallery.')
   if(method==='GET')return reply({model:publicModel(model,user),document:decodeSnapshot(model.document)})
   if(model.owner!==user)fail(403,'Only the publisher can delete this design.')
   await db.batch([q('DELETE FROM community_comments WHERE model=? AND EXISTS(SELECT 1 FROM community_models WHERE id=? AND owner=?)',id,id,user),q('DELETE FROM community_models WHERE id=? AND owner=?',id,user)])
   return reply({deleted:true})
  }
  if(commentId){
   const row=await q('SELECT * FROM community_comments WHERE id=? AND model=?',commentId,id).first<CommentRow>();if(!row)fail(404,'Comment not found.')
   if(row.owner!==user&&model?.owner!==user)fail(403,'Only the author or publisher can delete this comment.')
   await q('UPDATE community_comments SET body=\'\',author=\'\',deleted=1 WHERE id=? AND model=? AND (owner=? OR EXISTS(SELECT 1 FROM community_models WHERE id=? AND owner=?))',commentId,id,user,id,user).run()
   return reply({deleted:true})
  }
  if(method==='GET'){
   const anchor=cursor?await q('SELECT created,id FROM community_comments WHERE id=? AND model=?',cursor,id).first<{created:number;id:string}>():null
   if(cursor&&!anchor)fail(400,'Invalid comment cursor.')
   const rows=(await q(`SELECT * FROM community_comments WHERE model=? ${anchor?'AND (created,id)>(?,?)':''} ORDER BY created,id LIMIT 51`,id,...(anchor?[anchor.created,anchor.id]:[])).all<CommentRow>()).results
   const page=rows.slice(0,50);return reply({comments:page.map(row=>publicComment(row,user,model?.owner??null)),nextCursor:rows.length>50?page.at(-1)!.id:null})
  }
  const b=await body(request,12_000),message=text(b.body,'comment (1–2,000 characters)',1,2000),author=text(b.author,'author alias',2,40),parent=b.parent??null
  if(parent!==null&&(typeof parent!=='string'||!commentPattern.test(parent)||!await q('SELECT id FROM community_comments WHERE id=? AND model=? AND parent IS NULL AND deleted=0',parent,id).first()))fail(400,'Reply to a live top-level comment on this design.')
  const newId=`comment-${crypto.randomUUID()}`,now=Date.now()
  const result=await db.batch([q(`INSERT INTO community_comments(id,model,owner,author,body,parent,created,deleted) SELECT ?,?,?,?,?,?,?,0 WHERE (?=1 OR EXISTS(SELECT 1 FROM community_models WHERE id=?)) AND (SELECT COUNT(*) FROM community_comments WHERE model=?)<500 AND (SELECT COUNT(*) FROM community_comments WHERE owner=?)<1000 AND ${rate} AND (? IS NULL OR (EXISTS(SELECT 1 FROM community_comments WHERE id=? AND model=? AND parent IS NULL AND deleted=0) AND (SELECT COUNT(*) FROM community_comments WHERE parent=?)<20))`,newId,id,user,author,message,parent,now,bundled.has(id!)?1:0,id,id,user,user,now-60000,parent,parent,id,parent),...recordWrite(newId,'community_comments',now)])
  if(!result[0]?.meta.changes)fail(429,'Comment limit reached or thread unavailable. Wait a minute and refresh (20 replies per thread).')
  return reply({comment:publicComment({id:newId,model:id!,owner:user!,author,body:message,parent:parent as string|null,created:now,deleted:0},user,model?.owner??null)},201)
 }catch(error){return error instanceof HttpError?reply({error:error.message},error.status):reply({error:'Community storage is temporarily unavailable. Please retry.'},503)}
}

import Fastify from 'fastify'
import cors from '@fastify/cors'
import postgres from 'postgres'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Client, handle_file } from '@gradio/client'
import { modelDocumentSchema, type ModelDocument } from '@formforge/model'

const port = Number(process.env.API_PORT ?? 8787)
const ownerToken = process.env.OWNER_TOKEN ?? ''
const shareSecret = process.env.SHARE_SECRET ?? 'development-only-share-secret'
const connectionString = process.env.DATABASE_URL
const sql = connectionString ? postgres(connectionString, { max: 5, connect_timeout: 5 }) : null
const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024, trustProxy: true })
const trellisEnabled = process.env.TRELLIS_SPACE_ENABLED === 'true'
const trellisSpace = process.env.TRELLIS_SPACE ?? 'microsoft/TRELLIS.2'
const hfToken = process.env.HF_TOKEN

type AiJob = {
  id: string
  status: 'queued' | 'preprocessing' | 'generating-shape' | 'extracting' | 'ready' | 'failed' | 'cancelled'
  progress: number
  message: string
  createdAt: number
  owner: string
  model?: Buffer
  error?: string
}
const aiJobs = new Map<string, AiJob>()
const aiRequestTimes = new Map<string, number[]>()

await app.register(cors, { origin: true, methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'] })

function authorized(header?: string) {
  if (!ownerToken) return process.env.NODE_ENV !== 'production'
  const candidate = header?.replace(/^Bearer\s+/i, '') ?? ''
  const a = Buffer.from(candidate)
  const b = Buffer.from(ownerToken)
  return a.length === b.length && timingSafeEqual(a, b)
}

function signedShareToken(projectId: string) {
  const payload = Buffer.from(JSON.stringify({ projectId })).toString('base64url')
  const signature = createHmac('sha256', shareSecret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function readShareToken(token: string) {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = createHmac('sha256', shareSecret).update(payload).digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()) as { projectId: string } } catch { return null }
}

if (sql) {
  await sql`
    create table if not exists projects (
      id text primary key,
      name text not null,
      document jsonb not null,
      revision integer not null,
      updated_at timestamptz not null default now()
    )
  `
  await sql`
    create table if not exists project_versions (
      id bigserial primary key,
      project_id text not null references projects(id) on delete cascade,
      label text not null,
      document jsonb not null,
      revision integer not null,
      created_at timestamptz not null default now()
    )
  `
  await sql`create table if not exists community_users (
    id text primary key, handle text unique not null, display_name text not null, bio text not null default '', avatar_url text, created_at timestamptz not null default now()
  )`
  await sql`create table if not exists community_models (
    id text primary key, creator_id text not null references community_users(id) on delete cascade, title text not null, description text not null,
    category text not null, tags text[] not null default '{}', license text not null, image_url text, gallery jsonb not null default '[]',
    colors text[] not null default '{}', document jsonb, print_profile jsonb not null default '{}', remix_of text references community_models(id) on delete set null,
    published boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  )`
  await sql`create table if not exists community_interactions (
    user_id text not null references community_users(id) on delete cascade, model_id text not null references community_models(id) on delete cascade,
    kind text not null check (kind in ('like','boost','download','history')), created_at timestamptz not null default now(), primary key(user_id, model_id, kind)
  )`
  await sql`create table if not exists community_comments (
    id text primary key, model_id text not null references community_models(id) on delete cascade, user_id text not null references community_users(id) on delete cascade,
    parent_id text references community_comments(id) on delete cascade, body text not null, rating integer check (rating between 1 and 5), likes integer not null default 0, created_at timestamptz not null default now()
  )`
  await sql`create table if not exists community_collections (
    id text primary key, owner_id text not null references community_users(id) on delete cascade, name text not null, description text not null default '', public boolean not null default true, created_at timestamptz not null default now()
  )`
  await sql`create table if not exists community_collection_items (
    collection_id text not null references community_collections(id) on delete cascade, model_id text not null references community_models(id) on delete cascade, created_at timestamptz not null default now(), primary key(collection_id, model_id)
  )`
  await sql`create index if not exists community_models_category_idx on community_models(category, created_at desc)`
  await sql`insert into community_users (id, handle, display_name, bio) values ('local-maker', '@you', 'You', 'Building useful things one layer at a time.') on conflict (id) do nothing`
}

app.get('/api/health', async () => ({ ok: true, storage: sql ? 'postgres' : 'local-only', version: '0.1.0' }))

app.get('/api/ai/capabilities', async () => ({
  trellis: trellisEnabled,
  provider: trellisEnabled ? trellisSpace : null,
  externalService: trellisEnabled,
  localRelief: true,
  acceptedImages: ['image/png', 'image/jpeg', 'image/webp'],
  maxImageBytes: 10 * 1024 * 1024,
}))

function validImage(buffer: Buffer, mimeType: string) {
  if (mimeType === 'image/png') return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (mimeType === 'image/jpeg') return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  if (mimeType === 'image/webp') return buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
  return false
}

async function runTrellisJob(job: AiJob, image: Buffer, mimeType: string, settings: { resolution: string; decimationTarget: number; textureSize: number }) {
  let client: Client | null = null
  try {
    client = await Client.connect(trellisSpace, hfToken?.startsWith('hf_') ? { token: hfToken as `hf_${string}` } : undefined)
    if (job.status === 'cancelled') return
    job.status = 'preprocessing'; job.progress = 8; job.message = 'Removing the background and centering the object'
    const preprocessed = await client.predict<unknown[]>('/preprocess_image', [handle_file(new Blob([Uint8Array.from(image)], { type: mimeType }))])
    const processedImage = Array.isArray(preprocessed.data) ? preprocessed.data[0] : preprocessed.data
    if ((job.status as AiJob['status']) === 'cancelled') return
    job.status = 'generating-shape'; job.progress = 22; job.message = 'TRELLIS.2 is generating shape and PBR materials'
    const seed = Math.floor(Math.random() * 2_147_483_647)
    const generated = await client.predict<unknown[]>('/image_to_3d', [
      processedImage, seed, settings.resolution,
      7.5, 0.7, 12, 5,
      7.5, 0.5, 12, 3,
      1, 0, 12, 3,
    ])
    const generatedData = Array.isArray(generated.data) ? generated.data : [generated.data]
    const latentState = generatedData[0]
    if ((job.status as AiJob['status']) === 'cancelled') return
    job.status = 'extracting'; job.progress = 78; job.message = 'Remeshing, simplifying, UV unwrapping, and exporting GLB'
    const extracted = await client.predict<unknown[]>('/extract_glb', [latentState, settings.decimationTarget, settings.textureSize])
    const output = (Array.isArray(extracted.data) ? extracted.data[0] : extracted.data) as { url?: string; path?: string } | string
    const outputUrl = typeof output === 'string' ? output : output?.url ?? output?.path
    if (!outputUrl) throw new Error('TRELLIS.2 completed without returning a GLB file.')
    const response = await client.fetch(outputUrl)
    if (!response.ok) throw new Error(`Could not download the generated GLB (${response.status}).`)
    const declaredSize = Number(response.headers.get('content-length') ?? 0)
    if (declaredSize > 100 * 1024 * 1024) throw new Error('Generated GLB exceeds the 100 MB import limit.')
    const model = Buffer.from(await response.arrayBuffer())
    if (model.length > 100 * 1024 * 1024 || model.toString('ascii', 0, 4) !== 'glTF') throw new Error('The provider returned an invalid or oversized GLB file.')
    job.model = model; job.status = 'ready'; job.progress = 100; job.message = 'Generated model is ready to import'
  } catch (error) {
    job.status = 'failed'; job.progress = 100; job.error = error instanceof Error ? error.message : 'TRELLIS.2 generation failed'; job.message = job.error
  } finally {
    client?.close()
  }
}

app.post<{ Body: { imageBase64?: string; mimeType?: string; resolution?: string; decimationTarget?: number; textureSize?: number } }>('/api/ai/models3d', async (request, reply) => {
  if (!trellisEnabled) return reply.code(503).send({ error: 'TRELLIS.2 is not configured. Use local relief mode or configure TRELLIS_SPACE_ENABLED.' })
  const activeJobs = [...aiJobs.values()].filter((job) => !['ready', 'failed', 'cancelled'].includes(job.status)).length
  if (activeJobs >= 2) return reply.code(429).send({ error: 'The generation worker is busy. Try again after an active job finishes.' })
  const cutoff = Date.now() - 60 * 60 * 1000
  const recent = (aiRequestTimes.get(request.ip) ?? []).filter((time) => time >= cutoff)
  if (recent.length >= 4) return reply.code(429).send({ error: 'Generation limit reached. Try again later.' })
  const mimeType = request.body.mimeType ?? ''
  const encoded = request.body.imageBase64?.replace(/^data:[^;]+;base64,/, '') ?? ''
  let image: Buffer
  try { image = Buffer.from(encoded, 'base64') } catch { return reply.code(400).send({ error: 'Invalid image encoding.' }) }
  if (!image.length || image.length > 10 * 1024 * 1024 || !validImage(image, mimeType)) return reply.code(400).send({ error: 'Upload a valid PNG, JPEG, or WebP image up to 10 MB.' })
  const resolution = ['512', '1024', '1536'].includes(request.body.resolution ?? '') ? request.body.resolution! : '512'
  const decimationTarget = Math.max(100_000, Math.min(500_000, Math.round(request.body.decimationTarget ?? 150_000)))
  const textureSize = [1024, 2048, 4096].includes(request.body.textureSize ?? 0) ? request.body.textureSize! : 1024
  recent.push(Date.now()); aiRequestTimes.set(request.ip, recent)
  const job: AiJob = { id: crypto.randomUUID(), status: 'queued', progress: 2, message: 'Waiting for the TRELLIS.2 worker', createdAt: Date.now(), owner: request.ip }
  aiJobs.set(job.id, job)
  void runTrellisJob(job, image, mimeType, { resolution, decimationTarget, textureSize })
  return reply.code(202).send({ id: job.id, status: job.status })
})

app.get<{ Params: { id: string } }>('/api/ai/jobs/:id', async (request, reply) => {
  const job = aiJobs.get(request.params.id)
  if (!job || job.owner !== request.ip) return reply.code(404).send({ error: 'Generation job not found.' })
  return { id: job.id, status: job.status, progress: job.progress, message: job.message, error: job.error, modelUrl: job.status === 'ready' ? `/api/ai/jobs/${job.id}/model` : undefined }
})

app.get<{ Params: { id: string } }>('/api/ai/jobs/:id/model', async (request, reply) => {
  const job = aiJobs.get(request.params.id)
  if (!job?.model || job.status !== 'ready' || job.owner !== request.ip) return reply.code(404).send({ error: 'Generated model is not ready.' })
  return reply.type('model/gltf-binary').header('Content-Disposition', `attachment; filename="trellis-${job.id}.glb"`).send(job.model)
})

app.delete<{ Params: { id: string } }>('/api/ai/jobs/:id', async (request, reply) => {
  const job = aiJobs.get(request.params.id)
  if (!job || job.owner !== request.ip) return reply.code(404).send({ error: 'Generation job not found.' })
  if (job.status !== 'ready' && job.status !== 'failed') { job.status = 'cancelled'; job.message = 'Generation cancelled'; job.progress = 100 }
  else aiJobs.delete(job.id)
  return { ok: true }
})

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000
  for (const [id, job] of aiJobs) if (job.createdAt < cutoff) aiJobs.delete(id)
  for (const [ip, times] of aiRequestTimes) {
    const recent = times.filter((time) => time >= cutoff)
    if (recent.length) aiRequestTimes.set(ip, recent)
    else aiRequestTimes.delete(ip)
  }
}, 10 * 60 * 1000).unref()

app.get<{ Querystring: { category?: string; q?: string; sort?: string } }>('/api/community/models', async (request, reply) => {
  if (!sql) return reply.code(503).send({ error: 'Community storage is not configured' })
  const category = request.query.category?.trim() ?? ''
  const query = request.query.q?.trim() ?? ''
  const rows = await sql`
    select m.*, u.handle, u.display_name, u.avatar_url,
      count(distinct i.user_id) filter (where i.kind = 'like')::int as likes,
      count(distinct i.user_id) filter (where i.kind = 'boost')::int as boosts,
      count(distinct i.user_id) filter (where i.kind = 'download')::int as downloads,
      coalesce(avg(c.rating) filter (where c.rating is not null), 0)::float as rating,
      count(distinct c.id) filter (where c.rating is not null)::int as review_count
    from community_models m join community_users u on u.id = m.creator_id
    left join community_interactions i on i.model_id = m.id left join community_comments c on c.model_id = m.id
    where m.published and (${category} = '' or m.category = ${category}) and (${query} = '' or m.title ilike ${`%${query}%`} or m.description ilike ${`%${query}%`})
    group by m.id, u.id order by case when ${request.query.sort ?? 'trending'} = 'newest' then extract(epoch from m.created_at) else 0 end desc,
      case when ${request.query.sort ?? 'trending'} = 'downloads' then count(distinct i.user_id) filter (where i.kind = 'download') else count(distinct i.user_id) filter (where i.kind = 'like') + count(distinct i.user_id) filter (where i.kind = 'boost') * 4 end desc
    limit 120
  `
  return rows
})

app.get<{ Params: { id: string } }>('/api/community/models/:id', async (request, reply) => {
  if (!sql) return reply.code(503).send({ error: 'Community storage is not configured' })
  const [model] = await sql`select m.*, u.handle, u.display_name, u.avatar_url from community_models m join community_users u on u.id = m.creator_id where m.id = ${request.params.id} and m.published`
  if (!model) return reply.code(404).send({ error: 'Model not found' })
  const comments = await sql`select c.*, u.handle, u.display_name, u.avatar_url from community_comments c join community_users u on u.id = c.user_id where c.model_id = ${request.params.id} order by c.created_at desc`
  const remixes = await sql`select id, title, image_url, created_at from community_models where remix_of = ${request.params.id} and published order by created_at desc`
  return { ...model, comments, remixes }
})

app.post<{ Body: Record<string, unknown> }>('/api/community/models', async (request, reply) => {
  if (!authorized(request.headers.authorization)) return reply.code(401).send({ error: 'Unauthorized' })
  if (!sql) return reply.code(503).send({ error: 'Community storage is not configured' })
  const body = request.body
  if (typeof body.id !== 'string' || typeof body.title !== 'string' || typeof body.description !== 'string') return reply.code(400).send({ error: 'id, title and description are required' })
  const creatorId = typeof body.creatorId === 'string' ? body.creatorId : 'local-maker'
  await sql`insert into community_models (id, creator_id, title, description, category, tags, license, image_url, gallery, colors, document, print_profile, remix_of)
    values (${body.id}, ${creatorId}, ${body.title}, ${body.description}, ${typeof body.category === 'string' ? body.category : 'Other'}, ${Array.isArray(body.tags) ? body.tags : []}, ${typeof body.license === 'string' ? body.license : 'Standard Digital File License'}, ${typeof body.imageUrl === 'string' ? body.imageUrl : null}, ${sql.json((Array.isArray(body.gallery) ? body.gallery : []) as never)}, ${Array.isArray(body.colors) ? body.colors : []}, ${body.document ? sql.json(body.document as never) : null}, ${sql.json((body.printProfile ?? {}) as never)}, ${typeof body.remixOf === 'string' ? body.remixOf : null})`
  return reply.code(201).send({ ok: true, id: body.id })
})

app.post<{ Params: { id: string }; Body: { userId?: string; kind?: string; active?: boolean } }>('/api/community/models/:id/interactions', async (request, reply) => {
  if (!sql) return reply.code(503).send({ error: 'Community storage is not configured' })
  const kind = request.body.kind
  if (!kind || !['like', 'boost', 'download', 'history'].includes(kind)) return reply.code(400).send({ error: 'Invalid interaction' })
  const userId = request.body.userId || 'local-maker'
  if (request.body.active === false) await sql`delete from community_interactions where user_id = ${userId} and model_id = ${request.params.id} and kind = ${kind}`
  else await sql`insert into community_interactions (user_id, model_id, kind) values (${userId}, ${request.params.id}, ${kind}) on conflict do nothing`
  const [counts] = await sql`select count(*) filter (where kind = 'like')::int likes, count(*) filter (where kind = 'boost')::int boosts, count(*) filter (where kind = 'download')::int downloads from community_interactions where model_id = ${request.params.id}`
  return counts
})

app.post<{ Params: { id: string }; Body: { id?: string; userId?: string; parentId?: string; body?: string; rating?: number } }>('/api/community/models/:id/comments', async (request, reply) => {
  if (!sql) return reply.code(503).send({ error: 'Community storage is not configured' })
  if (!request.body.body?.trim()) return reply.code(400).send({ error: 'Comment text is required' })
  const id = request.body.id || crypto.randomUUID()
  await sql`insert into community_comments (id, model_id, user_id, parent_id, body, rating) values (${id}, ${request.params.id}, ${request.body.userId || 'local-maker'}, ${request.body.parentId || null}, ${request.body.body.trim()}, ${request.body.rating ?? null})`
  return reply.code(201).send({ ok: true, id })
})

app.get<{ Params: { id: string } }>('/api/community/users/:id/profile', async (request, reply) => {
  if (!sql) return reply.code(503).send({ error: 'Community storage is not configured' })
  const [user] = await sql`select * from community_users where id = ${request.params.id}`
  if (!user) return reply.code(404).send({ error: 'Creator not found' })
  const models = await sql`select * from community_models where creator_id = ${request.params.id} and published order by created_at desc`
  const collections = await sql`select * from community_collections where owner_id = ${request.params.id} and public order by created_at desc`
  return { ...user, models, collections }
})

app.get<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
  if (!authorized(request.headers.authorization)) return reply.code(401).send({ error: 'Unauthorized' })
  if (!sql) return reply.code(503).send({ error: 'Cloud storage is not configured' })
  const [project] = await sql`select document, revision, updated_at from projects where id = ${request.params.id}`
  if (!project) return reply.code(404).send({ error: 'Project not found' })
  return project
})

app.put<{ Params: { id: string }; Body: unknown }>('/api/projects/:id', async (request, reply) => {
  if (!authorized(request.headers.authorization)) return reply.code(401).send({ error: 'Unauthorized' })
  if (!sql) return reply.code(503).send({ error: 'Cloud storage is not configured' })
  const parsed = modelDocumentSchema.safeParse(request.body)
  if (!parsed.success || parsed.data.id !== request.params.id) return reply.code(400).send({ error: 'Invalid model document' })
  const document = parsed.data as ModelDocument
  const [current] = await sql`select revision from projects where id = ${document.id}`
  if (current && Number(current.revision) > document.revision) {
    return reply.code(409).send({ error: 'A newer cloud version exists', cloudRevision: current.revision })
  }
  await sql`
    insert into projects (id, name, document, revision, updated_at)
    values (${document.id}, ${document.name}, ${sql.json(document as never)}, ${document.revision}, now())
    on conflict (id) do update set name = excluded.name, document = excluded.document, revision = excluded.revision, updated_at = now()
  `
  return { ok: true, revision: document.revision }
})

app.post<{ Params: { id: string }; Body: { label?: string } }>('/api/projects/:id/versions', async (request, reply) => {
  if (!authorized(request.headers.authorization)) return reply.code(401).send({ error: 'Unauthorized' })
  if (!sql) return reply.code(503).send({ error: 'Cloud storage is not configured' })
  const [project] = await sql`select document, revision from projects where id = ${request.params.id}`
  if (!project) return reply.code(404).send({ error: 'Project not found' })
  await sql`insert into project_versions (project_id, label, document, revision) values (${request.params.id}, ${request.body?.label || 'Snapshot'}, ${project.document}, ${project.revision})`
  return { ok: true }
})

app.post<{ Params: { id: string } }>('/api/projects/:id/share', async (request, reply) => {
  if (!authorized(request.headers.authorization)) return reply.code(401).send({ error: 'Unauthorized' })
  if (!sql) return reply.code(503).send({ error: 'Cloud storage is not configured' })
  return { token: signedShareToken(request.params.id) }
})

app.get<{ Params: { token: string } }>('/api/share/:token', async (request, reply) => {
  if (!sql) return reply.code(503).send({ error: 'Cloud storage is not configured' })
  const payload = readShareToken(request.params.token)
  if (!payload) return reply.code(404).send({ error: 'Invalid share link' })
  const [project] = await sql`select name, document, revision, updated_at from projects where id = ${payload.projectId}`
  if (!project) return reply.code(404).send({ error: 'Project not found' })
  return project
})

const close = async () => { if (sql) await sql.end(); await app.close() }
process.on('SIGINT', () => void close())
process.on('SIGTERM', () => void close())

await app.listen({ port, host: '0.0.0.0' })

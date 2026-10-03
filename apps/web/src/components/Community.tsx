import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Bookmark, Box, ChevronRight, Download, Flame, FolderOpen, Heart, History, Layers3, MessageCircle, PackageOpen, Plus, Repeat2, Search, Send, Sparkles, Star, UserRound, X } from 'lucide-react'
import type { ModelDocument } from '@formforge/model'
import { communityCategories, loadCommunityModels, savePublishedModels, type CommunityComment, type CommunityModel } from '@/lib/community'
import { cachedProjectThumbnail, renderProjectThumbnails } from '@/lib/projectThumbnails'
import { ThemeToggle, type AppearanceTheme } from './ThemeToggle'
import './CommunityRefresh.css'

type CommunityPage = 'discover' | 'profile' | 'collections' | 'history'

interface CommunityProps {
  theme: AppearanceTheme
  onToggleTheme: () => void
  document: ModelDocument
  onOpenStudio: () => void
  onOpenProjects: () => void
  onRemix: (model: CommunityModel) => void
  onPublished: (model: CommunityModel) => void
  openPublishRequest?: number
}

const number = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : String(value)
const readSet = (key: string) => { try { return new Set<string>(JSON.parse(localStorage.getItem(key) ?? '[]')) } catch { return new Set<string>() } }

// Earlier local showcase entries used unrelated stock covers. Never present them as the saved geometry.
const modelImage = (model: CommunityModel) => model.document
  ? cachedProjectThumbnail(model.document) ?? (model.image.startsWith('/community/') ? '' : model.image)
  : model.image

function ModelImage({ model }: { model: CommunityModel }) {
  const image = modelImage(model)
  return image ? <img src={image} alt={model.document ? `${model.title} project preview` : `${model.title} inspiration image`} loading="lazy" /> : <div className="community-preview-empty"><Box size={32} /><span>Preview unavailable</span></div>
}

function ModelGallery({ model }: { model: CommunityModel }) {
  const images = [...new Set((model.document ? [modelImage(model), ...model.gallery.filter((source) => !source.startsWith('/community/'))] : [model.image]).filter(Boolean))]
  const [selectedImage, setSelectedImage] = useState(images[0] ?? '')
  const image = images.includes(selectedImage) ? selectedImage : images[0]
  return <div className="model-gallery">
    {image ? <img src={image} alt={`${model.title} ${model.document ? 'project' : 'inspiration'} preview`} /> : <div className="community-preview-empty"><Box size={42} /><strong>No preview available</strong><span>{model.document ? 'The editable project is still attached.' : 'The inspiration image is unavailable.'}</span></div>}
    {images.length > 1 && <div>{images.map((source, index) => <button key={source} aria-label={`Show ${model.title} view ${index + 1}`} aria-pressed={source === image} onClick={() => setSelectedImage(source)}><img src={source} alt={`View ${index + 1}`} /></button>)}</div>}
  </div>
}

function ModelCard({ model, onOpen, saved, onCollect }: { model: CommunityModel; onOpen: (model: CommunityModel) => void; saved?: boolean; onCollect?: (model: CommunityModel) => void }) {
  return <article className="community-card" onClick={() => onOpen(model)}>
    <div className="community-card-image"><ModelImage model={model} /><span>{model.document ? 'Editable project' : 'Inspiration preview'}</span><button className={saved ? 'active' : ''} aria-pressed={Boolean(saved)} aria-label={`${saved ? 'Remove' : 'Save'} ${model.title} ${saved ? 'from' : 'to'} collection`} title={saved ? 'Remove from collection' : 'Save to collection'} onClick={(event) => { event.stopPropagation(); onCollect?.(model) }}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} /></button></div>
    <div className="community-card-copy"><div><button className="community-model-open" onClick={(event) => { event.stopPropagation(); onOpen(model) }}><strong>{model.title}</strong></button><span>{model.creator}</span></div><p>{model.description}</p><footer><span><Heart size={13} /> {number(model.likes)}</span><span><Download size={13} /> {number(model.downloads)}</span><span className="rating"><Star size={13} fill="currentColor" /> {model.rating}</span></footer></div>
  </article>
}

function CommentThread({ comment, onReply }: { comment: CommunityComment; onReply: (comment: CommunityComment) => void }) {
  return <div className="community-comment">
    <span className="community-avatar small">{comment.avatar}</span>
    <div><header><strong>{comment.author}</strong>{comment.rating && <span>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={11} fill={index < comment.rating! ? 'currentColor' : 'none'} />)}</span>}<time>{comment.createdAt}</time></header><p>{comment.body}</p><footer><span className="comment-like-count"><Heart size={12} /> {comment.likes}</span><button onClick={() => onReply(comment)}><MessageCircle size={12} /> Reply</button></footer>{comment.replies?.map((reply) => <CommentThread key={reply.id} comment={reply} onReply={onReply} />)}</div>
  </div>
}

function PublishModal({ document, onClose, onPublish }: { document: ModelDocument; onClose: () => void; onPublish: (model: CommunityModel) => void }) {
  const [title, setTitle] = useState(document.name)
  const [description, setDescription] = useState('An editable FormForge project saved in this browser.')
  const [category, setCategory] = useState('Organization')
  const [license, setLicense] = useState('Standard Digital File License')
  const [image, setImage] = useState(() => cachedProjectThumbnail(document) ?? '')
  const [previewLoading, setPreviewLoading] = useState(!cachedProjectThumbnail(document))
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    const abort = new AbortController()
    const cached = cachedProjectThumbnail(document)
    if (cached) { setImage(cached); setPreviewLoading(false); return }
    setPreviewLoading(true)
    void renderProjectThumbnails([document], abort.signal, (_key, preview) => {
      setImage(preview ?? '')
      setPreviewLoading(false)
    })
    return () => abort.abort()
  }, [document])
  const publish = () => onPublish({
    id: `user-${Date.now()}`, title: title.trim() || document.name, creator: 'You', creatorHandle: '@you', creatorAvatar: 'YO', image, gallery: image ? [image] : [], description, category, tags: ['formforge', 'editable'], license, likes: 0, boosts: 0, downloads: 0, makes: 0, rating: 0, reviewCount: 0, printTime: 'Not estimated', filamentGrams: 0, colors: [...new Set(document.nodes.filter((node) => node.visible && node.boolean === 'add').map((node) => node.color))], createdAt: new Date().toISOString(), document: structuredClone(document), comments: [],
  })
  return <div className="community-modal-backdrop" onMouseDown={onClose}><section className="publish-modal" role="dialog" aria-modal="true" aria-labelledby="local-showcase-title" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose() }
    if (event.key === 'Tab') {
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select')]
      const first = controls[0]; const last = controls[controls.length - 1]
      if (event.shiftKey && globalThis.document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && globalThis.document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }}>
    <header><div><span>Only in this browser</span><strong id="local-showcase-title">Save to local showcase</strong></div><button aria-label="Close showcase dialog" onClick={onClose}><X size={18} /></button></header>
    <div className="publish-layout">
      <div className="cover-picker">{image ? <img src={image} alt={`Preview of ${document.name}`} /> : <div className="community-preview-empty"><Box size={40} /><strong>{previewLoading ? 'Creating your preview…' : 'Preview unavailable'}</strong><span>Your editable project will still be saved.</span></div>}<span>{image ? 'Preview generated from your project geometry.' : 'Your project will be saved without a cover preview.'}</span></div>
      <div className="publish-fields"><label><span>Model title</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label><label><span>Description</span><textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /></label><div><label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{communityCategories.slice(2).map((value) => <option key={value}>{value}</option>)}</select></label><label><span>License note</span><select value={license} onChange={(event) => setLicense(event.target.value)}><option>Standard Digital File License</option><option>Creative Commons Attribution</option><option>Creative Commons Attribution-ShareAlike</option></select></label></div><aside><Layers3 size={16} /><span><strong>{document.nodes.length} editable parts included</strong><small>Print readiness and slicer settings have not been verified.</small></span></aside>{saveError && <p className="community-save-error" role="alert">{saveError}</p>}</div>
    </div>
    <footer><span>Saves a copy with editable source to this browser's showcase. Export a project backup to keep a separate copy.</span><button onClick={() => { try { publish() } catch { setSaveError('The showcase could not be saved. Browser storage may be full. Your original project is unchanged; export a backup from Studio.') } }}><FolderOpen size={16} /> Save to showcase</button></footer>
  </section></div>
}

export function Community({ theme, onToggleTheme, document, onOpenStudio, onOpenProjects, onRemix, onPublished, openPublishRequest = 0 }: CommunityProps) {
  const [models, setModels] = useState(loadCommunityModels)
  const [page, setPage] = useState<CommunityPage>('discover')
  const [active, setActive] = useState<CommunityModel | null>(null)
  const [category, setCategory] = useState('Trending')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'Trending' | 'Newest' | 'Most downloaded'>('Trending')
  const [liked, setLiked] = useState(() => readSet('formforge-liked'))
  const [boosted, setBoosted] = useState(() => readSet('formforge-boosted'))
  const [collected, setCollected] = useState(() => readSet('formforge-collected'))
  const [history, setHistory] = useState(() => readSet('formforge-history'))
  const [publishOpen, setPublishOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<'details' | 'comments' | 'remixes'>('details')
  const [commentBody, setCommentBody] = useState('')
  const [rating, setRating] = useState(5)
  const [replyTarget, setReplyTarget] = useState<CommunityComment | null>(null)
  const [, refreshThumbnails] = useState(0)
  const previewDocuments = useMemo(() => models.flatMap((model) => model.document ? [model.document] : []), [models])

  useEffect(() => {
    const abort = new AbortController()
    void renderProjectThumbnails(previewDocuments, abort.signal, () => refreshThumbnails((revision) => revision + 1))
    return () => abort.abort()
  }, [previewDocuments])

  const persistSet = (key: string, value: Set<string>, setter: (value: Set<string>) => void) => { setter(new Set(value)); localStorage.setItem(key, JSON.stringify([...value])) }
  const mutateMetric = (id: string, key: 'likes' | 'boosts', delta: number) => setModels((current) => current.map((model) => model.id === id ? { ...model, [key]: Math.max(0, model[key] + delta) } : model))
  const openModel = (model: CommunityModel) => { setActive(model); setDetailTab('details'); const next = new Set(history).add(model.id); persistSet('formforge-history', next, setHistory) }
  const toggle = (model: CommunityModel, kind: 'like' | 'boost' | 'collect') => {
    const state = kind === 'like' ? liked : kind === 'boost' ? boosted : collected
    const next = new Set(state); const exists = next.has(model.id); exists ? next.delete(model.id) : next.add(model.id)
    persistSet(`formforge-${kind === 'like' ? 'liked' : kind === 'boost' ? 'boosted' : 'collected'}`, next, kind === 'like' ? setLiked : kind === 'boost' ? setBoosted : setCollected)
    if (kind !== 'collect') mutateMetric(model.id, kind === 'like' ? 'likes' : 'boosts', exists ? -1 : 1)
    if (kind !== 'collect') setActive((current) => current?.id === model.id ? { ...current, [kind === 'like' ? 'likes' : 'boosts']: Math.max(0, current[kind === 'like' ? 'likes' : 'boosts'] + (exists ? -1 : 1)) } : current)
  }
  const filtered = useMemo(() => {
    let value = models.filter((model) => (!query || `${model.title} ${model.creator} ${model.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())) && (!communityCategories.slice(2).includes(category) || model.category === category))
    value = [...value].sort((a, b) => sort === 'Newest' ? b.createdAt.localeCompare(a.createdAt) : sort === 'Most downloaded' ? b.downloads - a.downloads : (b.likes + b.boosts * 4) - (a.likes + a.boosts * 4))
    return value
  }, [models, query, category, sort])

  useEffect(() => { if (openPublishRequest > 0) setPublishOpen(true) }, [openPublishRequest])
  const publish = (model: CommunityModel) => { const next = [model, ...models]; savePublishedModels(next); setModels(next); setPublishOpen(false); setActive(model); onPublished(model) }
  const submitComment = () => {
    if (!active || !commentBody.trim()) return
    const created: CommunityComment = { id: crypto.randomUUID(), author: 'You', avatar: 'YO', body: commentBody.trim(), rating: replyTarget ? undefined : rating, likes: 0, createdAt: 'Just now', replies: [] }
    const addReply = (comments: CommunityComment[]): CommunityComment[] => comments.map((comment) => comment.id === replyTarget?.id ? { ...comment, replies: [...(comment.replies ?? []), created] } : { ...comment, replies: addReply(comment.replies ?? []) })
    setModels((current) => current.map((model) => model.id === active.id ? { ...model, reviewCount: replyTarget ? model.reviewCount : model.reviewCount + 1, comments: replyTarget ? addReply(model.comments) : [created, ...model.comments] } : model))
    setActive((model) => model ? { ...model, reviewCount: replyTarget ? model.reviewCount : model.reviewCount + 1, comments: replyTarget ? addReply(model.comments) : [created, ...model.comments] } : model)
    setCommentBody(''); setReplyTarget(null)
  }

  const profileModels = page === 'collections' ? models.filter((model) => collected.has(model.id)) : page === 'history' ? models.filter((model) => history.has(model.id)) : models.filter((model) => model.creatorHandle === '@you')
  const recommendations = active ? models.filter((model) => model.id !== active.id).sort((a, b) => Number(b.category === active.category) - Number(a.category === active.category)).slice(0, 3) : []

  return <div className="community-shell community-refresh">
    <div className="community-theme-toggle"><ThemeToggle theme={theme} onToggle={onToggleTheme} /></div>
    <header className="community-header"><button className="community-brand" onClick={() => { setActive(null); setPage('discover'); setCategory('Trending') }}><span className="brand-mark"><span /></span><strong>FormForge</strong><em>Community</em></button><nav><button className={page === 'discover' ? 'active' : ''} onClick={() => { setPage('discover'); setActive(null) }}>Discover</button><button onClick={() => { setCategory('New & Notable'); setSort('Newest'); setPage('discover'); setActive(null) }}>New</button><button onClick={() => { setCategory('Toys & Games'); setPage('discover'); setActive(null) }}>Toys & games</button></nav><label className="community-search"><Search size={17} /><input aria-label="Search community models" value={query} onChange={(event) => { setQuery(event.target.value); setActive(null); setPage('discover') }} placeholder="Search models, creators, collections…" /></label><button className="projects-link" onClick={onOpenProjects}><FolderOpen size={16} /> Projects</button><button className="studio-link" onClick={onOpenStudio}><Box size={16} /> Studio</button><button className="publish-button" onClick={() => setPublishOpen(true)}><Plus size={16} /> Add to showcase</button><button className="community-avatar" aria-label="Your maker profile" onClick={() => { setActive(null); setPage('profile') }}>YO</button></header>

<div className="community-local-notice" role="note"><span>Local preview</span><p>Sample creators, comments and counts. Your showcase and saved collections stay in this browser; nothing is published online.</p></div>
    {active ? <main className="model-detail-page">
      <button className="back-discover" onClick={() => setActive(null)}><ArrowLeft size={16} /> Back to discover</button>
      <section className="model-hero"><ModelGallery key={active.id} model={active} /><aside className="model-summary"><span className="category-tag">{active.category}</span><h1>{active.title}</h1><button className="creator-line" onClick={() => { setActive(null); setPage(active.creatorHandle === '@you' ? 'profile' : 'discover') }}><span className="community-avatar">{active.creatorAvatar}</span><span><strong>{active.creator}</strong><small>{active.creatorHandle}</small></span><em>{active.creatorHandle === '@you' ? 'Your profile' : 'Sample creator'}</em></button><div className="model-stats"><span><Heart size={15} /> {number(active.likes)} likes</span><span><Download size={15} /> {number(active.downloads)}</span><span><Star size={15} fill="currentColor" /> {active.rating || 'New'} ({active.reviewCount})</span></div><div className="detail-actions"><button className="primary" onClick={() => onRemix(active)}><Repeat2 size={17} /> {active.document ? 'Remix in Studio' : 'Start your own version'}</button><button className={liked.has(active.id) ? 'active' : ''} onClick={() => toggle(active, 'like')}><Heart size={17} fill={liked.has(active.id) ? 'currentColor' : 'none'} /> Like</button><button className={boosted.has(active.id) ? 'active boost' : 'boost'} onClick={() => toggle(active, 'boost')}><Flame size={17} /> Boost {number(active.boosts)}</button><button className={collected.has(active.id) ? 'active' : ''} onClick={() => toggle(active, 'collect')}><Bookmark size={17} /> {collected.has(active.id) ? 'Saved' : 'Collect'}</button></div>{active.document ? <div className="print-profile-card"><header><span><PackageOpen size={17} /><strong>Editable project included</strong></span></header><p className="showcase-file-note">Open a copy in Studio to edit or export. Print readiness and slicer settings have not been verified.</p><button onClick={() => onRemix(active)}>Open editable copy <ChevronRight size={15} /></button></div> : <div className="inspiration-file-note"><PackageOpen size={21} /><strong>Inspiration preview</strong><p>Editable file not included.</p><small>Start your own version opens a blank project. The pictured design cannot be downloaded or remixed here.</small><button disabled>Model download unavailable</button></div>}</aside></section>
      <section className="detail-content"><article><div className="detail-tabs"><button className={detailTab === 'details' ? 'active' : ''} onClick={() => setDetailTab('details')}>Details</button><button className={detailTab === 'comments' ? 'active' : ''} onClick={() => setDetailTab('comments')}>Ratings & comments <span>{active.reviewCount}</span></button><button className={detailTab === 'remixes' ? 'active' : ''} onClick={() => setDetailTab('remixes')}>Remixes <span>{models.filter((model) => model.remixOf === active.id).length}</span></button></div>{detailTab === 'details' ? <div className="model-description"><h2>{active.document ? 'About this project' : 'Illustration concept'}</h2><p>{active.description}</p><div className="model-tags">{active.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div><h3>{active.document ? 'Before printing' : 'About this preview'}</h3><p>{active.document ? 'Review geometry, wall thickness, supports and material mapping in your slicer before printing. No tested print profile is attached.' : 'This is a sample design illustration. No geometry, measured dimensions or print profile are attached.'}</p>{active.document && <aside><strong>License note</strong><span>{active.license}</span><small>This is the license note saved with this local project.</small></aside>}</div> : detailTab === 'comments' ? <div className="comments-panel"><h2>Ratings & comments</h2><p className="community-comment-notice">Sample comments and ratings illustrate this preview. New comments stay in this local preview and are not sent to other people.</p><div className="comment-compose">{!replyTarget && <div className="rating-picker"><span>Your rating</span>{[1,2,3,4,5].map((value) => <button key={value} aria-label={`Rate ${value} out of 5`} aria-pressed={value === rating} onClick={() => setRating(value)}><Star size={17} fill={value <= rating ? 'currentColor' : 'none'} /></button>)}</div>}{replyTarget && <span className="replying-to">Replying to {replyTarget.author}<button onClick={() => setReplyTarget(null)}><X size={13} /></button></span>}<div><textarea aria-label="Your comment" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Share your print results, settings or a question…" /><button disabled={!commentBody.trim()} onClick={submitComment}><Send size={15} /> Post</button></div></div>{active.comments.map((comment) => <CommentThread key={comment.id} comment={comment} onReply={setReplyTarget} />)}</div> : <div className="remix-panel"><Repeat2 size={28} /><h2>{active.document ? 'Remix this project' : 'Start your own version'}</h2><p>{active.document ? 'Open a copy of the attached source, make your changes, and save it to your local showcase.' : 'Begin with a blank project inspired by this image. The pictured model is not imported.'}</p><button onClick={() => onRemix(active)}>{active.document ? 'Create a remix' : 'Start your own version'}</button>{models.filter((model) => model.remixOf === active.id).map((model) => <ModelCard key={model.id} model={model} onOpen={openModel} saved={collected.has(model.id)} onCollect={(item) => toggle(item, 'collect')} />)}</div>}</article><aside><h3>More like this</h3>{recommendations.map((model) => <button key={model.id} className="recommendation" onClick={() => openModel(model)}><ModelImage model={model} /><span><strong>{model.title}</strong><small>{model.creator}</small><em><Heart size={11} /> {number(model.likes)}</em></span></button>)}</aside></section>
    </main> : page === 'discover' ? <main className="community-main"><aside className="community-sidebar"><strong>Browse</strong>{communityCategories.map((value) => <button key={value} className={category === value ? 'active' : ''} onClick={() => { setCategory(value); if (value === 'New & Notable') setSort('Newest') }}>{value === 'Trending' ? <Flame size={15} /> : value === 'New & Notable' ? <Sparkles size={15} /> : <Box size={15} />}{value}</button>)}<div /><strong>Your library</strong><button onClick={() => setPage('collections')}><Bookmark size={15} /> Collections</button><button onClick={() => setPage('history')}><History size={15} /> History</button><button onClick={() => setPage('profile')}><UserRound size={15} /> Creator profile</button></aside><section className="discover-content"><div className="community-hero community-home-hero"><div><span>Find an idea · make it yours</span><h1>A little inspiration for your next build.</h1><p>Browse sample design ideas, collect your favorites, and save your own editable projects to a local showcase.</p><div className="community-hero-actions"><button onClick={onOpenStudio}>Start creating <ChevronRight size={16} /></button><button className="secondary" onClick={onOpenProjects}><FolderOpen size={15} /> Your projects</button></div></div><img src="/community/articulated-sea-turtle.png" alt="Sample articulated turtle design illustration" /></div><div className="community-feature-strip"><button onClick={() => setCategory('Tools')}><Flame size={20} /><span><strong>Useful tools</strong><small>Ideas for your workspace</small></span></button><button onClick={() => setCategory('Toys & Games')}><Box size={20} /><span><strong>Toys & games</strong><small>Playful design ideas</small></span></button><button onClick={() => setCategory('Home & Garden')}><Sparkles size={20} /><span><strong>Home ideas</strong><small>Practical and beautiful</small></span></button><button onClick={onOpenProjects}><FolderOpen size={20} /><span><strong>Your workshop</strong><small>Collections and drafts</small></span></button></div><div className="discover-toolbar"><div><strong>{category}</strong><span>{filtered.length} showcase items</span></div><select aria-label="Sort community models" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option>Trending</option><option>Newest</option><option>Most downloaded</option></select></div><div className="community-grid">{filtered.map((model) => <ModelCard key={model.id} model={model} onOpen={openModel} saved={collected.has(model.id)} onCollect={(item) => toggle(item, 'collect')} />)}</div></section></main> : <main className="creator-page"><section className="creator-cover"><div /><div className="creator-identity"><span className="community-avatar large">YO</span><span><h1>Your maker profile</h1><p>@you · Building useful things one layer at a time.</p></span><button onClick={() => setPublishOpen(true)}><Plus size={16} /> Add to showcase</button></div><div className="creator-metrics"><span><strong>{models.filter((model) => model.creatorHandle === '@you').length}</strong>Models</span><span><strong>{models.filter((model) => model.creatorHandle === '@you').reduce((sum, model) => sum + model.likes, 0)}</strong>Likes</span><span><strong>{collected.size}</strong>Collections</span></div></section><nav className="profile-tabs"><button className={page === 'profile' ? 'active' : ''} onClick={() => setPage('profile')}><UserRound size={15} /> Models</button><button className={page === 'collections' ? 'active' : ''} onClick={() => setPage('collections')}><Bookmark size={15} /> Collections</button><button className={page === 'history' ? 'active' : ''} onClick={() => setPage('history')}><History size={15} /> History</button></nav><section className="profile-models"><header><div><strong>{page === 'profile' ? 'Your local showcase' : page === 'collections' ? 'Saved collection' : 'Recently viewed'}</strong><span>{profileModels.length} models</span></div></header>{profileModels.length ? <div className="community-grid">{profileModels.map((model) => <ModelCard key={model.id} model={model} onOpen={openModel} saved={collected.has(model.id)} onCollect={(item) => toggle(item, 'collect')} />)}</div> : <div className="empty-community"><PackageOpen size={34} /><strong>{page === 'profile' ? 'Save your first showcase model' : 'Nothing here yet'}</strong><span>{page === 'profile' ? 'Copies of your editable projects will appear here, saved in this browser.' : 'Browse the community and save models to build your library.'}</span><button onClick={() => page === 'profile' ? setPublishOpen(true) : setPage('discover')}>{page === 'profile' ? 'Add to showcase' : 'Browse models'}</button></div>}</section></main>}
    {publishOpen && <PublishModal document={document} onClose={() => setPublishOpen(false)} onPublish={publish} />}
  </div>
}

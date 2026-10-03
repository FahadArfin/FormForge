import { ArrowRight, BookOpen, Box, Check, ChevronDown, Clock3, Copy, Ellipsis, Folder, FolderOpen, Globe2, Grid2X2, HardDrive, Layers3, List, LoaderCircle, LockKeyhole, Plus, Search, Sparkles, Trash2, Upload, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ModelDocument } from '@formforge/model'
import { assignProjectCollection, createProjectCollection, deleteProjectCollection, duplicateProject, listProjectCollections, listProjects, type ProjectCollection, type SavedProject } from '@/lib/db'
import { useEditor } from '@/store/editor'
import { cachedProjectThumbnail, renderProjectThumbnails, thumbnailKey } from '@/lib/projectThumbnails'
import { ThemeToggle, type AppearanceTheme } from './ThemeToggle'
import './ProjectsHome.css'

interface ProjectsHomeProps {
  theme: AppearanceTheme
  onToggleTheme: () => void
  currentDocument: ModelDocument
  onCreate: () => void
  onOpen: (project: SavedProject) => void
  onPublish: (project: SavedProject) => void
  onOpenCommunity: () => void
  onImport?: () => void
  onContinue?: () => void
  onOpenGuide?: () => void
  onStartExample?: () => void
}

function projectDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently edited'
  const days = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (days < 1) return 'Edited today'
  if (days === 1) return 'Edited yesterday'
  return `Edited ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}) })}`
}

export function ProjectsHome({ theme, onToggleTheme, currentDocument, onCreate, onOpen, onPublish, onOpenCommunity, onImport, onContinue, onOpenGuide, onStartExample }: ProjectsHomeProps) {
  const deleteProject = useEditor((state) => state.deleteProject)
  const [projects, setProjects] = useState<SavedProject[]>([])
  const [collections, setCollections] = useState<ProjectCollection[]>([])
  const [activeCollection, setActiveCollection] = useState('all')
  const [newCollectionName, setNewCollectionName] = useState('')
  const [creatingCollection, setCreatingCollection] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recent')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [limit, setLimit] = useState(24)
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({})
  const refresh = useCallback(async () => {
    try {
      const [nextProjects, nextCollections] = await Promise.all([listProjects(), listProjectCollections()])
      setProjects(nextProjects)
      setCollections(nextCollections)
      setError('')
    } catch { setError('We could not load your projects. Check that browser storage is available, then try again.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh, currentDocument.id, currentDocument.updatedAt])
  useEffect(() => { setLimit(24) }, [query, activeCollection, sort])
  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      document.querySelectorAll<HTMLDetailsElement>('.workshop-project-menu[open]').forEach((menu) => {
        if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false
      })
    }
    document.addEventListener('pointerdown', closeMenus)
    return () => document.removeEventListener('pointerdown', closeMenus)
  }, [])
  const collectionProjects = useMemo(() => activeCollection === 'all' ? projects : activeCollection === 'unfiled' ? projects.filter((project) => !project.collectionId) : projects.filter((project) => project.collectionId === activeCollection), [projects, activeCollection])
  const visibleProjects = useMemo(() => {
    const matches = collectionProjects.filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase()))
    return matches.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'oldest' ? a.updatedAt.localeCompare(b.updatedAt) : b.updatedAt.localeCompare(a.updatedAt))
  }, [collectionProjects, query, sort])
  const pageProjects = useMemo(() => visibleProjects.slice(0, limit), [visibleProjects, limit])
  const documentsToPreview = useMemo(() => pageProjects.map((project) => project.document), [pageProjects])
  const collectionName = activeCollection === 'all' ? 'My projects' : activeCollection === 'unfiled' ? 'Unfiled projects' : collections.find((item) => item.id === activeCollection)?.name || 'My projects'

  useEffect(() => {
    const abort = new AbortController()
    void renderProjectThumbnails(documentsToPreview, abort.signal, (key, image) => setThumbnails((previous) => ({ ...previous, [key]: image })))
    return () => abort.abort()
  }, [documentsToPreview])

  const perform = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(id)
    setError('')
    try { await action(); setNotice(success); setDeleteTarget(null); await refresh() }
    catch { setError('That change could not be saved. Your existing projects are still here. Please try again.') }
    finally { setBusyId(null) }
  }
  const addCollection = async () => {
    if (!newCollectionName.trim() || busyId) return
    await perform('collection', async () => {
      const collection = await createProjectCollection(newCollectionName)
      setNewCollectionName(''); setCreatingCollection(false); setActiveCollection(collection.id)
    }, 'Collection created.')
  }
  const setCollection = (value: string) => { setActiveCollection(value); setQuery('') }
  const canContinue = currentDocument.nodes.length > 0 && projects.some((project) => project.id === currentDocument.id) && onContinue

  return <div className="workshop-shell" data-appearance={theme} onKeyDown={(event) => {
    if (event.key === 'Escape' && event.target instanceof Element) {
      const menu = event.target.closest<HTMLDetailsElement>('.workshop-project-menu')
      if (menu?.open) { menu.open = false; menu.querySelector('summary')?.focus(); event.stopPropagation() }
    }
  }}>
    <aside className="workshop-sidebar" aria-label="Workshop navigation">
      <button className="workshop-brand" onClick={() => setCollection('all')} aria-label="FormForge, my projects"><span className="brand-mark"><span /></span><strong>FormForge<span>Your ideas, in shape.</span></strong></button>
      <span className="workshop-nav-label">WORKSPACE</span>
      <nav className="workshop-navigation">
        <button className={activeCollection === 'all' ? 'selected' : ''} onClick={() => setCollection('all')} aria-current={activeCollection === 'all' ? 'page' : undefined}><FolderOpen size={18} /><span>My projects</span><small>{projects.length}</small></button>
        <button onClick={onOpenCommunity}><Globe2 size={18} /><span>Community</span><ArrowRight size={15} /></button>
        {onOpenGuide && <button onClick={onOpenGuide}><BookOpen size={18} /><span>Getting started</span></button>}
      </nav>
      <div className="workshop-collection-heading"><span className="workshop-nav-label">COLLECTIONS</span><button aria-label="Create collection" title="Create collection" onClick={() => setCreatingCollection((value) => !value)}><Plus size={17} /></button></div>
      {creatingCollection && <form className="workshop-collection-form" onSubmit={(event) => { event.preventDefault(); void addCollection() }}><label className="workshop-sr-only" htmlFor="collection-name">Collection name</label><input id="collection-name" autoFocus maxLength={80} placeholder="Collection name" value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setCreatingCollection(false) }} /><button type="submit" disabled={!newCollectionName.trim() || !!busyId} aria-label="Save collection"><Check size={17} /></button><button type="button" onClick={() => setCreatingCollection(false)} aria-label="Cancel collection"><X size={16} /></button></form>}
      <nav className="workshop-navigation workshop-collections" aria-label="Collections">
        <button className={activeCollection === 'unfiled' ? 'selected' : ''} onClick={() => setCollection('unfiled')}><Folder size={17} /><span>Unfiled</span><small>{projects.filter((project) => !project.collectionId).length}</small></button>
        {collections.map((collection) => <div className="workshop-collection-row" key={collection.id}><button className={activeCollection === collection.id ? 'selected' : ''} onClick={() => setCollection(collection.id)}><i style={{ background: collection.color }} /><span>{collection.name}</span><small>{projects.filter((project) => project.collectionId === collection.id).length}</small></button><button className="workshop-remove-collection" title="Remove collection; keep its projects" aria-label={`Remove collection ${collection.name}; keep its projects`} disabled={!!busyId} onClick={() => void perform(collection.id, async () => { await deleteProjectCollection(collection.id); if (activeCollection === collection.id) setActiveCollection('all') }, 'Collection removed. Its projects are now unfiled.')}><X size={14} /></button></div>)}
        {!collections.length && !creatingCollection && <button className="workshop-add-collection" onClick={() => setCreatingCollection(true)}><Plus size={17} /><span>New collection</span></button>}
      </nav>
      <div className="workshop-sidebar-bottom"><div className="workshop-storage"><HardDrive size={19} /><div><strong>Saved on this device</strong><p>Your private projects live in this browser. Export a backup to keep a copy.</p></div></div><div className="workshop-sidebar-footer"><span>Make something yours.</span><ThemeToggle theme={theme} onToggle={onToggleTheme} /></div></div>
    </aside>
    <main className="workshop-main">
      <header className="workshop-topline"><span><span className="workshop-breadcrumb">Workspace</span><span>/</span>{collectionName}</span><span className="workshop-private"><LockKeyhole size={14} /> Your private workspace</span></header>
      <div className="workshop-content">
        <section className="workshop-welcome">
          <div className="workshop-welcome-copy"><span className="workshop-eyebrow"><span /> YOUR PERSONAL WORKSHOP</span><h1>A little idea.<br /><em>A thing you made.</em></h1><p>Make your next useful, playful, completely-you thing.<br className="workshop-wide-break" /> Start from a shape and see where it goes.</p><div className="workshop-create-actions"><button className="workshop-button workshop-button-primary" onClick={onCreate}><Plus size={19} /> New project</button>{onImport && <button className="workshop-button workshop-button-secondary" onClick={onImport}><Upload size={17} /> Import model</button>}</div></div>
          <div className="workshop-welcome-aside">
            {canContinue ? <button className="workshop-continue" onClick={onContinue}><div className="workshop-continue-icon"><Layers3 size={24} /></div><span><small>PICK UP WHERE YOU LEFT OFF</small><strong>{currentDocument.name || 'Untitled project'}</strong><span>{currentDocument.nodes.length} shapes · Continue editing</span></span><ArrowRight size={20} /></button> : <div className="workshop-welcome-note"><span className="workshop-continue-icon"><Box size={25} /></span><strong>Big ideas start small.</strong><span>No installation. No sign-up.<br />Just you and a blank build plate.</span></div>}
            {onStartExample && <button className="workshop-example-link" onClick={onStartExample}><Sparkles size={16} /><span>New here? Try an editable starter project</span><ArrowRight size={15} /></button>}
          </div>
        </section>
        <section className="workshop-library" aria-label="Project library">
          <div className="workshop-library-heading"><div><h2>{collectionName}</h2><span>{collectionProjects.length} project{collectionProjects.length === 1 ? '' : 's'}</span></div><div className="workshop-view-toggle" aria-label="Project view"><button aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 size={17} /></button><button aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={19} /></button></div></div>
          <div className="workshop-mobile-collections"><label><Folder size={16} /><span className="workshop-sr-only">Choose collection</span><select value={activeCollection} onChange={(event) => setCollection(event.target.value)}><option value="all">All projects</option><option value="unfiled">Unfiled</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label><button onClick={() => setCreatingCollection((value) => !value)} aria-label="Create collection"><Plus size={17} /></button></div>
          <div className="workshop-library-toolbar"><label className="workshop-search"><Search size={18} /><span className="workshop-sr-only">Search projects</span><input aria-label="Search projects" placeholder="Search your projects…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={16} /></button>}</label><label className="workshop-sort"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort projects"><option value="recent">Last edited</option><option value="name">Name A–Z</option><option value="oldest">Oldest first</option></select><ChevronDown size={15} /></label></div>
          {error && <div className="workshop-alert" role="alert"><span>{error}</span><button onClick={() => void refresh()}>Try again</button></div>}
          {notice && <div className="workshop-notice" role="status"><Check size={16} /><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={15} /></button></div>}
          {loading ? <div className="workshop-empty" role="status"><LoaderCircle className="workshop-loading" size={26} /><strong>Opening your workshop…</strong><span>Loading the projects saved in this browser.</span></div> : visibleProjects.length ? <>
            {query && <p className="workshop-search-result" role="status">{visibleProjects.length} result{visibleProjects.length === 1 ? '' : 's'} for “{query}”</p>}
            <div className={`workshop-projects workshop-projects-${view}`}>
              {pageProjects.map((project) => {
                const key = thumbnailKey(project.document)
                const thumbnail = thumbnails[key] ?? cachedProjectThumbnail(project.document)
                const empty = !project.document.nodes.length
                return <article key={project.id} className={`workshop-project ${deleteTarget === project.id ? 'workshop-project-confirming' : ''}`}>
                  <button className="workshop-project-preview" onClick={() => onOpen(project)} aria-label={`Open ${project.name || 'Untitled project'}`}>
                    {thumbnail ? <img src={thumbnail} alt="" loading="lazy" /> : <div className="workshop-preview-fallback">{empty ? <Plus size={29} /> : thumbnails[key] === null ? <Box size={29} /> : <LoaderCircle size={23} className="workshop-loading" />}<span>{empty ? 'Blank build plate' : thumbnails[key] === null ? 'Preview unavailable' : 'Rendering your model…'}</span></div>}
                    <span className="workshop-project-badge">{project.publicModelId ? <><Globe2 size={12} /> In showcase</> : <><LockKeyhole size={12} /> Private</>}</span><span className="workshop-open-project">Open project <ArrowRight size={15} /></span>
                  </button>
                  <div className="workshop-project-details"><button className="workshop-project-title" onClick={() => onOpen(project)}><strong>{project.name || 'Untitled project'}</strong><span><Clock3 size={12} />{projectDate(project.updatedAt)}<i />{project.document.nodes.length} shape{project.document.nodes.length === 1 ? '' : 's'}</span></button>
                    <details name="workshop-project-actions" className="workshop-project-menu"><summary aria-label={`Actions for ${project.name || 'Untitled project'}`} title="Project actions"><Ellipsis size={20} /></summary><div className="workshop-project-menu-content"><button disabled={!!busyId} onClick={() => void perform(project.id, () => duplicateProject(project), 'Project duplicated. Your original is unchanged.')}><Copy size={16} /> Duplicate project</button><button onClick={() => onPublish(project)}><Globe2 size={16} />{project.publicModelId ? 'Update local showcase' : 'Save to local showcase'}</button><label><Folder size={16} /><span>Collection</span><select aria-label={`Collection for ${project.name}`} value={project.collectionId ?? ''} disabled={!!busyId} onChange={(event) => { const value = event.target.value; void perform(project.id, () => assignProjectCollection(project.id, value || undefined), 'Project moved.') }}><option value="">Unfiled</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label><button className="workshop-delete-action" disabled={!!busyId} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setDeleteTarget(project.id) }}><Trash2 size={16} />Delete project</button></div></details>
                  </div>
                  {deleteTarget === project.id && <div className="workshop-delete-confirm" role="alert"><strong>Delete “{project.name || 'Untitled project'}”?</strong><p>This removes the local project and its checkpoints.</p><div><button autoFocus className="workshop-button workshop-button-secondary" onClick={(event) => { event.currentTarget.closest('article')?.querySelector('summary')?.focus(); setDeleteTarget(null) }}>Keep project</button><button className="workshop-button workshop-button-danger" disabled={!!busyId} onClick={() => void perform(project.id, () => deleteProject(project.id), 'Project deleted from this device.')}>{busyId === project.id ? 'Deleting…' : 'Delete'}</button></div></div>}
                </article>
              })}
              {view === 'grid' && !query && <button className="workshop-new-card" onClick={onCreate}><span><Plus size={24} /></span><strong>Your next idea</strong><p>Start a new project</p></button>}
            </div>
            {visibleProjects.length > limit && <button className="workshop-button workshop-button-secondary workshop-show-more" onClick={() => setLimit((value) => value + 24)}>Show more projects <ChevronDown size={16} /></button>}
          </> : !error && <div className="workshop-empty"><span className="workshop-empty-icon">{query ? <Search size={28} /> : <FolderOpen size={30} />}</span><strong>{query ? 'No projects found' : activeCollection === 'all' ? 'Your next idea belongs here.' : 'A little room for your ideas.'}</strong><span>{query ? 'Try another name, or clear your search to see every project in this collection.' : activeCollection === 'all' ? 'Start with a simple shape, or bring in a model to make your own.' : 'Move a project here using its collection menu, or create something new.'}</span><button className="workshop-button workshop-button-primary" onClick={query ? () => setQuery('') : onCreate}>{query ? 'Clear search' : <><Plus size={17} />Create a project</>}</button></div>}
        </section>
        <section className="workshop-discover"><span className="workshop-discover-icon"><Users size={24} /></span><div><strong>Good ideas are worth sharing.</strong><p>Explore community models, find inspiration, and make something your own.</p></div><button className="workshop-button workshop-button-secondary" onClick={onOpenCommunity}>Explore community<ArrowRight size={17} /></button></section>
        <footer className="workshop-main-footer"><span><HardDrive size={14} />Saved in this browser. Export a backup to keep a copy.</span><span>From first shape to final print.</span></footer>
      </div>
    </main>
  </div>
}

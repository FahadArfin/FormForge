import { Box, Clock3, Copy, Folder, FolderOpen, Globe2, Plus, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ModelDocument } from '@formforge/model'
import { assignProjectCollection, createProjectCollection, deleteProject, deleteProjectCollection, duplicateProject, listProjectCollections, listProjects, type ProjectCollection, type SavedProject } from '@/lib/db'
import { ThemeToggle, type AppearanceTheme } from './ThemeToggle'

interface ProjectsHomeProps {
  theme: AppearanceTheme
  onToggleTheme: () => void
  currentDocument: ModelDocument
  onCreate: () => void
  onOpen: (project: SavedProject) => void
  onPublish: (project: SavedProject) => void
  onOpenCommunity: () => void
}

function projectDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Recently edited' : `Edited ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

export function ProjectsHome({ theme, onToggleTheme, currentDocument, onCreate, onOpen, onPublish, onOpenCommunity }: ProjectsHomeProps) {
  const [projects, setProjects] = useState<SavedProject[]>([])
  const [collections, setCollections] = useState<ProjectCollection[]>([])
  const [activeCollection, setActiveCollection] = useState<string>('all')
  const [newCollectionName, setNewCollectionName] = useState('')
  const [creatingCollection, setCreatingCollection] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    try {
      const [nextProjects, nextCollections] = await Promise.all([listProjects(), listProjectCollections()])
      setProjects(nextProjects); setCollections(nextCollections)
    } finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [currentDocument.id, currentDocument.updatedAt])
  const visibleProjects = useMemo(() => activeCollection === 'all' ? projects : activeCollection === 'unfiled' ? projects.filter((project) => !project.collectionId) : projects.filter((project) => project.collectionId === activeCollection), [projects, activeCollection])

  const addCollection = async () => {
    if (!newCollectionName.trim()) return
    const collection = await createProjectCollection(newCollectionName)
    setNewCollectionName(''); setCreatingCollection(false); setActiveCollection(collection.id); await refresh()
  }

  return <div className="projects-shell">
    <header className="projects-header"><button className="projects-brand" onClick={onOpenCommunity}><span className="brand-mark"><span /></span><strong>FormForge</strong><em>Projects</em></button><ThemeToggle theme={theme} onToggle={onToggleTheme} /><button className="projects-community" onClick={onOpenCommunity}><Users size={16} /> Explore community</button><button className="projects-new" onClick={onCreate}><Plus size={17} /> New project</button></header>
    <main className="projects-main projects-main-with-sidebar">
      <aside className="project-collections">
        <header><strong>Collections</strong><button aria-label="Create collection" onClick={() => setCreatingCollection(true)}><Plus size={14} /></button></header>
        {creatingCollection && <div className="collection-create"><input autoFocus placeholder="e.g. Solar" value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addCollection(); if (event.key === 'Escape') setCreatingCollection(false) }} /><button onClick={() => void addCollection()}>Add</button></div>}
        <button className={activeCollection === 'all' ? 'active' : ''} onClick={() => setActiveCollection('all')}><FolderOpen size={15} /><span>All projects</span><em>{projects.length}</em></button>
        <button className={activeCollection === 'unfiled' ? 'active' : ''} onClick={() => setActiveCollection('unfiled')}><Folder size={15} /><span>Unfiled</span><em>{projects.filter((project) => !project.collectionId).length}</em></button>
        {collections.map((collection) => <div className="collection-row" key={collection.id}><button className={activeCollection === collection.id ? 'active' : ''} onClick={() => setActiveCollection(collection.id)}><i style={{ background: collection.color }} /><span>{collection.name}</span><em>{projects.filter((project) => project.collectionId === collection.id).length}</em></button><button aria-label={`Delete collection ${collection.name}`} onClick={async () => { await deleteProjectCollection(collection.id); setActiveCollection('all'); await refresh() }}><Trash2 size={12} /></button></div>)}
      </aside>
      <section className="project-content">
        <section className="projects-hero compact"><div><span>Your private workshop</span><h1>Build ideas into collections.</h1><p>Keep every Solar part, enclosure, bracket, and prototype together—then publish only the models you want to share.</p></div><button onClick={onCreate}><Plus size={22} /><strong>Create a new project</strong><span>Start with an empty build plate</span></button></section>
        <section className="projects-library"><header><div><h2>{activeCollection === 'all' ? 'Your projects' : activeCollection === 'unfiled' ? 'Unfiled projects' : collections.find((item) => item.id === activeCollection)?.name}</h2><span>{visibleProjects.length} project{visibleProjects.length === 1 ? '' : 's'}</span></div></header>
          {loading ? <div className="projects-empty"><Clock3 size={24} /><strong>Loading your projects…</strong></div> : visibleProjects.length ? <div className="projects-grid">
            {visibleProjects.map((project) => <article key={project.id} className="project-card"><button className="project-preview" onClick={() => onOpen(project)} aria-label={`Open ${project.name}`}><div className="project-shape"><Box size={42} /></div><span>{project.document.nodes.length} shape{project.document.nodes.length === 1 ? '' : 's'}</span><em className={project.publicModelId ? 'public' : ''}>{project.publicModelId ? 'Public' : 'Private'}</em></button>
              <div className="project-card-copy"><button onClick={() => onOpen(project)}><strong>{project.name || 'Untitled project'}</strong><span>{projectDate(project.updatedAt)}</span></button><button className="project-delete" title="Delete project" onClick={async () => { if (window.confirm(`Delete “${project.name}”?`)) { await deleteProject(project.id); await refresh() } }}><Trash2 size={14} /></button></div>
              <div className="project-card-actions"><select aria-label={`Collection for ${project.name}`} value={project.collectionId ?? ''} onChange={async (event) => { await assignProjectCollection(project.id, event.target.value || undefined); await refresh() }}><option value="">No collection</option>{collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select><button title="Duplicate project" onClick={async () => { await duplicateProject(project); await refresh() }}><Copy size={13} /> Duplicate</button><button className="publish-project" onClick={() => onPublish(project)}><Globe2 size={13} /> {project.publicModelId ? 'Update public' : 'Publish'}</button></div>
            </article>)}
          </div> : <div className="projects-empty"><FolderOpen size={30} /><strong>No projects in this collection</strong><span>Create a model or move an existing project here.</span><button onClick={onCreate}>Create project</button></div>}
        </section>
      </section>
    </main>
  </div>
}

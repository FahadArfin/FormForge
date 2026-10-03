import { readLastOpenedProject,forgetOpenedProject } from './projectResume'
import Dexie, { type EntityTable } from 'dexie'
import type { ModelDocument } from '@formforge/model'

export interface SavedProject {
  id: string
  name: string
  document: ModelDocument
  deletedAt?: string
  thumbnail?: string
  updatedAt: string
  collectionId?: string
  publicModelId?: string
}

export interface ProjectCollection {
  id: string
  name: string
  color: string
  createdAt: string
}

export interface ProjectVersion {
  id: string
  projectId: string
  label: string
  document: ModelDocument
  createdAt: string
}

class FormForgeDatabase extends Dexie {
  projects!: EntityTable<SavedProject, 'id'>
  versions!: EntityTable<ProjectVersion, 'id'>
  collections!: EntityTable<ProjectCollection, 'id'>

  constructor() {
    super('formforge')
    this.version(1).stores({
      projects: 'id, name, updatedAt',
      versions: 'id, projectId, createdAt',
    })
    this.version(3).stores({projects:'id, name, collectionId, updatedAt, deletedAt',versions:'id, projectId, createdAt',collections:'id, name, createdAt'})
    this.version(2).stores({
      projects: 'id, name, collectionId, updatedAt',
      versions: 'id, projectId, createdAt',
      collections: 'id, name, createdAt',
    })
  }
}

export const db = new FormForgeDatabase()

export async function saveProject(document: ModelDocument) {
  await db.transaction('rw',db.projects,async()=>{
  const existing = await db.projects.get(document.id)
  if(existing?.deletedAt)throw new Error('This project is in Trash. Restore it before saving.')
  await db.projects.put({
    id: document.id,
    name: document.name,
    document,
    updatedAt: document.updatedAt,
    collectionId: existing?.collectionId,
    publicModelId: existing?.publicModelId,
  })
  })
}

export async function loadMostRecentProject() {
  const id=readLastOpenedProject()
  if(id){const project=await loadProject(id);if(project)return project}
  return db.projects.orderBy('updatedAt').filter(p=>!p.deletedAt).last()
}

export async function listProjects() {
  return db.projects.orderBy('updatedAt').reverse().filter(p=>!p.deletedAt).toArray()
}

export async function loadProject(projectId: string) {
  const project=await db.projects.get(projectId)
  return project?.deletedAt?undefined:project
}

export async function deleteProject(projectId: string) {
  await db.projects.update(projectId,{deletedAt:new Date().toISOString()})
  forgetOpenedProject(projectId)
}
export async function listTrashedProjects(){return db.projects.orderBy('deletedAt').reverse().filter(p=>!!p.deletedAt).toArray()}
export async function restoreProject(projectId:string){
 await db.transaction('rw',db.projects,async()=>{const project=await db.projects.get(projectId);if(!project?.deletedAt)throw new Error('This project is no longer in Trash.');await db.projects.update(projectId,{deletedAt:undefined})})
}

export async function listProjectCollections() {
  return db.collections.orderBy('name').toArray()
}

export async function createProjectCollection(name: string, color = '#8589f7') {
  const collection: ProjectCollection = { id: crypto.randomUUID(), name: name.trim() || 'New collection', color, createdAt: new Date().toISOString() }
  await db.collections.add(collection)
  return collection
}

export async function deleteProjectCollection(collectionId: string) {
  await db.transaction('rw', db.projects, db.collections, async () => {
    const projects = await db.projects.where('collectionId').equals(collectionId).toArray()
    await Promise.all(projects.map((project) => db.projects.update(project.id, { collectionId: undefined })))
    await db.collections.delete(collectionId)
  })
}

export async function assignProjectCollection(projectId: string, collectionId?: string) {
  await db.projects.update(projectId, { collectionId })
}

export async function duplicateProject(project: SavedProject) {
  const now = new Date().toISOString()
  const document = structuredClone(project.document)
  document.id = crypto.randomUUID()
  document.name = `${project.name || 'Untitled project'} — Copy`
  document.createdAt = now
  document.updatedAt = now
  document.revision = 0
  const copy: SavedProject = { id: document.id, name: document.name, document, updatedAt: now, collectionId: project.collectionId }
  await db.projects.add(copy)
  return copy
}

export async function markProjectPublic(projectId: string, publicModelId: string) {
  await db.projects.update(projectId, { publicModelId })
}

export async function saveVersion(document: ModelDocument, label?: string) {
  const createdAt = new Date().toISOString()
  const version: ProjectVersion = {
    id: crypto.randomUUID(),
    projectId: document.id,
    label: label?.trim() || `Checkpoint ${new Date(createdAt).toLocaleString()}`,
    document: structuredClone(document),
    createdAt,
  }
  await db.versions.put(version)

  const versions = await db.versions.where('projectId').equals(document.id).sortBy('createdAt')
  const stale = versions.slice(0, Math.max(0, versions.length - 25))
  if (stale.length) await db.versions.bulkDelete(stale.map((item) => item.id))
  return version
}

export async function listVersions(projectId: string) {
  const versions = await db.versions.where('projectId').equals(projectId).sortBy('createdAt')
  return versions.reverse()
}

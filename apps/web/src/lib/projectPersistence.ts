import type { ModelDocument } from '@formforge/model'

export interface ProjectSaveState {
  saveStatus: 'saving' | 'saved' | 'error'
  saveError: string | null
  lastSavedAt: string | null
}

interface SaveRequest {
  document: ModelDocument
  generation: number
  timer?: ReturnType<typeof setTimeout>
}

/** Documents are immutable store snapshots; keep each project's pending save when switching projects. */
export function createProjectPersistence(
  write: (document: ModelDocument) => Promise<void>,
  onState: (document: ModelDocument, state: ProjectSaveState) => void,
  delay = 500,
) {
  const pending = new Map<string, SaveRequest>()
  const generations = new Map<string, number>()
  const queues = new Map<string, Promise<void>>()
  const deletions = new Map<string, Promise<void>>()
  const savedTimes = new Map<string, string>()

  const update = (request: SaveRequest, saveStatus: ProjectSaveState['saveStatus'], saveError: string | null = null) => {
    if (generations.get(request.document.id) !== request.generation) return
    onState(request.document, { saveStatus, saveError, lastSavedAt: savedTimes.get(request.document.id) ?? null })
  }

  const prepare = (document: ModelDocument): SaveRequest => {
    const previous = pending.get(document.id)
    if (previous?.timer) clearTimeout(previous.timer)
    pending.delete(document.id)
    const generation = (generations.get(document.id) ?? 0) + 1
    generations.set(document.id, generation)
    const request = { document, generation }
    update(request, 'saving')
    return request
  }

  const enqueue = (request: SaveRequest) => {
    const id = request.document.id
    // Serial writes prevent an older, slower write overwriting the latest revision.
    const previous = queues.get(id) ?? Promise.resolve()
    const operation = previous.then(async () => {
      try {
        await write(structuredClone(request.document))
        savedTimes.set(id, new Date().toISOString())
        update(request, 'saved')
      } catch (error) {
        update(request, 'error', error instanceof Error ? error.message : 'Could not save this project on your device.')
        throw error
      }
    })
    // A rejected save must not poison the queue or become an unhandled autosave rejection.
    const settled = operation.catch(() => undefined)
    queues.set(id, settled)
    void settled.then(() => { if (queues.get(id) === settled) queues.delete(id) })
    return operation
  }

  return {
    schedule(document: ModelDocument) {
      const request = prepare(document)
      if (deletions.has(document.id)) {
        update(request, 'error', 'This project is being deleted. Create a new project to continue editing.')
        return
      }
      request.timer = setTimeout(() => {
        pending.delete(document.id)
        void enqueue(request).catch(() => undefined)
      }, delay)
      pending.set(document.id, request)
    },
    saveNow(document: ModelDocument) {
      const request = prepare(document)
      if (deletions.has(document.id)) {
        const error = new Error('This project is being deleted. Create a new project to continue editing.')
        update(request, 'error', error.message)
        return Promise.reject(error)
      }
      return enqueue(request)
    },
    remove(projectId: string, erase: () => Promise<void>) {
      const existing = deletions.get(projectId)
      if (existing) return existing
      const delayed = pending.get(projectId)
      if (delayed?.timer) clearTimeout(delayed.timer)
      pending.delete(projectId)
      generations.set(projectId, (generations.get(projectId) ?? 0) + 1)
      // Erase after the last issued write finishes, so none can recreate the deleted project.
      const operation = (queues.get(projectId) ?? Promise.resolve()).then(erase).then(() => {
        savedTimes.delete(projectId)
      }).finally(() => {
        deletions.delete(projectId)
      })
      deletions.set(projectId, operation)
      return operation
    },
    restored(document: ModelDocument) {
      // Stored updatedAt is the edit time, not evidence of when a save completed.
      const request = prepare(document)
      update(request, 'saved')
    },
  }
}

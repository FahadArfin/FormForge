import type { MeshPayload, ModelDocument } from '@formforge/model'

type WorkerResponse = ({ id: number; ok: true } & MeshPayload) | { id: number; ok: false; error: string }

class GeometryClient {
  private worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' })
  private requestId = 0
  private active: Job | null = null
  private queued: Job | null = null
  private cache = new Map<ModelDocument, MeshPayload>()

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const job = this.active
      if (!job || job.id !== event.data.id) return
      this.active = null
      if (event.data.ok) {
        const mesh: MeshPayload = event.data
        this.cache.set(job.document, mesh)
        while (this.cache.size > 12) this.cache.delete(this.cache.keys().next().value!)
        job.resolve(mesh)
      } else job.reject(new Error(event.data.error))
      this.pump()
    }
  }

  evaluate(document: ModelDocument) {
    // Imports and branched edits may reuse all metadata. Only the identical
    // immutable document snapshot can safely reuse its evaluated geometry.
    const cached = this.cache.get(document)
    if (cached) return Promise.resolve(cached)
    const id = ++this.requestId
    return new Promise<MeshPayload>((resolve, reject) => {
      if (this.queued) this.queued.reject(new DOMException('Superseded by a newer model revision', 'AbortError'))
      this.queued = { id, document, resolve, reject }
      this.pump()
    })
  }

  private pump() {
    if (this.active || !this.queued) return
    this.active = this.queued
    this.queued = null
    this.worker.postMessage({ id: this.active.id, document: this.active.document })
  }
}

interface Job {
  id: number
  document: ModelDocument
  resolve: (mesh: MeshPayload) => void
  reject: (error: Error) => void
}

export const geometryClient = new GeometryClient()

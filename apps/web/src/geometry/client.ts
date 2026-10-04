import type { MeshPayload, ModelDocument } from '@formforge/model'

type WorkerResponse = ({ id: number; ok: true } & MeshPayload) | { id: number; ok: false; error: string }

export class GeometryClient {
  private worker: Worker | null = null
  private disposed: Error | null = null
  private requestId = 0
  private active: Job | null = null
  private queued: Job | null = null
  private cache = new Map<ModelDocument, MeshPayload>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private cachedBytes = 0

  constructor(private options: { timeoutMs?: number; cacheBytes?: number } = {}) {}

  private createWorker() {
    const worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (this.worker !== worker || this.disposed) return
      const job = this.active
      if (!job || job.id !== event.data.id) return
      this.clearTimer()
      this.active = null
      if (event.data.ok) {
        const mesh: MeshPayload = event.data
        const previous = this.cache.get(job.document)
        if (previous) this.cachedBytes -= previous.positions.byteLength + previous.indices.byteLength
        this.cache.set(job.document, mesh)
        this.cachedBytes += mesh.positions.byteLength + mesh.indices.byteLength
        while (this.cache.size > 6 || this.cachedBytes > (this.options.cacheBytes ?? 64 * 1024 * 1024)) {
          const key = this.cache.keys().next().value!
          const removed = this.cache.get(key)!
          this.cachedBytes -= removed.positions.byteLength + removed.indices.byteLength
          this.cache.delete(key)
        }
        job.resolve(mesh)
      } else job.reject(new Error(event.data.error))
      this.pump()
    }
    worker.onerror = event => { event.preventDefault(); if (this.worker === worker) this.fail(new Error(event.message || 'The geometry worker failed. Please retry.')) }
    worker.onmessageerror = () => { if (this.worker === worker) this.fail(new Error('The geometry worker returned unreadable data. Please retry.')) }
    return worker
  }

  private fail(error: Error) {
    this.clearTimer()
    this.active?.reject(error)
    this.queued?.reject(error)
    this.active = null
    this.queued = null
    this.worker?.terminate()
    this.worker = null
    this.cache.clear()
    this.cachedBytes = 0
  }

  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null }

  /** Terminate work immediately; unlike disposal this client can be used again. */
  cancel() { this.fail(new DOMException('Model build stopped. Your editable design is preserved.', 'AbortError')) }

  /** Isolated callers own their worker and must release it after success, failure, or cancellation. */
  dispose(reason: Error = new DOMException('Geometry evaluation cancelled.', 'AbortError')) {
    if (this.disposed) return
    this.disposed = reason
    this.fail(reason)
  }

  evaluate(document: ModelDocument, options: { replaceActive?: boolean } = {}) {
    if (this.disposed) return Promise.reject(this.disposed)
    if (options.replaceActive && this.active) this.cancel()
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
    try {
      this.worker ??= this.createWorker()
      this.timer = setTimeout(() => this.fail(new Error('Model build timed out. Undo a complex edit, simplify the model, or retry.')), this.options.timeoutMs ?? 60_000)
      this.worker.postMessage({ id: this.active.id, document: this.active.document })
    } catch (error) { this.fail(error instanceof Error ? error : new Error('The geometry worker could not start.')) }
  }
}

interface Job {
  id: number
  document: ModelDocument
  resolve: (mesh: MeshPayload) => void
  reject: (error: Error) => void
}

export const geometryClient = new GeometryClient()

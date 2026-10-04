import type { ModelDocument } from '@formforge/model'
import { evaluateSnapshot } from '../geometry/evaluateSnapshot'
import type { MeshDoctorResult, MeshInspectionJob, MeshInspectionResponse } from '../geometry/meshInspection.worker'
import { createExportDocument } from './exportScope'
import { INSPECTION_TIMEOUT_MS, validateInspectionMesh, type MeshProperties } from './meshInspection'
import type { MeshData } from './meshTools'
export type { MeshDoctorResult } from '../geometry/meshInspection.worker'
export type PropertyScope = 'whole' | 'selected'
const cancelled = () => new DOMException('Mesh inspection cancelled.', 'AbortError')

async function bounded<T>(work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw cancelled()
  const controller = new AbortController()
  let rejectInterrupted: (reason: Error) => void = () => undefined
  const interruption = new Promise<never>((_, reject) => { rejectInterrupted = reject })
  const cancel = () => { rejectInterrupted(cancelled()); controller.abort() }
  signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => {
    rejectInterrupted(new Error('Inspection reached its 20-second limit. Try a smaller part.'))
    controller.abort()
  }, INSPECTION_TIMEOUT_MS)
  try { return await Promise.race([work(controller.signal), interruption]) }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); controller.abort() }
}

function inspectInWorker(job: MeshInspectionJob, signal: AbortSignal): Promise<MeshDoctorResult | MeshProperties> {
  if (signal.aborted) return Promise.reject(cancelled())
  validateInspectionMesh(job.mesh, job.kind === 'doctor')
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../geometry/meshInspection.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const finish = (error?: Error, result?: MeshDoctorResult | MeshProperties) => {
      if (settled) return
      settled = true; signal.removeEventListener('abort', cancel); worker.terminate()
      if (error) reject(error); else resolve(result!)
    }
    const cancel = () => finish(cancelled())
    signal.addEventListener('abort', cancel, { once: true })
    worker.onmessage = (event: MessageEvent<MeshInspectionResponse>) => event.data.ok ? finish(undefined, event.data.result) : finish(new Error(event.data.error))
    worker.onerror = event => { event.preventDefault(); finish(new Error(event.message || 'The mesh inspection worker failed.')) }
    worker.onmessageerror = () => finish(new Error('The inspection worker returned unreadable data.'))
    try { worker.postMessage(job) } catch (error) { finish(error instanceof Error ? error : new Error('The mesh could not be sent for inspection.')) }
  })
}

export function inspectSourceMesh(mesh: MeshData, signal?: AbortSignal): Promise<MeshDoctorResult> {
  return bounded(async abort => await inspectInWorker({ kind: 'doctor', mesh }, abort) as MeshDoctorResult, signal)
}

/** Evaluate a captured export scope independently of preview builds, with one deadline for the entire job. */
export function inspectDocumentProperties(document: ModelDocument, scope: PropertyScope, selectedIds: string[], signal?: AbortSignal): Promise<MeshProperties> {
  return bounded(async abort => {
    const snapshot = scope === 'selected' ? createExportDocument(document, selectedIds) : document
    const mesh = await evaluateSnapshot(snapshot, abort)
    if (abort.aborted) throw cancelled()
    return await inspectInWorker({ kind: 'properties', mesh }, abort) as MeshProperties
  }, signal)
}

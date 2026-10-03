import type { MeshPayload, ModelDocument } from '@formforge/model'
import { GeometryClient } from './client'

/** Evaluate a captured document without superseding the editor's pending build. */
export async function evaluateSnapshot(document: ModelDocument, signal?: AbortSignal): Promise<MeshPayload> {
  const aborted = () => new DOMException('Model evaluation cancelled.', 'AbortError')
  if (signal?.aborted) throw aborted()
  const client = new GeometryClient()
  let rejectInterrupted: (reason: Error) => void = () => undefined
  const interruption = new Promise<never>((_, reject) => { rejectInterrupted = reject })
  const cancel = () => rejectInterrupted(aborted())
  signal?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(() => rejectInterrupted(new Error('Model evaluation timed out. Simplify the model or retry.')), 60_000)
  try {
    return await Promise.race([client.evaluate(document), interruption])
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
    client.dispose()
  }
}
